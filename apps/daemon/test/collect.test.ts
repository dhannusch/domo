import { type AgentEvent, RunId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { collectRun, isDomoUiTool, type RunOutcome, workSummary } from "../src/conductor/collect.ts"
import { describeTool } from "../src/conductor/describeTool.ts"

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  streamed: "",
  completed: "",
  failure: Option.none(),
  sessionId: undefined,
  tools: [],
  files: [],
  usage: undefined,
  pending: new Map(),
  afterTool: false,
  ...over,
})

describe("workSummary", () => {
  it("is empty for pure prose", () => {
    expect(workSummary(outcome())).toBeUndefined()
  })

  it("describes councils and hand-offs with model names", () => {
    const summary = workSummary(
      outcome({ tools: [{ name: "Bash", action: "Ran a command", ok: true, summary: "" }] }),
      [
        { kind: "council", model: "claude:claude-opus-5-5", task: "A", summary: "", ok: true },
        { kind: "council", model: "codex:default", task: "B", summary: "", ok: true },
        { kind: "delegate", model: "codex:default", task: "t", summary: "", ok: true },
      ],
      (key) => (key.startsWith("codex") ? "Codex" : "Opus 5.5"),
    )
    expect(summary).toBe("Asked 2 models, handed off to Codex, ran 1 tool")
  })
})

describe("isDomoUiTool", () => {
  it("excludes Domo's own tools and bookkeeping from tool counts", () => {
    expect(isDomoUiTool("mcp__domo__council")).toBe(true)
    expect(isDomoUiTool("domo.delegate")).toBe(true)
    expect(isDomoUiTool("ToolSearch")).toBe(true)
    expect(isDomoUiTool("Bash")).toBe(false)
  })
})

describe("collectRun", () => {
  it.effect("keeps text written before a card, with a paragraph break after it", () =>
    Effect.gen(function* () {
      const runId = RunId.make("r")
      const events: ReadonlyArray<AgentEvent> = [
        { _tag: "TextDelta", runId, text: "Here's my thinking. " },
        { _tag: "TextDelta", runId, text: "Three ideas." },
        { _tag: "ToolStarted", runId, callId: "c1", name: "mcp__domo__render_choice", input: {} },
        { _tag: "ToolFinished", runId, callId: "c1", ok: true, summary: "Shown." },
        { _tag: "TextDelta", runId, text: "Pick one below." },
        {
          _tag: "RunCompleted",
          runId,
          text: "Pick one below.",
          usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
        },
      ]
      const deltas: Array<string> = []
      const outcome = yield* collectRun(
        Stream.fromIterable(events),
        { sessionId: undefined, wholeMessages: false },
        {
          onSession: () => Effect.void,
          onDelta: (text) => Effect.sync(() => deltas.push(text)),
          onTool: () => Effect.void,
        },
      )
      expect(outcome.streamed).toBe("Here's my thinking. Three ideas.\n\nPick one below.")
      // The live view gets the same break as the saved reply.
      expect(deltas.join("")).toBe(outcome.streamed)
    }),
  )
})

describe("describeTool", () => {
  it("says what a call did in plain words, with its specifics apart", () => {
    expect(describeTool("Write", { file_path: "/h/topics/x/how-teams-ship-brief.md" })).toEqual({
      action: "Wrote how-teams-ship-brief.md",
    })
    expect(describeTool("Bash", { command: "ls -la ~/.domo/topics" })).toEqual({
      action: "Ran a command",
      detail: "ls -la ~/.domo/topics",
    })
    expect(describeTool("shell", { command: ["bash", "-lc", "bun test"] }).detail).toBe(
      "bash -lc bun test",
    )
    expect(describeTool("WebSearch", { query: "substack api" })).toEqual({
      action: "Searched the web",
      detail: "substack api",
    })
    expect(describeTool("mcp__github__list_issues", {}).action).toBe("Used list issues")
  })
})
