import { join } from "node:path"
import type { Message, PushSubscriptionJson } from "@domo/domain"
import {
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from "effect"
import { SqlClient } from "effect/sql"
import webpush from "web-push"
import { ChatBus } from "../chat/ChatBus.ts"
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

/** The start of a reply as plain text, short enough for a lock screen. */
export const preview = (text: string): string => {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return plain.length > 140 ? `${plain.slice(0, 139).trimEnd()}…` : plain
}

/** What a finished reply should notify as, under the user's setting; none when it shouldn't. */
export const replyNote = (
  message: Message,
  setting: "all" | "needed" | "off",
): Option.Option<Note> => {
  if (setting === "off" || message.status === "streaming" || message.status === "queued")
    return Option.none()
  const tag = message.component?._tag
  const asks = (tag === "Choice" || tag === "Questions") && message.resolution === undefined
  if (!asks && setting !== "all") return Option.none()
  const body =
    asks && message.component?._tag === "Choice"
      ? message.component.question
      : preview(message.text) || "Your reply is ready."
  return Option.some({
    title: asks
      ? "Domo needs you"
      : message.status === "failed"
        ? "Domo hit a problem"
        : "Domo replied",
    body,
    tag: message.id,
  })
}

/**
 * Web Push to the user's devices when they aren't already looking: decisions that
 * block on them, reminders, and (by default) finished replies. VAPID keys live in
 * `<home>/vapid.json`.
 */
export class Notifier extends Context.Service<
  Notifier,
  {
    readonly publicKey: string
    subscribe(subscription: PushSubscriptionJson): Effect.Effect<void>
    needsYou(note: Note): Effect.Effect<void>
    /** Sends a test note to every device now, present or not; how many accepted it. */
    readonly test: Effect.Effect<number>
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
          Effect.as(true),
          Effect.catch((error) => {
            const status = Predicate.hasProperty(error.cause, "statusCode")
              ? error.cause.statusCode
              : undefined
            // Gone: the device unsubscribed or the app was removed.
            return status === 404 || status === 410
              ? sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`.pipe(
                  Effect.ignore,
                  Effect.as(false),
                )
              : Effect.logWarning("push failed", status ?? "", error).pipe(Effect.as(false))
          }),
        )

      /** Sends to every subscribed device; how many accepted it. */
      const sendAll = Effect.fnUntraced(function* (note: Note) {
        const rows = yield* sql`SELECT endpoint, p256dh, auth FROM push_subscriptions`.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Row))),
        )
        const payload = JSON.stringify(note)
        const sent = yield* Effect.forEach(rows, (row) => send(row, payload), { concurrency: 4 })
        return sent.filter(Boolean).length
      })

      const needsYou = Effect.fn("Notifier.needsYou")(
        function* (note: Note) {
          if ((yield* settings.current).notifications === "off") return
          const lastSeen = yield* presence.lastSeenMs
          const now = yield* Clock.currentTimeMillis
          if (Option.isSome(lastSeen) && now - lastSeen.value < PRESENT_MS) return
          yield* sendAll(note)
        },
        Effect.catchCause((cause) => Effect.logWarning("push skipped", cause)),
      )

      const test = sendAll({
        title: "Domo",
        body: "Notifications work on this device.",
        tag: "domo-test",
      }).pipe(
        Effect.orElseSucceed(() => 0),
        Effect.withSpan("Notifier.test"),
      )

      return Notifier.of({ publicKey: keys.publicKey, subscribe, needsYou, test })
    }),
  )

  /** Notifies finished replies (and the decisions they ask for) while the user is away. */
  static readonly replies = Layer.effectDiscard(
    Effect.gen(function* () {
      const notifier = yield* Notifier
      const bus = yield* ChatBus
      const settings = yield* Settings
      yield* bus.feed.pipe(
        Stream.runForEach((event) =>
          event._tag === "AgentFinished"
            ? settings.current.pipe(
                Effect.map((s) => replyNote(event.message, s.notifications)),
                Effect.flatMap(
                  Option.match({ onNone: () => Effect.void, onSome: notifier.needsYou }),
                ),
              )
            : Effect.void,
        ),
        Effect.forkScoped,
      )
    }),
  )

  static readonly layerNoop = Layer.succeed(
    Notifier,
    Notifier.of({
      publicKey: "",
      subscribe: () => Effect.void,
      needsYou: () => Effect.void,
      test: Effect.succeed(0),
    }),
  )
}
