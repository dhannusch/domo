import { Schema } from "effect"
import { ComponentId, MessageId, TopicId } from "./ids.ts"

/**
 * Local-only friction signals. They never leave the machine. The Lab aggregates
 * them into the FrictionReport; a behavior without telemetry cannot be improved.
 */
export const TelemetryEvent = Schema.Union([
  Schema.TaggedStruct("RestatementRejected", { topicId: TopicId, messageId: MessageId }),
  Schema.TaggedStruct("Rephrased", { topicId: TopicId, messageId: MessageId }),
  Schema.TaggedStruct("MoreExpanded", {
    messageId: MessageId,
    skill: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("TidyUndone", { topicIds: Schema.Array(TopicId) }),
  Schema.TaggedStruct("RouteOverridden", { from: TopicId, to: TopicId }),
  Schema.TaggedStruct("ChoiceAnswered", {
    componentId: ComponentId,
    freeText: Schema.Boolean,
    latencyMs: Schema.Int,
  }),
  Schema.TaggedStruct("ModelOverridden", { from: Schema.String, to: Schema.String }),
  Schema.TaggedStruct("ProjectOverridden", { from: Schema.String, to: Schema.String }),
  Schema.TaggedStruct("WorkAbandoned", { componentId: ComponentId }),
  Schema.TaggedStruct("ToolErrored", { tool: Schema.String }),
  Schema.TaggedStruct("ViewOpened", { componentId: ComponentId }),
  Schema.TaggedStruct("SettingChanged", { key: Schema.String }),
])
export type TelemetryEvent = typeof TelemetryEvent.Type
