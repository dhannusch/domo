import { randomUUID } from "node:crypto"
import { TidyId, TopicId } from "@domo/domain"
import { Clock, Context, DateTime, Effect, Layer, Option, Ref, Schedule, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ChatStore } from "../chat/ChatStore.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { Settings } from "../settings/Settings.ts"
import { Presence } from "./Presence.ts"
import { selectFolds } from "./selectFolds.ts"

const decodeTopicIds = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(TopicId)))

/**
 * Quiet tidying: once per absence, after every device has been idle for the
 * away period, folds finished topics into "Earlier". Nothing moves while the
 * user is present, nothing is deleted, and each tidy can be undone.
 */
export class Tidier extends Context.Service<
  Tidier,
  {
    /** Runs one tidy now (the loop calls this when the user is away). */
    readonly tidy: Effect.Effect<Option.Option<{ readonly id: TidyId; readonly topics: number }>>
    undo(id: TidyId): Effect.Effect<void>
    /** When the latest tidy ran (epoch ms): reversible things stay undoable until then. */
    readonly lastTidyMs: Effect.Effect<Option.Option<number>>
  }
>()("domo/presence/Tidier") {
  static readonly layer = Layer.effect(
    Tidier,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const settings = yield* Settings
      const store = yield* ChatStore
      const presence = yield* Presence

      const tidy = Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const folds = selectFolds(yield* store.tidyCandidates, {
          readSeq: yield* presence.readSeq,
          nowMs,
        })
        if (folds.length === 0) return Option.none()
        const id = TidyId.make(randomUUID())
        yield* store.setFolded(folds, true)
        yield* sql`
          INSERT INTO tidies (id, at, topic_ids) VALUES (${id}, ${DateTime.formatIso(DateTime.makeUnsafe(nowMs))}, ${JSON.stringify(folds)})
        `
        yield* Effect.logInfo(`tidied ${folds.length} topic(s) into Earlier`)
        return Option.some({ id, topics: folds.length })
      }).pipe(Effect.orDie, Effect.withSpan("Tidier.tidy"))

      const undo = Effect.fn("Tidier.undo")(function* (id: TidyId) {
        const rows = yield* sql<{
          topic_ids: string
        }>`SELECT topic_ids FROM tidies WHERE id = ${id} AND undone = 0`
        const batch = rows[0]
        if (batch === undefined) return
        const ids = decodeTopicIds(batch.topic_ids)
        yield* store.setFolded(ids, false)
        yield* sql`UPDATE tidies SET undone = 1 WHERE id = ${id}`
      }, Effect.orDie)

      const lastTidyMs = sql<{ at: string | null }>`SELECT MAX(at) AS at FROM tidies`.pipe(
        Effect.map((rows) => Option.map(Option.fromNullishOr(rows[0]?.at), (at) => Date.parse(at))),
        Effect.orDie,
      )

      return Tidier.of({ tidy, undo, lastTidyMs })
    }),
  )

  /** The background loop: checks every tick; tidies at most once per absence. */
  static readonly loop = Layer.effectDiscard(
    Effect.gen(function* () {
      const tidier = yield* Tidier
      const presence = yield* Presence
      const config = yield* DomoConfig
      const settings = yield* Settings
      const tidiedFor = yield* Ref.make<number | undefined>(undefined)

      const tick = Effect.gen(function* () {
        const lastSeen = yield* presence.lastSeenMs
        if (Option.isNone(lastSeen)) return
        const nowMs = yield* Clock.currentTimeMillis
        const away = nowMs - lastSeen.value > (yield* settings.awayMs)
        if (!away || (yield* Ref.get(tidiedFor)) === lastSeen.value) return
        yield* Ref.set(tidiedFor, lastSeen.value)
        yield* tidier.tidy
      })

      yield* Effect.forkScoped(
        tick.pipe(
          Effect.catchCause((cause) => Effect.logWarning("tidy check failed", cause)),
          Effect.repeat(Schedule.spaced(`${config.tidyTickSeconds} seconds`)),
        ),
      )
    }),
  )
}
