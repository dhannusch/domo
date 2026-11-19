import { AgentEvent } from "@domo/domain"
import { Effect, FileSystem, Layer, Ref, Schema, Stream } from "effect"
import { ProviderError, Providers, type RunRequest } from "./Providers.ts"

const decodeLine = Schema.decodeUnknownEffect(Schema.fromJsonString(AgentEvent))

/** Reads a recorded run (one AgentEvent JSON per line). */
export const loadFixture = Effect.fn("FakeProvider.loadFixture")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem
  const content = yield* fs.readFileString(path)
  const lines = content.split("\n").filter((line) => line.trim().length > 0)
  return yield* Effect.forEach(lines, (line) => decodeLine(line))
})

const withRunId = (event: AgentEvent, request: RunRequest): AgentEvent => ({
  ...event,
  runId: request.runId,
})

/**
 * Deterministic provider for tests and Lab gates: each `run` replays the next
 * scripted fixture. No live model calls, ever.
 */
export const layerScripted = (runs: ReadonlyArray<ReadonlyArray<AgentEvent>>) =>
  Layer.effect(
    Providers,
    Effect.gen(function* () {
      const queue = yield* Ref.make(runs)
      const run = (request: RunRequest) =>
        Stream.unwrap(
          Ref.modify(queue, (remaining) => [remaining[0], remaining.slice(1)] as const).pipe(
            Effect.flatMap((next) =>
              next === undefined
                ? Effect.fail(
                    new ProviderError({ provider: "fake", message: "no scripted run left" }),
                  )
                : Effect.succeed(Stream.fromIterable(next.map((e) => withRunId(e, request)))),
            ),
          ),
        )
      return Providers.of({ run })
    }),
  )
