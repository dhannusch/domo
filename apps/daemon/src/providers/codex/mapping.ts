import type { AgentEvent, RunId } from "@domo/domain"
import { Option, Schema } from "effect"
import { summarize } from "../summary.ts"

/**
 * Normalizes Codex SDK thread events into AgentEvents. Codex delivers whole
 * agent messages (no token deltas), so the final text is carried in the
 * accumulator and emitted on turn completion.
 */

const Item = Schema.Union([
  Schema.Struct({ id: Schema.String, type: Schema.Literal("agent_message"), text: Schema.String }),
  Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("command_execution"),
    command: Schema.String,
    aggregated_output: Schema.String,
    exit_code: Schema.optionalKey(Schema.Number),
    status: Schema.String,
  }),
  Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("file_change"),
    changes: Schema.Array(Schema.Struct({ path: Schema.String, kind: Schema.String })),
    status: Schema.String,
  }),
  Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("mcp_tool_call"),
    server: Schema.String,
    tool: Schema.String,
    arguments: Schema.Unknown,
    error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
    status: Schema.String,
  }),
  Schema.Struct({ id: Schema.String, type: Schema.Literal("web_search"), query: Schema.String }),
])
type Item = typeof Item.Type

const CodexEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("thread.started"), thread_id: Schema.String }),
  Schema.Struct({
    type: Schema.Literals(["item.started", "item.completed"]),
    item: Schema.Unknown,
  }),
  Schema.Struct({
    type: Schema.Literal("turn.completed"),
    usage: Schema.Struct({
      input_tokens: Schema.Number,
      cached_input_tokens: Schema.Number,
      output_tokens: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("turn.failed"),
    error: Schema.Struct({ message: Schema.String }),
  }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
])

const decodeEvent = Schema.decodeUnknownOption(CodexEvent)
const decodeItem = Schema.decodeUnknownOption(Item)

/** Accumulated across a turn: the latest agent message text. */
export interface CodexAccumulator {
  readonly lastMessage: string
}
export const initialAccumulator: CodexAccumulator = { lastMessage: "" }

const toolName = (item: Item): string | undefined => {
  switch (item.type) {
    case "command_execution":
      return "shell"
    case "mcp_tool_call":
      return `${item.server}.${item.tool}`
    case "web_search":
      return "web_search"
    default:
      return undefined
  }
}

const toolInput = (item: Item): unknown => {
  switch (item.type) {
    case "command_execution":
      return { command: item.command }
    case "mcp_tool_call":
      return item.arguments
    case "web_search":
      return { query: item.query }
    default:
      return {}
  }
}

const started = (item: Item, runId: RunId): ReadonlyArray<AgentEvent> => {
  const name = toolName(item)
  return name === undefined
    ? []
    : [{ _tag: "ToolStarted", runId, callId: item.id, name, input: toolInput(item) }]
}

const completed = (item: Item, runId: RunId): ReadonlyArray<AgentEvent> => {
  switch (item.type) {
    case "agent_message":
      return [{ _tag: "TextDelta", runId, text: item.text }]
    case "command_execution":
      return [
        {
          _tag: "ToolFinished",
          runId,
          callId: item.id,
          ok: item.status === "completed" && (item.exit_code ?? 0) === 0,
          summary: summarize(item.aggregated_output),
        },
      ]
    case "mcp_tool_call":
      return [
        {
          _tag: "ToolFinished",
          runId,
          callId: item.id,
          ok: item.status === "completed",
          summary: summarize(item.error?.message ?? "ok"),
        },
      ]
    case "web_search":
      return [{ _tag: "ToolFinished", runId, callId: item.id, ok: true, summary: item.query }]
    case "file_change":
      return item.status === "completed"
        ? item.changes.map(
            (change): AgentEvent => ({ _tag: "FileChanged", runId, path: change.path }),
          )
        : []
  }
}

/** Maps one Codex event; designed for `Stream.mapAccum`. */
export const mapCodexEvent =
  (runId: RunId) =>
  (acc: CodexAccumulator, raw: unknown): readonly [CodexAccumulator, ReadonlyArray<AgentEvent>] => {
    const decoded = decodeEvent(raw)
    if (Option.isNone(decoded)) return [acc, []]
    const event = decoded.value

    switch (event.type) {
      case "thread.started":
        return [acc, [{ _tag: "RunStarted", runId, sessionId: event.thread_id }]]
      case "item.started":
      case "item.completed": {
        const item = decodeItem(event.item)
        if (Option.isNone(item)) return [acc, []]
        if (event.type === "item.started") return [acc, started(item.value, runId)]
        const next = item.value.type === "agent_message" ? { lastMessage: item.value.text } : acc
        return [next, completed(item.value, runId)]
      }
      case "turn.completed":
        return [
          acc,
          [
            {
              _tag: "RunCompleted",
              runId,
              text: acc.lastMessage,
              usage: {
                inputTokens: event.usage.input_tokens,
                outputTokens: event.usage.output_tokens,
                cachedInputTokens: event.usage.cached_input_tokens,
              },
            },
          ],
        ]
      case "turn.failed":
        return [acc, [{ _tag: "RunFailed", runId, message: event.error.message }]]
      case "error":
        return [acc, [{ _tag: "RunFailed", runId, message: event.message }]]
    }
  }
