import type { AgentEvent, RunId } from "@domo/domain"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { callDomoTool } from "./echoMcp.ts"
import { Providers, type RunRequest } from "./Providers.ts"

const LONG_ANSWER = [
  "Short answer: yes, go with Hale & Co.",
  ...Array.from(
    { length: 6 },
    (_, i) =>
      `Detail paragraph ${i + 1}. They quoted a mid-range price, can start on the second of December, and their references were consistently positive about communication, cleanup and staying on budget through the whole job.`,
  ),
].join("\n\n")

/** The user's own words: the last block of the prompt (after any seeded context or quote). */
const lastBlock = (prompt: string) => prompt.split("\n\n").at(-1)?.trim() ?? ""

/** The filer's view of the user message inside its utility prompt. */
const exchangeUser = (prompt: string) => /^User: (.*)$/m.exec(prompt)?.[1] ?? ""

const echoReply = (request: RunRequest): string => {
  if (request.mode === "utility" && request.prompt.startsWith("Lab hypothesis:")) {
    const current =
      /--- skill chief-of-staff ---\n([\s\S]*?)(?=\n\n--- skill |$)/.exec(request.prompt)?.[1] ?? ""
    return JSON.stringify({
      skill: "chief-of-staff",
      hypothesis: "Shorter openings will cut 'more' taps",
      content: `${current.trim()}\n- Open with the answer in under 15 words.\n`,
    })
  }
  if (request.mode === "utility" && request.prompt.startsWith("Visual check:"))
    return JSON.stringify({ ok: true, problems: [] })
  if (request.mode === "utility" && request.prompt.startsWith("Judge:"))
    return JSON.stringify({ winner: "A" })
  if (request.mode === "utility" && request.prompt.startsWith("Merge memories:")) {
    const newer = /^Newer \([^)]*\): (.*)$/m.exec(request.prompt)?.[1] ?? ""
    return `Merged: ${newer}`
  }
  if (request.mode === "utility" && request.prompt.startsWith("Profile rewrite:")) {
    const notes = request.prompt.split("\n").filter((line) => line.startsWith("- (")).length
    return `Profile built from ${notes} notes.`
  }
  if (request.mode === "utility" && request.prompt.startsWith("Goal check-in: ")) {
    const title = request.prompt.split("\n")[0]?.slice("Goal check-in: ".length) ?? ""
    return `Checking in on ${title}: nothing has moved since you set it. Want me to draft the first step?`
  }
  if (request.mode === "utility") {
    const user = exchangeUser(request.prompt)
    // Topic state directives: [[resolved]] closes the topic, [[decide:X]] records a costly decision.
    const decision = /\[\[decide:([^\]]+)\]\]/.exec(user)?.[1]
    const state = {
      resolved: user.includes("[[resolved]]"),
      summary: user.includes("[[resolved]]") ? "All settled." : "Still in progress.",
      stakes: decision === undefined ? "low" : "costly",
      ...(decision === undefined ? {} : { decision }),
    }
    const newTopic = /\[\[topic:([^\]]+)\]\]/.exec(user)?.[1]
    if (newTopic !== undefined) return JSON.stringify({ topic: "new", title: newTopic, ...state })
    if (user.includes("[[back]]")) return JSON.stringify({ topic: "T1", ...state })
    return JSON.stringify({ topic: "T0", title: "Echo chat", ...state })
  }
  const said = lastBlock(request.prompt)
  if (said.includes("[[long]]")) return LONG_ANSWER
  if (said.includes("[[table]]"))
    return "Here are the quotes:\n\n| Builder | Price |\n| --- | --- |\n| Hale & Co. | $4,200 |\n| Brightline | $5,100 |"
  const seeded = request.prompt.startsWith("Context from this conversation")
    ? " (with context)"
    : ""
  const images = request.images?.length ?? 0
  const seen = images === 0 ? "" : ` (saw ${images} image${images === 1 ? "" : "s"})`
  return `Echo: ${said}${seeded}${seen}`
}

/** UI components the echo provider renders through Domo's real MCP endpoint, by directive. */
const ECHO_COMPONENTS: ReadonlyArray<readonly [string, string, unknown]> = [
  [
    "[[choice]]",
    "render_choice",
    {
      question: "Which contractor should we book?",
      options: [
        { value: "hale", label: "Hale & Co.", consequence: "Starts Dec 2" },
        { value: "birch", label: "Birch Build", consequence: "Starts Jan 15" },
      ],
      reversible: true,
      recommended: "hale",
    },
  ],
  ["[[start-topic]]", "start_topic", { title: "How Teams Ship" }],
  ["[[rename-topic]]", "rename_topic", { title: "Renamed Plans" }],
  [
    "[[questions]]",
    "render_questions",
    {
      questions: [
        { question: "How much time do you have each week?", placeholder: "A few hours" },
        { question: "What do you already have to build on?" },
      ],
    },
  ],
  [
    "[[comparison]]",
    "render_comparison",
    {
      attributes: ["Price", "Start"],
      rows: [
        { option: "Hale & Co.", values: ["$18.4k", "Dec 2"] },
        { option: "Birch Build", values: ["$16.9k", "Jan 15"] },
      ],
      recommended: "Hale & Co.",
    },
  ],
  [
    "[[visual]]",
    "render_visual",
    {
      title: "How a turn flows",
      summary: "Three steps: your message, Domo routes it, a model answers.",
      html: '<svg viewBox="0 0 300 80" width="100%" role="img"><rect x="4" y="20" width="80" height="40" rx="8" fill="none" stroke="var(--ink)"/><rect x="110" y="20" width="80" height="40" rx="8" fill="var(--accent)"/><rect x="216" y="20" width="80" height="40" rx="8" fill="none" stroke="var(--ink)"/></svg><p id="note">Tap a step.</p><div style="height:240px"></div><script>document.getElementById("note").textContent = "Scripts run."</script>',
    },
  ],
  [
    "[[checklist]]",
    "render_checklist",
    {
      items: [
        { label: "Measure the kitchen", done: true },
        { label: "Book the deposit call", done: false },
      ],
    },
  ],
]

