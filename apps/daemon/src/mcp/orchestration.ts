import { randomUUID } from "node:crypto"
import { type ModelRef, RunId } from "@domo/domain"
import { Effect, Option } from "effect"
import { collectRun } from "../conductor/collect.ts"
import type { Providers, RunRequest } from "../providers/Providers.ts"

const NO_HOOKS = {
  onSession: () => Effect.void,
  onDelta: () => Effect.void,
  onTool: () => Effect.void,
}

export const SUBAGENT_PERSONA = `You are a specialist working for Domo, the user's chief of staff.
Domo handed you one task. Do it fully, then report back: lead with the result in one or two
sentences, then only the details Domo needs. The user won't read your reply directly.`

const MEMBER_PERSONA = `You are one of several independent experts asked the same question.
Answer on your own: give your single best concrete answer or proposal and the reasoning that matters
most. Be specific and decisive. Under 220 words. No preamble.`

const CRITIC_PERSONA = `You are reviewing anonymous proposals from a panel of experts (yours is marked).
For each other proposal: one line on what's strong and one on what's risky. Then say what you'd
steal, and give your revised recommendation in two or three sentences. Under 220 words.`

export interface SubagentResult {
  readonly ok: boolean
  readonly text: string
}

/** One model run on its own, without Domo's tools (no recursion, no UI). */
export const runModel = (
  providers: Providers["Service"],
  model: ModelRef,
  prompt: string,
  options: {
    readonly mode: "agent" | "utility"
    readonly systemPrompt: string
    readonly cwd?: string
    readonly images?: RunRequest["images"]
  },
): Effect.Effect<SubagentResult> =>
  collectRun(
    providers.run({
      runId: RunId.make(randomUUID()),
      model,
      prompt,
      systemPrompt: options.systemPrompt,
      mode: options.mode,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.images === undefined ? {} : { images: options.images }),
    }),
    { sessionId: undefined, wholeMessages: model.provider === "codex" },
    NO_HOOKS,
  ).pipe(
    Effect.map((outcome) => {
      const text = outcome.completed.length > 0 ? outcome.completed : outcome.streamed
      return Option.isSome(outcome.failure)
        ? { ok: false, text: text.length > 0 ? text : outcome.failure.value }
        : { ok: true, text }
    }),
  )

const LABELS = ["A", "B", "C", "D", "E"]

export interface CouncilMember {
  readonly model: ModelRef
  readonly label: string
}

export interface CouncilTranscript {
  readonly members: ReadonlyArray<
    CouncilMember & { readonly answer: SubagentResult; readonly critique?: SubagentResult }
  >
  /** What the main agent receives: anonymous rounds, then which model was which. */
  readonly report: string
}

/**
 * A design or research council: every member answers independently (diverge),
 * then each critiques the others' anonymous proposals (blind critique). The
 * main agent converges. Members run in parallel as single tool-less turns.
 */
export const runCouncil = Effect.fn("runCouncil")(function* (
  providers: Providers["Service"],
  question: string,
  models: ReadonlyArray<ModelRef>,
  rounds: 1 | 2,
  nameOf: (model: ModelRef) => string,
) {
  const members = models.map((model, i): CouncilMember => ({ model, label: LABELS[i] ?? `M${i}` }))
  const member = (model: ModelRef, prompt: string, systemPrompt: string) =>
    runModel(providers, model, prompt, { mode: "utility", systemPrompt }).pipe(
      Effect.timeout("6 minutes"),
      Effect.catch(() => Effect.succeed<SubagentResult>({ ok: false, text: "(timed out)" })),
    )

  const answers = yield* Effect.forEach(members, (m) => member(m.model, question, MEMBER_PERSONA), {
    concurrency: "unbounded",
  })
  const proposals = members
    .map((m, i) => `Proposal ${m.label}:\n${answers[i]?.ok ? answers[i]?.text : "(no answer)"}`)
    .join("\n\n")

  const critiques =
    rounds === 2
      ? yield* Effect.forEach(
          members,
          (m) =>
            member(
              m.model,
              `Question: ${question}\n\n${proposals}\n\n(Yours is Proposal ${m.label}.)`,
              CRITIC_PERSONA,
            ),
          { concurrency: "unbounded" },
        )
      : []

  const report = [
    `Question: ${question}`,
    "",
    "Round 1, independent answers:",
    proposals,
    ...(rounds === 2
      ? [
          "",
          "Round 2, blind critiques and revised recommendations:",
          members
            .map(
              (m, i) =>
                `Critique by ${m.label}:\n${critiques[i]?.ok ? critiques[i]?.text : "(none)"}`,
            )
            .join("\n\n"),
        ]
      : []),
    "",
    `Who was who: ${members.map((m) => `${m.label} = ${nameOf(m.model)}`).join(", ")}.`,
    "Now converge: give the user your recommendation, name any real dissent in one line, and use",
    "render_comparison or render_choice only if it saves them reading.",
  ].join("\n")

  return {
    members: members.map((m, i) => ({
      ...m,
      answer: answers[i] ?? { ok: false, text: "" },
      ...(critiques[i] === undefined ? {} : { critique: critiques[i] }),
    })),
    report,
  } satisfies CouncilTranscript
})
