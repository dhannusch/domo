import {
  type DeviceId,
  DeviceId as DeviceIdSchema,
  type MessageId,
  type ReturnSummary,
  TidyId,
} from "@domo/domain"
import { Clock, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ChatStore } from "../chat/ChatStore.ts"
import { Settings } from "../settings/Settings.ts"

/** The calendar day on this Mac (the daemon runs where the user lives). */
const localDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA")

const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms))
const decodeIds = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.String)))

/**
 * Where the user is: the last time any device was active, and how far they've
 * read. Coming back after an absence returns the one-line summary for the page.
 */
export class Presence extends Context.Service<
  Presence,
  {
    /**
     * The user is here. `summary` is the return line after an absence;
     * `greeting` is true when they've just come back or it's their first visit
     * of the day (when goal check-ins run).
     */
    touch(
      deviceId: DeviceId,
      readThrough: MessageId | undefined,
      label?: string,
    ): Effect.Effect<{ readonly summary: Option.Option<ReturnSummary>; readonly greeting: boolean }>
    /** Latest activity on any device (epoch ms), if anyone has ever been here. */
    readonly lastSeenMs: Effect.Effect<Option.Option<number>>
    /** Devices seen in the last 30 days, most recent first, with whether each gets push. */
    readonly devices: Effect.Effect<
      ReadonlyArray<{
        readonly id: DeviceId
        readonly label?: string
        readonly lastSeen: string
        readonly notifications: boolean
      }>
    >
    /** The furthest message any device has read (seq). */
    readonly readSeq: Effect.Effect<number>
  }
>()("domo/presence/Presence") {
  static readonly layer = Layer.effect(
    Presence,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const store = yield* ChatStore
      const settings = yield* Settings

      const lastSeenMs = sql<{
        last: string | null
      }>`SELECT MAX(last_seen) AS last FROM devices`.pipe(
        Effect.map((rows) =>
          Option.map(Option.fromNullishOr(rows[0]?.last), (last) => Date.parse(last)),
        ),
        Effect.orDie,
      )

      const readSeq = sql<{
        seq: number | null
      }>`SELECT MAX(read_through_seq) AS seq FROM devices`.pipe(
        Effect.map((rows) => rows[0]?.seq ?? 0),
        Effect.orDie,
      )

      const summarySince = Effect.fnUntraced(function* (sinceMs: number) {
        const since = iso(sinceMs)
        const done = yield* store.repliesSince(since)
        const needsYou = yield* store.openChoiceCount
        const tidies = yield* sql<{ id: string; topic_ids: string }>`
          SELECT id, topic_ids FROM tidies WHERE at > ${since} AND undone = 0 ORDER BY at DESC LIMIT 1
        `
        const tidy = tidies[0]
        const topics = tidy === undefined ? 0 : decodeIds(tidy.topic_ids).length
        return {
          done,
          needsYou,
          ...(tidy === undefined || topics === 0
            ? {}
            : { tidied: { id: TidyId.make(tidy.id), topics } }),
        } satisfies ReturnSummary
      })

      const touch = Effect.fn("Presence.touch")(function* (
        deviceId: DeviceId,
        readThrough: MessageId | undefined,
        label?: string,
      ) {
        const nowMs = yield* Clock.currentTimeMillis
        const previous = yield* lastSeenMs
        const seq = readThrough === undefined ? 0 : ((yield* store.messageSeq(readThrough)) ?? 0)
        yield* sql`
            INSERT INTO devices (id, last_seen, read_through_seq, label)
            VALUES (${deviceId}, ${iso(nowMs)}, ${seq}, ${label ?? null})
            ON CONFLICT (id) DO UPDATE SET
              last_seen = excluded.last_seen,
              label = COALESCE(excluded.label, devices.label),
              read_through_seq = MAX(devices.read_through_seq, excluded.read_through_seq)
          `
        const wasAway = Option.isSome(previous) && nowMs - previous.value > (yield* settings.awayMs)
        const newDay = Option.isNone(previous) || localDay(previous.value) !== localDay(nowMs)
        return {
          summary: wasAway ? Option.some(yield* summarySince(previous.value)) : Option.none(),
          greeting: wasAway || newDay,
        }
      }, Effect.orDie)

      const devices = Effect.gen(function* () {
        const since = iso((yield* Clock.currentTimeMillis) - 30 * 86_400_000)
        const rows = yield* sql<{
          id: string
          label: string | null
          last_seen: string
          push: number
        }>`
          SELECT d.id, d.label, d.last_seen,
            EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.device_id = d.id) AS push
          FROM devices d WHERE d.last_seen > ${since} ORDER BY d.last_seen DESC LIMIT 20
        `
        return rows.map((r) => ({
          id: DeviceIdSchema.make(r.id),
          ...(r.label === null ? {} : { label: r.label }),
          lastSeen: r.last_seen,
          notifications: r.push > 0,
        }))
      }).pipe(Effect.orDie)

      return Presence.of({ touch, lastSeenMs, readSeq, devices })
    }),
  )
}
