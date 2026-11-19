import { Schema } from "effect"
import { RunId } from "./ids.ts"

/** Provider-neutral stream of what a model run is doing. Both SDK adapters map into this. */

export const Usage = Schema.Struct({
  inputTokens: Schema.Int,
  outputTokens: Schema.Int,
  cachedInputTokens: Schema.Int,
})
export type Usage = typeof Usage.Type

export const AgentEvent = Schema.Union([
  Schema.TaggedStruct("RunStarted", { runId: RunId, sessionId: Schema.String }),
  Schema.TaggedStruct("TextDelta", { runId: RunId, text: Schema.String }),
  Schema.TaggedStruct("ToolStarted", {
    runId: RunId,
    callId: Schema.String,
    name: Schema.String,
    input: Schema.Unknown,
  }),
  Schema.TaggedStruct("ToolFinished", {
    runId: RunId,
    callId: Schema.String,
    ok: Schema.Boolean,
    summary: Schema.String,
  }),
  Schema.TaggedStruct("FileChanged", { runId: RunId, path: Schema.String }),
  Schema.TaggedStruct("RunCompleted", { runId: RunId, text: Schema.String, usage: Usage }),
  Schema.TaggedStruct("RunFailed", { runId: RunId, message: Schema.String }),
])
export type AgentEvent = typeof AgentEvent.Type
