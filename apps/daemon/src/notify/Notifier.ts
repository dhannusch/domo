import { join } from "node:path"
import type { PushSubscriptionJson } from "@domo/domain"
import { Clock, Context, Effect, FileSystem, Layer, Option, Predicate, Schema } from "effect"
import { SqlClient } from "effect/sql"
import webpush from "web-push"
import { DomoConfig } from "../config/DomoConfig.ts"
import { Presence } from "../presence/Presence.ts"
import { Settings } from "../settings/Settings.ts"

/** Push services want a contact for the sender; a placeholder keeps the user's address private. */
const SUBJECT = "mailto:domo@example.com"
/** Someone active this recently is looking at Domo and sees the question inline. */
const PRESENT_MS = 60_000

const VapidKeys = Schema.fromJsonString(
  Schema.Struct({ publicKey: Schema.String, privateKey: Schema.String }),
)
const decodeKeys = Schema.decodeUnknownEffect(VapidKeys)
const encodeKeys = Schema.encodeSync(VapidKeys)
const Row = Schema.Struct({ endpoint: Schema.String, p256dh: Schema.String, auth: Schema.String })

export interface Note {
  readonly title: string
  readonly body: string
  /** Replaces an earlier notification with the same tag. */
  readonly tag: string
}

/**
 * Web Push to the user's devices, only for decisions that block on them, and
 * only when they aren't already looking. VAPID keys live in `<home>/vapid.json`.
 */
export class Notifier extends Context.Service<
  Notifier,
  {
    readonly publicKey: string
    subscribe(subscription: PushSubscriptionJson): Effect.Effect<void>
    needsYou(note: Note): Effect.Effect<void>
  }
>()("domo/notify/Notifier") {
  static readonly layer = Layer.effect(
    Notifier,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const sql = yield* SqlClient.SqlClient
      const presence = yield* Presence
      const settings = yield* Settings
      const { home } = yield* DomoConfig
      const keysPath = join(home, "vapid.json")
      const keys = yield* fs.readFileString(keysPath).pipe(
        Effect.flatMap(decodeKeys),
        Effect.catch(() =>
          Effect.gen(function* () {
            const fresh = webpush.generateVAPIDKeys()
            yield* fs.writeFileString(keysPath, encodeKeys(fresh), { mode: 0o600 })
            return fresh
          }),
        ),
        Effect.orDie,
      )

      const subscribe = Effect.fn("Notifier.subscribe")(function* (s: PushSubscriptionJson) {
        yield* sql`
          INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth})
          ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
        `
      }, Effect.orDie)

      const send = (row: typeof Row.Type, payload: string) =>
        Effect.tryPromise(() =>
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            payload,
            {
              vapidDetails: { subject: SUBJECT, ...keys },
              TTL: 60 * 60,
              urgency: "high",
            },
          ),
        ).pipe(
          Effect.catch((error) => {
            const status = Predicate.hasProperty(error.cause, "statusCode")
              ? error.cause.statusCode
              : undefined
            // Gone: the device unsubscribed or the app was removed.
            return status === 404 || status === 410
              ? sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`.pipe(
                  Effect.ignore,
                )
              : Effect.logWarning("push failed", error)
          }),
        )

      const needsYou = Effect.fn("Notifier.needsYou")(
        function* (note: Note) {
          if ((yield* settings.current).notifications === "off") return
          const lastSeen = yield* presence.lastSeenMs
          const now = yield* Clock.currentTimeMillis
          if (Option.isSome(lastSeen) && now - lastSeen.value < PRESENT_MS) return
          const rows = yield* sql`SELECT endpoint, p256dh, auth FROM push_subscriptions`.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Row))),
          )
          const payload = JSON.stringify(note)
          yield* Effect.forEach(rows, (row) => send(row, payload), {
            concurrency: 4,
            discard: true,
          })
        },
        Effect.catchCause((cause) => Effect.logWarning("push skipped", cause)),
      )

      return Notifier.of({ publicKey: keys.publicKey, subscribe, needsYou })
    }),
  )

  static readonly layerNoop = Layer.succeed(
    Notifier,
    Notifier.of({ publicKey: "", subscribe: () => Effect.void, needsYou: () => Effect.void }),
  )
}
