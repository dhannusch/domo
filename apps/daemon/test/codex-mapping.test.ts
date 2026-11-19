import type { AgentEvent, RunId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import {
  type CodexAccumulator,
  initialAccumulator,
  mapCodexEvent,
} from "../src/providers/codex/mapping.ts"

const runId = "r1" as RunId

const replay = (raw: ReadonlyArray<unknown>): ReadonlyArray<AgentEvent> => {
  const step = mapCodexEvent(runId)
  let acc: CodexAccumulator = initialAccumulator
  const out: Array<AgentEvent> = []
  for (const event of raw) {
    const [next, events] = step(acc, event)
    acc = next
    out.push(...events)
  }
  return out
}

describe("mapCodexEvent", () => {
  it("maps a full turn: thread, command, file change, message, completion", () => {
    const events = replay([
      { type: "thread.started", thread_id: "th1" },
      { type: "turn.started" },
      {
        type: "item.started",
        item: {
          id: "c1",
          type: "command_execution",
          command: "ls",
          aggregated_output: "",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "c1",
          type: "command_execution",
          command: "ls",
          aggregated_output: "a.ts\n",
          exit_code: 0,
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "f1",
          type: "file_change",
          changes: [{ path: "a.ts", kind: "update" }],
          status: "completed",
        },
      },
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "Done." } },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 20,
          cache_write_input_tokens: 0,
          output_tokens: 7,
          reasoning_output_tokens: 0,
        },
      },
    ])
    expect(events.map((e) => e._tag)).toEqual([
      "RunStarted",
      "ToolStarted",
      "ToolFinished",
      "FileChanged",
      "TextDelta",
      "RunCompleted",
    ])
    expect(events.at(-1)).toEqual({
      _tag: "RunCompleted",
      runId,
      text: "Done.",
      usage: { inputTokens: 100, outputTokens: 7, cachedInputTokens: 20 },
    })
  })

  it("marks failing commands as not ok", () => {
    const [finished] = replay([
      {
        type: "item.completed",
        item: {
          id: "c1",
          type: "command_execution",
          command: "x",
          aggregated_output: "not found",
          exit_code: 127,
          status: "completed",
        },
      },
    ])
    expect(finished).toMatchObject({ _tag: "ToolFinished", ok: false, summary: "not found" })
  })

  it("maps turn.failed and stream errors to RunFailed", () => {
    expect(replay([{ type: "turn.failed", error: { message: "quota" } }])).toEqual([
      { _tag: "RunFailed", runId, message: "quota" },
    ])
    expect(replay([{ type: "error", message: "crash" }])[0]?._tag).toBe("RunFailed")
  })

  it("ignores unknown events and items", () => {
    expect(
      replay([
        { type: "something.new" },
        { type: "item.completed", item: { id: "r", type: "reasoning", text: "…" } },
      ]),
    ).toEqual([])
  })
})
