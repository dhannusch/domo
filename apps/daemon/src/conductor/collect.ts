import type { AgentEvent, RunDetail, Usage } from "@domo/domain"
import { Effect, Option, Stream } from "effect"
import type { Delegation } from "../chat/ChatBus.ts"
import type { ProviderError } from "../providers/Providers.ts"
import { describeTool, type ToolAction } from "./describeTool.ts"

export interface ToolCall extends ToolAction {
  readonly name: string
  readonly ok: boolean
  readonly summary: string
}

/** Everything one provider run produced, folded from its event stream. */
export interface RunOutcome {
  readonly streamed: string
  readonly completed: string
  readonly failure: Option.Option<string>
  readonly sessionId: string | undefined
  readonly tools: ReadonlyArray<ToolCall>
  readonly files: ReadonlyArray<string>
  readonly usage: Usage | undefined
  /** Tool calls by id that haven't finished yet. */
  readonly pending: ReadonlyMap<string, { readonly name: string } & ToolAction>
  /** A tool ran since the last text, so the next text starts a new paragraph. */
  readonly afterTool: boolean
}

export interface RunHooks {
  readonly onSession: (sessionId: string) => Effect.Effect<void>
  readonly onDelta: (text: string) => Effect.Effect<void>
  readonly onTool: (name: string, count: number) => Effect.Effect<void>
}

/**
 * Not counted as tools: Domo's own tools (UI components are part of the reply;
 * delegations and councils get their own receipt wording), and
 * bookkeeping tools (loading tool definitions, internal todo lists) do nothing
 * the user would want to inspect.
 */
export const isDomoUiTool = (name: string) =>
  /^(mcp__domo__|domo\.)/.test(name) || /^(ToolSearch|TodoWrite|TodoRead)$/.test(name)

const initial = (sessionId: string | undefined): RunOutcome => ({
  streamed: "",
  completed: "",
  failure: Option.none(),
  sessionId,
  tools: [],
  files: [],
  usage: undefined,
  pending: new Map(),
  afterTool: false,
})

/** Codex delivers whole messages; Claude streams token deltas. */
const appendText = (current: string, delta: string, wholeMessages: boolean) =>
  current.length > 0 && wholeMessages ? `${current}\n\n${delta}` : current + delta

export const collectRun = (
  events: Stream.Stream<AgentEvent, ProviderError>,
  options: { readonly sessionId: string | undefined; readonly wholeMessages: boolean },
  hooks: RunHooks,
): Effect.Effect<RunOutcome> =>
  events.pipe(
    Stream.runFoldEffect(
      () => initial(options.sessionId),
      (acc, event): Effect.Effect<RunOutcome> => {
        switch (event._tag) {
          case "RunStarted":
            return hooks
              .onSession(event.sessionId)
              .pipe(Effect.as({ ...acc, sessionId: event.sessionId }))
          case "TextDelta": {
            // Text written after a tool call (e.g. after showing a card) is a new paragraph.
            const text =
              acc.afterTool && !options.wholeMessages && acc.streamed.length > 0
                ? `\n\n${event.text}`
                : event.text
            return hooks.onDelta(text).pipe(
              Effect.as({
                ...acc,
                afterTool: false,
                streamed: appendText(acc.streamed, text, options.wholeMessages),
              }),
            )
          }
          case "ToolStarted": {
            const next = { ...acc, afterTool: true }
            if (isDomoUiTool(event.name)) {
              // Long-running Domo tools still show progress; they just aren't counted as tools.
              return /(council|delegate)$/.test(event.name)
                ? hooks
                    .onTool(event.name, next.tools.length + next.pending.size)
                    .pipe(Effect.as(next))
                : Effect.succeed(next)
            }
            const pending = new Map(next.pending).set(event.callId, {
              name: event.name,
              ...describeTool(event.name, event.input),
            })
            return hooks
              .onTool(event.name, next.tools.length + pending.size)
              .pipe(Effect.as({ ...next, pending }))
          }
          case "ToolFinished": {
            const call = acc.pending.get(event.callId)
            if (call === undefined) return Effect.succeed(acc)
            const pending = new Map(acc.pending)
            pending.delete(event.callId)
            return Effect.succeed({
              ...acc,
              pending,
              tools: [...acc.tools, { ...call, ok: event.ok, summary: event.summary }],
            })
          }
          case "FileChanged":
            return Effect.succeed(
              acc.files.includes(event.path) ? acc : { ...acc, files: [...acc.files, event.path] },
            )
          case "RunCompleted":
            return Effect.succeed({ ...acc, completed: event.text, usage: event.usage })
          case "RunFailed":
            return Effect.succeed({ ...acc, failure: Option.some(event.message) })
        }
      },
    ),
    Effect.catch((error) =>
      Effect.succeed({ ...initial(options.sessionId), failure: Option.some(error.message) }),
    ),
  )

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * "Asked 3 models, ran 2 tools, edited 1 file" — or nothing, when the reply
 * was pure prose. `nameOf` turns a model key into a label ("Codex").
 */
export const workSummary = (
  outcome: RunOutcome,
  delegations: ReadonlyArray<Delegation> = [],
  nameOf: (key: string) => string = (key) => key,
): string | undefined => {
  const tools = outcome.tools.length + outcome.pending.size
  const council = delegations.filter((d) => d.kind === "council").length
  const handedTo = [
    ...new Set(delegations.filter((d) => d.kind === "delegate").map((d) => nameOf(d.model))),
  ]
  if (tools === 0 && outcome.files.length === 0 && delegations.length === 0) return undefined
  const failed = outcome.tools.filter((t) => !t.ok).length
  const parts = [
    council > 0 ? `asked ${plural(council, "model")}` : undefined,
    handedTo.length > 0 ? `handed off to ${handedTo.join(" and ")}` : undefined,
    tools > 0 ? `ran ${plural(tools, "tool")}` : undefined,
    outcome.files.length > 0 ? `edited ${plural(outcome.files.length, "file")}` : undefined,
    failed > 0 ? `${failed} failed` : undefined,
  ].filter((part) => part !== undefined)
  const line = parts.join(", ")
  return line.charAt(0).toUpperCase() + line.slice(1)
}

export const runDetail = (
  outcome: RunOutcome,
  id: RunDetail["id"],
  model: string,
  delegations: ReadonlyArray<Delegation> = [],
): RunDetail => ({
  id,
  model,
  ...(delegations.length === 0 ? {} : { delegations }),
  tools: [
    ...outcome.tools,
    ...[...outcome.pending.values()].map((call) => ({
      ...call,
      ok: false,
      summary: "did not finish",
    })),
  ],
  files: outcome.files,
  ...(outcome.usage === undefined ? {} : { usage: outcome.usage }),
})
