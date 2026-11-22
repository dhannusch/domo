import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { DeviceId, MessageId, RunId, TidyId, TopicId } from "./ids.ts"
import { ImageRef, MAX_IMAGES, Message, ReplyTo } from "./message.ts"
import { DomoSettings, SettingsPatch, SettingsView } from "./settings.ts"
import { TelemetryEvent } from "./telemetry.ts"
import { RunDetail } from "./ui.ts"

/** Live feed the UI renders. It only ever appends or completes — the page never reflows. */
export const ChatEvent = Schema.Union([
  Schema.TaggedStruct("MessageAdded", { message: Message }),
  Schema.TaggedStruct("AgentDelta", { messageId: MessageId, text: Schema.String }),
  Schema.TaggedStruct("AgentFinished", { message: Message }),
  /** A message changed in place: a component was rendered, answered or ticked. */
  Schema.TaggedStruct("MessageUpdated", { message: Message }),
  /** Live tool activity for a streaming reply. */
  Schema.TaggedStruct("WorkProgress", {
    messageId: MessageId,
    tools: Schema.Int,
    current: Schema.String,
  }),
  /** The filer moved an exchange to another topic; the UI shows a quiet hint. */
  Schema.TaggedStruct("MessagesRefiled", {
    messageIds: Schema.Array(MessageId),
    topicId: TopicId,
    topicTitle: Schema.String,
  }),
])
export type ChatEvent = typeof ChatEvent.Type

/**
 * The one line shown where the user left off after an absence:
 * "While you were away: 2 done, 1 needs you, moved 3 to Earlier (undo)".
 */
export const ReturnSummary = Schema.Struct({
  done: Schema.Int,
  needsYou: Schema.Int,
  tidied: Schema.optionalKey(Schema.Struct({ id: TidyId, topics: Schema.Int })),
})
export type ReturnSummary = typeof ReturnSummary.Type

export const History = Schema.Struct({
  messages: Schema.Array(Message),
  /** How many topics are folded into "Earlier". */
  earlier: Schema.Int,
})
export type History = typeof History.Type

export class SendFailed extends Schema.TaggedError<SendFailed>()("SendFailed", {
  message: Schema.String,
}) {}

export const ModelOption = Schema.Struct({ key: Schema.String, label: Schema.String })
export type ModelOption = typeof ModelOption.Type

/** A browser's push subscription (`PushSubscription.toJSON()`). */
export const PushSubscriptionJson = Schema.Struct({
  endpoint: Schema.String,
  keys: Schema.Struct({ p256dh: Schema.String, auth: Schema.String }),
})
export type PushSubscriptionJson = typeof PushSubscriptionJson.Type

export class DomoRpc extends RpcGroup.make(
  Rpc.make("Send", {
    payload: {
      /** May be empty when the message is only images. */
      text: Schema.String,
      replyTo: Schema.optionalKey(ReplyTo),
      images: Schema.optionalKey(
        Schema.Array(ImageRef).pipe(Schema.check(Schema.isMaxLength(MAX_IMAGES))),
      ),
      /**
       * While Domo is replying: "queue" (default) answers after the current reply; "steer" stops
       * it (keeping what it wrote) and answers this message now.
       */
      mode: Schema.optionalKey(Schema.Literals(["queue", "steer"])),
    },
    success: Schema.Struct({ messageId: MessageId }),
    error: SendFailed,
  }),
  /** The visible conversation: messages of unfolded topics, plus how much is in "Earlier". */
  Rpc.make("History", { payload: { limit: Schema.Int }, success: History }),
  /** Messages of folded topics, oldest first, for the "Earlier" fold. */
  Rpc.make("Earlier", { payload: { limit: Schema.Int }, success: Schema.Array(Message) }),
  /** Specific messages, for a source tag's "view". */
  Rpc.make("Messages", {
    payload: { ids: Schema.Array(MessageId) },
    success: Schema.Array(Message),
  }),
  /**
   * The user is here (they interacted on this device) and has read up to a
   * message. Returns the return line when they come back from an absence.
   */
  Rpc.make("Presence", {
    payload: { deviceId: DeviceId, readThrough: Schema.optionalKey(MessageId) },
    success: Schema.NullOr(ReturnSummary),
  }),
  /** Puts the topics of a tidy back on the page. */
  Rpc.make("UndoTidy", { payload: { id: TidyId } }),
  /** Re-opens a reversible Choice (allowed until the next tidy). */
  Rpc.make("UndoAnswer", { payload: { messageId: MessageId }, error: SendFailed }),
  /** "Not quite": the restatement of a topic was wrong; the next message corrects it. */
  Rpc.make("NotQuite", { payload: { messageId: MessageId } }),
  Rpc.make("Feed", { success: ChatEvent, stream: true }),
  Rpc.make("Models", { success: Schema.Array(ModelOption) }),
  /** Everything the settings sheet shows. */
  Rpc.make("Settings", { success: SettingsView }),
  /** The user removes a note from Settings (it's archived, never deleted). */
  Rpc.make("ForgetMemory", { payload: { name: Schema.NonEmptyString } }),
  Rpc.make("UpdateSettings", { payload: { patch: SettingsPatch }, success: DomoSettings }),
  /** The user's own instructions for Domo (~/.domo/domo.md). */
  Rpc.make("Instructions", { success: Schema.String }),
  Rpc.make("SaveInstructions", { payload: { text: Schema.String } }),
  /** Reverts one change the Lab promoted. */
  Rpc.make("UndoLabChange", { payload: { id: Schema.String }, success: Schema.Boolean }),
  /** The VAPID public key devices subscribe with. */
  Rpc.make("PushKey", { success: Schema.String }),
  /** This device wants a notification when a decision blocks on the user. */
  Rpc.make("Subscribe", { payload: { subscription: PushSubscriptionJson } }),
  /** Sends a test notification to every subscribed device now; succeeds with how many got it. */
  Rpc.make("TestPush", { success: Schema.Number }),
  /** Stops a reply that's being written (a chat reply or a background task). */
  Rpc.make("Stop", { payload: { messageId: MessageId } }),
  /** Answers a message's Choice (an option value, or free text). */
  Rpc.make("Answer", {
    payload: { messageId: MessageId, value: Schema.NonEmptyString, freeText: Schema.Boolean },
    error: SendFailed,
  }),
  /** Ticks or unticks a checklist item. */
  Rpc.make("Check", {
    payload: { messageId: MessageId, index: Schema.Int, done: Schema.Boolean },
  }),
  /** What "view" shows for a run. */
  Rpc.make("Run", { payload: { runId: RunId }, success: Schema.NullOr(RunDetail) }),
  /** Friction signals from the UI (e.g. "more" expanded) for the Lab. */
  Rpc.make("Track", { payload: { event: TelemetryEvent } }),
) {}
