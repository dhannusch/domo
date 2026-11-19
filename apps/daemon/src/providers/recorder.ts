import { AgentEvent } from "@domo/domain"
import { Effect, FileSystem, Schema, Stream } from "effect"

const encodeLine = Schema.encodeEffect(Schema.fromJsonString(AgentEvent))

/**
 * Appends every event to a JSONL file, producing fixtures that FakeProvider
 * replays. Used by `domo ask --record` and by the Lab to grow its replay set.
 */
export const recordTo =
  (path: string) =>
  <E, R>(stream: Stream.Stream<AgentEvent, E, R>) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(path, "")
        return stream.pipe(
          Stream.tap((event) =>
            encodeLine(event).pipe(
              Effect.flatMap((line) => fs.writeFileString(path, `${line}\n`, { flag: "a" })),
              Effect.orDie,
            ),
          ),
        )
      }).pipe(Effect.orDie),
    )
