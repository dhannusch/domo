import type { AgentEvent, RunId } from "@domo/domain"
import { Option, Schema } from "effect"
import { summarize } from "../summary.ts"

/**
 * Normalizes Claude Agent SDK messages into AgentEvents. We decode only the
 * fields we use (unknown fields and message types are ignored), so SDK churn
 * degrades to "event skipped" instead of a crash.
 */

const ToolUseBlock = Schema.Struct({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
})
const ToolResultBlock = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  is_error: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  content: Schema.optionalKey(Schema.Unknown),
})
const TextBlock = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const FileInput = Schema.Struct({ file_path: Schema.String })

const ClaudeMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("system"),
    subtype: Schema.Literal("init"),
    session_id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("stream_event"),
    parent_tool_use_id: Schema.NullOr(Schema.String),
    event: Schema.Struct({
      type: Schema.Literal("content_block_delta"),
      delta: Schema.Struct({ type: Schema.Literal("text_delta"), text: Schema.String }),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("assistant"),
    parent_tool_use_id: Schema.NullOr(Schema.String),
    message: Schema.Struct({ content: Schema.Array(Schema.Unknown) }),
  }),
  Schema.Struct({
    type: Schema.Literal("user"),
    parent_tool_use_id: Schema.NullOr(Schema.String),
    message: Schema.Struct({
      content: Schema.Union([Schema.String, Schema.Array(Schema.Unknown)]),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("result"),
    subtype: Schema.String,
    is_error: Schema.Boolean,
    result: Schema.optionalKey(Schema.String),
    usage: Schema.Struct({
      input_tokens: Schema.Number,
      output_tokens: Schema.Number,
      cache_read_input_tokens: Schema.optionalKey(Schema.NullOr(Schema.Number)),
      cache_creation_input_tokens: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    }),
  }),
])

const decodeMessage = Schema.decodeUnknownOption(ClaudeMessage)
const decodeToolUse = Schema.decodeUnknownOption(ToolUseBlock)
const decodeToolResult = Schema.decodeUnknownOption(ToolResultBlock)
const decodeText = Schema.decodeUnknownOption(TextBlock)
const decodeFileInput = Schema.decodeUnknownOption(FileInput)

const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"])

const resultText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .flatMap((block) => Option.toArray(decodeText(block)))
    .map((block) => block.text)
    .join(" ")
}

/** Maps one SDK message to zero or more AgentEvents. Subagent-internal traffic is skipped. */
export const mapClaudeMessage = (raw: unknown, runId: RunId): ReadonlyArray<AgentEvent> => {
  const decoded = decodeMessage(raw)
  if (Option.isNone(decoded)) return []
  const message = decoded.value

  switch (message.type) {
    case "system":
      return [{ _tag: "RunStarted", runId, sessionId: message.session_id }]
    case "stream_event":
      return message.parent_tool_use_id === null
        ? [{ _tag: "TextDelta", runId, text: message.event.delta.text }]
        : []
    case "assistant": {
      if (message.parent_tool_use_id !== null) return []
      return message.message.content.flatMap((block): Array<AgentEvent> => {
        const tool = decodeToolUse(block)
        if (Option.isNone(tool)) return []
        const started: AgentEvent = {
          _tag: "ToolStarted",
          runId,
          callId: tool.value.id,
          name: tool.value.name,
          input: tool.value.input,
        }
        const file = FILE_TOOLS.has(tool.value.name)
          ? decodeFileInput(tool.value.input)
          : Option.none()
        return Option.isSome(file)
          ? [started, { _tag: "FileChanged", runId, path: file.value.file_path }]
          : [started]
      })
    }
    case "user": {
      if (message.parent_tool_use_id !== null || typeof message.message.content === "string") {
        return []
      }
      return message.message.content.flatMap((block): Array<AgentEvent> => {
        const result = decodeToolResult(block)
        if (Option.isNone(result)) return []
        return [
          {
            _tag: "ToolFinished",
            runId,
            callId: result.value.tool_use_id,
            ok: result.value.is_error !== true,
            summary: summarize(resultText(result.value.content)),
          },
        ]
      })
    }
    case "result":
      return message.is_error || message.subtype !== "success"
        ? [{ _tag: "RunFailed", runId, message: message.result ?? message.subtype }]
        : [
            {
              _tag: "RunCompleted",
              runId,
              text: message.result ?? "",
              usage: {
                // Tokens written to the prompt cache are still input the run consumed.
                inputTokens:
                  message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
                outputTokens: message.usage.output_tokens,
                cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
              },
            },
          ]
  }
}
