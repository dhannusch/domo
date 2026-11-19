import { TelemetryEvent } from "@domo/domain"
import { Clock, Context, DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"

const encode = Schema.encodeEffect(Schema.fromJsonString(TelemetryEvent))

/**
 * Local-only friction signals feeding the Lab. Recording must never fail the
 * user's action, so errors are logged and swallowed.
 */
export class Telemetry extends Context.Service<
  Telemetry,
  {
    record(event: TelemetryEvent): Effect.Effect<void>
    readonly countsByTag: Effect.Effect<ReadonlyMap<string, number>>
    /** Friction counts in a time window (ISO instants), for the Lab. */
    countsBetween(from: string, to: string): Effect.Effect<ReadonlyMap<string, number>>
  }
>()("domo/telemetry/Telemetry") {
  static readonly layer = Layer.effect(
    Telemetry,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const record = Effect.fn("Telemetry.record")(
        function* (event: TelemetryEvent) {
          const payload = yield* encode(event)
          const at = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis))
          yield* sql`INSERT INTO telemetry (at, tag, payload) VALUES (${at}, ${event._tag}, ${payload})`
        },
        Effect.catch((error) => Effect.logWarning("telemetry dropped", error)),
      )

      const countsByTag = sql<{ tag: string; n: number }>`
        SELECT tag, COUNT(*) AS n FROM telemetry GROUP BY tag
      `.pipe(
        Effect.map((rows) => new Map(rows.map((row) => [row.tag, row.n]))),
        Effect.orDie,
      )

      const countsBetween = (from: string, to: string) =>
        sql<{ tag: string; n: number }>`
          SELECT tag, COUNT(*) AS n FROM telemetry WHERE at >= ${from} AND at < ${to} GROUP BY tag
        `.pipe(
          Effect.map((rows) => new Map(rows.map((row) => [row.tag, row.n]))),
          Effect.orDie,
        )

      return Telemetry.of({ record, countsByTag, countsBetween })
    }),
  )
}
