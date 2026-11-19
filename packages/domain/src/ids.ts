import { Schema } from "effect"

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"))
export type MessageId = typeof MessageId.Type

export const TopicId = Schema.String.pipe(Schema.brand("TopicId"))
export type TopicId = typeof TopicId.Type

export const GoalId = Schema.String.pipe(Schema.brand("GoalId"))
export type GoalId = typeof GoalId.Type

export const TaskId = Schema.String.pipe(Schema.brand("TaskId"))
export type TaskId = typeof TaskId.Type

export const RunId = Schema.String.pipe(Schema.brand("RunId"))
export type RunId = typeof RunId.Type

export const ComponentId = Schema.String.pipe(Schema.brand("ComponentId"))
export type ComponentId = typeof ComponentId.Type

export const DeviceId = Schema.String.pipe(Schema.brand("DeviceId"))
export type DeviceId = typeof DeviceId.Type

export const TidyId = Schema.String.pipe(Schema.brand("TidyId"))
export type TidyId = typeof TidyId.Type
