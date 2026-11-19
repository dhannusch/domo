import { Schema } from "effect"
import { GoalId, TopicId } from "./ids.ts"

export const GoalStatus = Schema.Literals(["active", "done", "dropped"])
export type GoalStatus = typeof GoalStatus.Type

/**
 * A durable outcome the user wants ("Ship kettlebell v2 by December"). Domo
 * checks in on active goals when the user comes back, and only says something
 * when a goal moved or is stuck.
 */
export class Goal extends Schema.Class<Goal>("domo/domain/Goal")({
  id: GoalId,
  title: Schema.NonEmptyString,
  /** What "done" looks like. */
  outcome: Schema.String,
  status: GoalStatus,
  /** Optional target date (ISO day). */
  due: Schema.optionalKey(Schema.String),
  /** Days between check-ins. */
  cadenceDays: Schema.Int,
  nextCheckInAt: Schema.DateTimeUtcFromString,
  /** Latest progress, newest first, kept short. */
  progress: Schema.Array(Schema.Struct({ at: Schema.DateTimeUtcFromString, note: Schema.String })),
  /** The topic where check-ins about this goal are posted. */
  topicId: Schema.optionalKey(TopicId),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
