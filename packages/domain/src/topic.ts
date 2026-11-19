import { Schema } from "effect"
import { DeviceId, MessageId, TopicId } from "./ids.ts"
import { ModelRef } from "./model.ts"

export const TopicStatus = Schema.Literals(["live", "resolved", "unresolved"])
export type TopicStatus = typeof TopicStatus.Type

/** Stakes decide whether a settlement is confirmed — never the agent's confidence. */
export const Stakes = Schema.Literals(["low", "costly", "irreversible"])
export type Stakes = typeof Stakes.Type

export class Topic extends Schema.Class<Topic>("domo/domain/Topic")({
  id: TopicId,
  title: Schema.NonEmptyString,
  status: TopicStatus,
  stakes: Stakes,
  decision: Schema.optionalKey(Schema.String),
  nextStep: Schema.optionalKey(Schema.String),
  summary: Schema.String,
  sourceMessageIds: Schema.Array(MessageId),
  folded: Schema.Boolean,
  model: ModelRef,
  /** Set when the user named a model (`@alias`); otherwise the topic follows the default model. */
  modelPinned: Schema.optionalKey(Schema.Boolean),
  providerSessionId: Schema.optionalKey(Schema.String),
  project: Schema.optionalKey(Schema.String),
  lastActivityAt: Schema.DateTimeUtcFromString,
}) {}

/** How far each device has read; tidying only folds what has been read past. */
export const ReadCursor = Schema.Struct({
  deviceId: DeviceId,
  messageId: MessageId,
  at: Schema.DateTimeUtcFromString,
})
export type ReadCursor = typeof ReadCursor.Type
