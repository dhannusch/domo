import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { isDomoUiTool, type RunOutcome, workSummary } from "../src/conductor/collect.ts"

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  streamed: "",
  completed: "",
  failure: Option.none(),
  sessionId: undefined,
  tools: [],
  files: [],
  usage: undefined,
  pending: new Map(),
  ...over,
})

describe("workSummary", () => {
  it("is empty for pure prose", () => {
    expect(workSummary(outcome())).toBeUndefined()
  })

  it("describes councils and hand-offs with model names", () => {
    const summary = workSummary(
      outcome({ tools: [{ name: "Bash", ok: true, summary: "" }] }),
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
