import { randomUUID } from "node:crypto"
import { type AgentEvent, parseModelRef, RunId } from "@domo/domain"
import { Console, Effect, Option, Ref, Stream } from "effect"
import { Providers } from "../providers/Providers.ts"
import { recordTo } from "../providers/recorder.ts"

export interface AskOptions {
  readonly prompt: string
  readonly model: string
  readonly cwd: Option.Option<string>
  readonly resume: Option.Option<string>
  readonly record: Option.Option<string>
  /** Single tool-less turn with these instructions (see RunRequest.mode). */
  readonly utility: Option.Option<string>
}

const write = (text: string) => Effect.sync(() => process.stdout.write(text))

const render = (event: AgentEvent): Effect.Effect<void> => {
  switch (event._tag) {
    case "RunStarted":
      return Effect.void
    case "TextDelta":
      return write(event.text)
    case "ToolStarted":
      return Console.error(`  · ${event.name}`)
    case "ToolFinished":
      return event.ok ? Effect.void : Console.error(`  ✗ ${event.summary}`)
    case "FileChanged":
      return Console.error(`  ✎ ${event.path}`)
    case "RunCompleted":
      return Console.error(
        `\n— ${event.usage.inputTokens} in · ${event.usage.outputTokens} out · ${event.usage.cachedInputTokens} cached`,
      )
    case "RunFailed":
      return Console.error(`\n✗ ${event.message}`)
  }
}

/** One-shot run against any model from either provider (smoke test + fixture recording). */
export const ask = Effect.fn("ask")(
  function* (options: AskOptions) {
    const model = yield* parseModelRef(options.model)
    const providers = yield* Providers
    const runId = RunId.make(randomUUID())

    const events = providers.run({
      runId,
      model,
      prompt: options.prompt,
      ...Option.match(options.cwd, { onNone: () => ({}), onSome: (cwd) => ({ cwd }) }),
      ...Option.match(options.resume, {
        onNone: () => ({}),
        onSome: (sessionId) => ({ sessionId }),
      }),
    })
    const recorded = Option.match(options.record, {
      onNone: () => events,
      onSome: (path) => events.pipe(recordTo(path)),
    })

    const sessionId = yield* Ref.make("")
    yield* recorded.pipe(
      Stream.runForEach((event) =>
        event._tag === "RunStarted" ? Ref.set(sessionId, event.sessionId) : render(event),
      ),
    )
    const session = yield* Ref.get(sessionId)
    if (session.length > 0) yield* Console.error(`session ${model.provider}:${session}`)
  },
  Effect.catchTags({
    ProviderError: (error) => Console.error(`${error.provider}: ${error.message}`),
    InvalidModelRef: (error) =>
      Console.error(`Unknown model "${error.input}". Use provider:model, e.g. codex:default`),
  }),
)
