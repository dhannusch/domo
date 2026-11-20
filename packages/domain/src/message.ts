import { Schema } from "effect"
import { MessageId, TopicId } from "./ids.ts"
import { ComponentResolution, UiComponent, WorkReceipt } from "./ui.ts"

/** W3C-style text-quote selector anchoring a reply to a fragment of a message. */
export const TextQuote = Schema.Struct({
  exact: Schema.NonEmptyString,
  prefix: Schema.String,
  suffix: Schema.String,
})
export type TextQuote = typeof TextQuote.Type

/** One message, or one fragment of it, that a reply points at. */
export const ReplyTarget = Schema.Struct({
  messageId: MessageId,
  quote: Schema.optionalKey(TextQuote),
})
export type ReplyTarget = typeof ReplyTarget.Type

/** The first target places the reply (its topic); `also` holds any further quotes. */
export const ReplyTo = Schema.Struct({
  messageId: MessageId,
  quote: Schema.optionalKey(TextQuote),
  also: Schema.optionalKey(Schema.Array(ReplyTarget)),
})
export type ReplyTo = typeof ReplyTo.Type

/** Every target of a reply, in the order they were picked. */
export const replyTargets = (replyTo: ReplyTo): ReadonlyArray<ReplyTarget> => [
  replyTo,
  ...(replyTo.also ?? []),
]

/** A source tag ("Nov 4 · view") pointing back at the original messages. */
export const SourceTag = Schema.Struct({
  label: Schema.NonEmptyString,
  messageIds: Schema.Array(MessageId).pipe(Schema.check(Schema.isMinLength(1))),
})
export type SourceTag = typeof SourceTag.Type

export const Role = Schema.Literals(["user", "agent"])
export type Role = typeof Role.Type

/** Agent messages stream in; user messages are always "done". */
export const MessageStatus = Schema.Literals(["streaming", "done", "failed"])
export type MessageStatus = typeof MessageStatus.Type

export class Message extends Schema.Class<Message>("domo/domain/Message")({
  id: MessageId,
  topicId: TopicId,
  role: Role,
  status: MessageStatus,
  text: Schema.String,
  /** Which model produced an agent message (`provider:id`). */
  model: Schema.optionalKey(Schema.String),
  replyTo: Schema.optionalKey(ReplyTo),
  component: Schema.optionalKey(UiComponent),
  /** How the user answered this message's Choice. */
  resolution: Schema.optionalKey(ComponentResolution),
  /** The receipt line for agent work (tools run, files changed). */
  work: Schema.optionalKey(WorkReceipt),
  sources: Schema.optionalKey(Schema.Array(SourceTag)),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
