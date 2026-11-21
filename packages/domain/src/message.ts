import { Schema } from "effect"
import { ImageId, MessageId, TopicId } from "./ids.ts"
import { ComponentResolution, UiComponent, WorkReceipt } from "./ui.ts"

/** W3C-style text-quote selector anchoring a reply to a fragment of a message. */
export const TextQuote = Schema.Struct({
  exact: Schema.NonEmptyString,
  prefix: Schema.String,
  suffix: Schema.String,
})
export type TextQuote = typeof TextQuote.Type

/** One message, or one fragment of it, that a reply points at. */
const Comment = Schema.String.pipe(Schema.check(Schema.isMaxLength(2000)))

export const ReplyTarget = Schema.Struct({
  messageId: MessageId,
  quote: Schema.optionalKey(TextQuote),
  /** The user's comment on the quoted fragment. */
  comment: Schema.optionalKey(Comment),
})
export type ReplyTarget = typeof ReplyTarget.Type

/** The first target places the reply (its topic); `also` holds any further quotes. */
export const ReplyTo = Schema.Struct({
  messageId: MessageId,
  quote: Schema.optionalKey(TextQuote),
  comment: Schema.optionalKey(Comment),
  also: Schema.optionalKey(Schema.Array(ReplyTarget)),
})
export type ReplyTo = typeof ReplyTo.Type

/** Every target of a reply, in the order they were picked. */
export const replyTargets = (replyTo: ReplyTo): ReadonlyArray<ReplyTarget> => [
  replyTo,
  ...(replyTo.also ?? []),
]

/** The image types the models read. */
export const ImageMediaType = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])
export type ImageMediaType = typeof ImageMediaType.Type

/** An image the user attached; the file lives in the agent home (`images/`). */
export const ImageRef = Schema.Struct({ id: ImageId, mediaType: ImageMediaType })
export type ImageRef = typeof ImageRef.Type

/** The file types Domo can hand over in a reply (decks, documents, vector art, data). */
export const FileMediaType = Schema.Literals([
  "application/pdf",
  "text/html",
  "image/svg+xml",
  "text/markdown",
  "text/plain",
  "text/csv",
])
export type FileMediaType = typeof FileMediaType.Type

/** A file Domo attached to a reply; the copy lives in the agent home (`attachments/`). */
export const FileRef = Schema.Struct({
  id: ImageId,
  name: Schema.NonEmptyString,
  mediaType: FileMediaType,
})
export type FileRef = typeof FileRef.Type

/** At most this many images go with one message. */
export const MAX_IMAGES = 4

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
  /** Images the user attached to this message. */
  images: Schema.optionalKey(Schema.Array(ImageRef)),
  /** Files Domo attached to this reply (a deck, a PDF, an SVG). */
  files: Schema.optionalKey(Schema.Array(FileRef)),
  component: Schema.optionalKey(UiComponent),
  /** How the user answered this message's Choice. */
  resolution: Schema.optionalKey(ComponentResolution),
  /** The receipt line for agent work (tools run, files changed). */
  work: Schema.optionalKey(WorkReceipt),
  sources: Schema.optionalKey(Schema.Array(SourceTag)),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
