import type { RunId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { mapClaudeMessage } from "../src/providers/claude/mapping.ts"

const runId = "r1" as RunId
const map = (raw: unknown) => mapClaudeMessage(raw, runId)

describe("mapClaudeMessage", () => {
  it("maps system init to RunStarted with the session id", () => {
    expect(map({ type: "system", subtype: "init", session_id: "s1", tools: [], cwd: "/" })).toEqual(
      [{ _tag: "RunStarted", runId, sessionId: "s1" }],
    )
  })

  it("maps top-level text deltas and skips subagent deltas", () => {
    const delta = (parent: string | null) => ({
      type: "stream_event",
      parent_tool_use_id: parent,
      uuid: "u",
      session_id: "s1",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
    })
    expect(map(delta(null))).toEqual([{ _tag: "TextDelta", runId, text: "Hi" }])
    expect(map(delta("tool-1"))).toEqual([])
  })

  it("maps tool_use blocks, plus FileChanged for edit tools", () => {
    const events = map({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          { type: "text", text: "Editing" },
          {
            type: "tool_use",
            id: "t1",
            name: "Edit",
            input: { file_path: "/p/a.ts", old_string: "a" },
          },
          { type: "tool_use", id: "t2", name: "Bash", input: { command: "ls" } },
        ],
      },
    })
    expect(events.map((e) => e._tag)).toEqual(["ToolStarted", "FileChanged", "ToolStarted"])
    expect(events[1]).toEqual({ _tag: "FileChanged", runId, path: "/p/a.ts" })
  })

  it("maps tool results with ok/error and a capped summary", () => {
    const events = map({
      type: "user",
      parent_tool_use_id: null,
      message: {
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "done" },
          {
            type: "tool_result",
            tool_use_id: "t2",
            is_error: true,
            content: [{ type: "text", text: "boom" }],
          },
        ],
      },
    })
    expect(events).toEqual([
      { _tag: "ToolFinished", runId, callId: "t1", ok: true, summary: "done" },
      { _tag: "ToolFinished", runId, callId: "t2", ok: false, summary: "boom" },
    ])
  })

  it("maps results to RunCompleted or RunFailed", () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 7,
    }
    expect(
      map({ type: "result", subtype: "success", is_error: false, result: "Hello", usage }),
    ).toEqual([
      {
        _tag: "RunCompleted",
        runId,
        text: "Hello",
        usage: { inputTokens: 17, outputTokens: 5, cachedInputTokens: 3 },
      },
    ])
    expect(
      map({ type: "result", subtype: "error_max_turns", is_error: true, usage })[0]?._tag,
    ).toBe("RunFailed")
  })

  it("ignores unknown message types instead of failing", () => {
    expect(map({ type: "rate_limit_event", anything: 1 })).toEqual([])
    expect(map("garbage")).toEqual([])
  })
})