/** Orchestration directives: hand off through Domo's real delegate/council tools. */
const ECHO_ORCHESTRATION: ReadonlyArray<readonly [string, string, unknown]> = [
  ["[[delegate]]", "delegate", { model: "codex", task: "Summarize the plan in one line" }],
  [
    "[[council]]",
    "council",
    { question: "Name the project", models: ["opus", "codex", "sonnet"], rounds: 2 },
  ],
  [
    "[[goal]]",
    "set_goal",
    {
      title: "Ship kettlebell v2",
      outcome: "v2 live in the App Store",
      due: "2026-12-15",
      cadenceDays: 1,
    },
  ],
  [
    "[[task]]",
    "start_task",
    { title: "Gather contractor quotes", instructions: "[[slow]] Gather three contractor quotes" },
  ],
  [
    "[[instructions]]",
    "propose_instructions_change",
    {
      content: "# Domo\n\nKeep answers under 100 words.",
      change: "Add: Keep answers under 100 words",
    },
  ],
  [
    "[[ask]]",
    "ask_user",
    {
      question: "Push the branch to GitHub?",
      action: "git push",
      consequence: "Publishes the commits",
    },
  ],
]

const decodeText = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.String))

/** The first text block of an MCP tool result (JSON or SSE-framed JSON-RPC). */
const toolText = (body: string): string => {
  const quoted = /"text":("(?:[^"\\]|\\.)*")/.exec(body)?.[1]
  return quoted === undefined ? "" : Option.getOrElse(decodeText(quoted), () => "")
}

/** Fake tool activity for `[[work]]`, so receipts and "view" can be tested. */
const workEvents = (runId: RunId): ReadonlyArray<AgentEvent> => [
  { _tag: "ToolStarted", runId, callId: "w1", name: "Edit", input: { file_path: "/project/a.ts" } },
  { _tag: "FileChanged", runId, path: "/project/a.ts" },
  { _tag: "ToolFinished", runId, callId: "w1", ok: true, summary: "Updated a.ts" },
  { _tag: "ToolStarted", runId, callId: "w2", name: "Bash", input: { command: "bun test" } },
  { _tag: "ToolFinished", runId, callId: "w2", ok: true, summary: "12 tests passed" },
]

/**
 * Deterministic provider for end-to-end tests and Lab shadow runs. It echoes the
 * user's words, streams them word by word, and understands test directives:
 * `[[long]]` (a long answer), `[[topic:Name]]` (file into a new topic),
 * `[[back]]` (file into the most recent other topic), `[[resolved]]` and
 * `[[decide:X]]` (topic state for the filer), `[[choice]]`,
 * `[[comparison]]`, `[[checklist]]` (rendered through Domo's real MCP endpoint)
 * `[[delegate]]` and `[[council]]` (orchestration through the same endpoint)
 * and `[[work]]` (fake tool activity for a work receipt).
 */
export const layerEcho = Layer.succeed(
  Providers,
  Providers.of({
    run: (request) => {
      const runId = request.runId
      const text = echoReply(request)
      const said = lastBlock(request.prompt)
      const sessionId = request.sessionId ?? `echo-${runId}`
      const component = [...ECHO_COMPONENTS, ...ECHO_ORCHESTRATION].find(([directive]) =>
        said.includes(directive),
      )
      // Domo's tools run for real; ask_user's answer is echoed back so tests can see it arrived.
      const call =
        component === undefined || request.mcp === undefined || request.mode === "utility"
          ? undefined
          : callDomoTool(request.mcp, component[1], component[2]).pipe(
              Effect.map(toolText),
              Effect.orDie,
            )
      const echoesResult = component?.[1] === "ask_user"
      const opening: ReadonlyArray<AgentEvent> = [
        { _tag: "RunStarted", runId, sessionId },
        ...(said.includes("[[work]]") ? workEvents(runId) : []),
        // Claude streams token deltas; Codex delivers whole messages.
        ...(request.model.provider === "codex" ? [text] : text.split(/(?<= )/)).map(
          (part): AgentEvent => ({ _tag: "TextDelta", runId, text: part }),
        ),
      ]
      const completed = (result: string): AgentEvent => ({
        _tag: "RunCompleted",
        runId,
        text: echoesResult ? `${text} ${result}` : text,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      })
      // [[slow]] anywhere in the prompt (e.g. a background task's instructions) takes 2 seconds.
      const pause = request.prompt.includes("[[slow]]") ? Effect.sleep("2 seconds") : Effect.void
      return Stream.fromIterable(opening).pipe(
        Stream.concat(
          Stream.unwrap(
            pause
              .pipe(Effect.andThen(call ?? Effect.succeed("")))
              .pipe(
                Effect.map((result) =>
                  Stream.fromIterable<AgentEvent>([
                    ...(echoesResult
                      ? [{ _tag: "TextDelta" as const, runId, text: ` ${result}` }]
                      : []),
                    completed(result),
                  ]),
                ),
              ),
          ),
        ),
      )
    },
  }),
)
