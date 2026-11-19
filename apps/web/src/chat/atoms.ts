import {
  type MessageId,
  MessageId as MessageIdSchema,
  type ReturnSummary,
  type RunId,
} from "@domo/domain"
import { Effect, Schedule, Stream } from "effect"
import { Atom, AtomRegistry } from "effect/reactivity"
import { DomoClient } from "../client.ts"
import { applyEvent, fromHistory } from "./view.ts"

export type Connection = "connecting" | "live" | "reconnecting"

/** Connection status shown quietly above the composer when it isn't "live". */
export const connectionAtom = Atom.make<Connection>("connecting")

/** Back off from 0.5s up to every 5s, forever: the daemon may simply be restarting. */
const reconnect = Schedule.min([Schedule.exponential("500 millis"), Schedule.spaced("5 seconds")])

/**
 * History, then the live feed folded on top. Any failure — including a first
 * connection that stalls — reconnects and rebuilds the view from fresh history,
 * so the page never sits blank waiting on a dead socket.
 */
export const chatAtom = DomoClient.runtime.atom(
  Stream.unwrap(
    Effect.gen(function* () {
      const registry = yield* AtomRegistry.AtomRegistry
      const session = Stream.unwrap(
        Effect.gen(function* () {
          const client = yield* DomoClient
          const history = yield* client("History", { limit: 200 }).pipe(Effect.timeout("8 seconds"))
          registry.set(connectionAtom, "live")
          return client("Feed", undefined).pipe(Stream.scan(() => fromHistory(history), applyEvent))
        }),
      )
      return session.pipe(
        Stream.tapError(() => Effect.sync(() => registry.set(connectionAtom, "reconnecting"))),
        Stream.retry(reconnect),
      )
    }),
  ),
)

export const sendAtom = DomoClient.mutation("Send")

export const trackAtom = DomoClient.mutation("Track")

export const answerAtom = DomoClient.mutation("Answer")

export const checkAtom = DomoClient.mutation("Check")

export const pushKeyAtom = DomoClient.mutation("PushKey")

/** What the settings sheet shows; refreshed after every change made from it. */
export const settingsAtom = DomoClient.query("Settings", undefined, {
  reactivityKeys: ["settings"],
})

export const updateSettingsAtom = DomoClient.mutation("UpdateSettings")

/** The user's instructions for Domo (domo.md), refreshed after a save. */
export const instructionsAtom = DomoClient.query("Instructions", undefined, {
  reactivityKeys: ["instructions"],
})

export const saveInstructionsAtom = DomoClient.mutation("SaveInstructions")

/** The models Domo can route to, for the default-model setting. */
export const modelsAtom = DomoClient.query("Models", undefined)

export const undoLabChangeAtom = DomoClient.mutation("UndoLabChange")

export const subscribeAtom = DomoClient.mutation("Subscribe")

/** What "view" shows for one run, fetched when first opened. */
export const runAtom = Atom.family((runId: RunId) => DomoClient.query("Run", { runId }))

export const presenceAtom = DomoClient.mutation("Presence")

export const undoTidyAtom = DomoClient.mutation("UndoTidy")

export const undoAnswerAtom = DomoClient.mutation("UndoAnswer")

export const notQuiteAtom = DomoClient.mutation("NotQuite")

/** Messages folded into "Earlier", fetched only when the user opens it. */
export const earlierAtom = DomoClient.query("Earlier", { limit: 300 })

/** The original messages behind a source tag (key: comma-joined ids). */
export const sourceMessagesAtom = Atom.family((ids: string) =>
  DomoClient.query("Messages", { ids: ids.split(",").map((id) => MessageIdSchema.make(id)) }),
)

/** The furthest message this device has scrolled into view. */
export const readThroughAtom = Atom.make<MessageId | undefined>(undefined)

/** The return line, shown after the message the user had read up to when they left. */
export const returnAtom = Atom.make<
  { readonly summary: ReturnSummary; readonly afterId: MessageId | undefined } | undefined
>(undefined)

/** A scroll position to restore after the page rebuilds (so returning keeps the user's place). */
export const anchorAtom = Atom.make<{ readonly id: string; readonly top: number } | undefined>(
  undefined,
)
