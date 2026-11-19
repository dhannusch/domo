import { randomUUID } from "node:crypto"
import { ComponentId, Message, type ModelRef, RunId } from "@domo/domain"
import { Effect, Option } from "effect"
import type { ChatBus } from "../chat/ChatBus.ts"
import type { ChatStore } from "../chat/ChatStore.ts"
import { RUN_HEADER } from "../mcp/DomoMcp.ts"
import type { Providers } from "../providers/Providers.ts"
import { collectRun, type RunOutcome, runDetail, workSummary } from "./collect.ts"

export interface TurnDeps {
  readonly store: ChatStore["Service"]
  readonly bus: ChatBus["Service"]
  readonly providers: Providers["Service"]
  readonly mcp: { readonly url: string; readonly headers: Readonly<Record<string, string>> }
  readonly systemPrompt: Effect.Effect<string>
  readonly nameOf: (key: string) => string
}

export interface TurnInput {
  /** The agent message this turn writes into (already shown as streaming). */
  readonly message: Message
  readonly model: ModelRef
  readonly prompt: string
  readonly sessionId?: string
  readonly cwd?: string
  readonly onSession?: (sessionId: string) => Effect.Effect<void>
  /** Always show a receipt, with this summary when the run did no tool work (background tasks). */
  readonly receiptFallback?: string
}

export interface TurnResult {
  readonly finished: Message
  readonly outcome: RunOutcome
}

/**
 * Runs one agent turn into a message: Domo's tools attached (the run is
 * registered so tool calls land on this message), deltas streamed, guarded
 * actions checked live, and the work receipt built from what actually ran.
 */
export const makeTurn = ({ store, bus, providers, mcp, systemPrompt, nameOf }: TurnDeps) =>
  Effect.fnUntraced(function* (input: TurnInput) {
    const { message } = input
    const runId = RunId.make(randomUUID())
    yield* bus.registerRun(runId, { messageId: message.id, topicId: message.topicId })
    const outcome = yield* collectRun(
      providers.run({
        runId,
        model: input.model,
        prompt: input.prompt,
        systemPrompt: yield* systemPrompt,
        mcp: { url: mcp.url, headers: { ...mcp.headers, [RUN_HEADER]: runId } },
        // Live: an approval given through ask_user mid-run unlocks that action right away.
        isApproved: (action) => Effect.runSync(bus.isApproved(runId, action)),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      }),
      { sessionId: input.sessionId, wholeMessages: input.model.provider === "codex" },
      {
        onSession: input.onSession ?? (() => Effect.void),
        onDelta: (text) => bus.publish({ _tag: "AgentDelta", messageId: message.id, text }),
        onTool: (current, tools) =>
          bus.publish({ _tag: "WorkProgress", messageId: message.id, tools, current }),
      },
    ).pipe(Effect.ensuring(bus.unregisterRun(runId)))

    const body = outcome.completed.length > 0 ? outcome.completed : outcome.streamed
    const failed = Option.isSome(outcome.failure)
    const delegations = yield* bus.takeDelegations(runId)
    const summary = workSummary(outcome, delegations, nameOf) ?? input.receiptFallback
    if (summary !== undefined)
      yield* store.saveRun(message.id, runDetail(outcome, runId, input.model.key, delegations))

    // Re-read: a render_* or ask_user tool may have put a component on the message during the run.
    const latest = Option.getOrElse(yield* store.getMessage(message.id), () => message)
    const finished = new Message({
      ...latest,
      text: body.length > 0 ? body : Option.getOrElse(outcome.failure, () => ""),
      status: failed ? "failed" : "done",
      ...(summary === undefined
        ? {}
        : {
            work: {
              _tag: "WorkReceipt",
              id: ComponentId.make(randomUUID()),
              runId,
              status: failed ? "failed" : "done",
              summary,
              models: [...new Set([input.model.key, ...delegations.map((d) => d.model)])],
              ...(input.cwd === undefined ? {} : { project: input.cwd }),
            },
          }),
    })
    yield* store.updateMessage(finished)
    yield* bus.publish({ _tag: "AgentFinished", message: finished })
    return { finished, outcome } satisfies TurnResult
  })
