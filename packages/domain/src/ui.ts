import { Schema } from "effect"
import { ComponentId, RunId } from "./ids.ts"

/**
 * The fixed intelligent-UI vocabulary: six components. Choice, Questions, Comparison,
 * Checklist and Visual are rendered by the agent (render_* tools); WorkReceipt
 * is produced by Domo from the run itself. Adding another requires a rubric
 * change and the user's approval (see AGENTS.md).
 */

const Label = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(120)))

export const ChoiceOption = Schema.Struct({
  value: Schema.NonEmptyString,
  label: Label,
  consequence: Schema.optionalKey(Label),
})
export type ChoiceOption = typeof ChoiceOption.Type

const choiceFields = {
  question: Label,
  options: Schema.Array(ChoiceOption).pipe(
    Schema.check(Schema.isMinLength(2), Schema.isMaxLength(4)),
  ),
  reversible: Schema.Boolean,
  recommended: Schema.optionalKey(Schema.NonEmptyString),
}

/** What the agent sends to render_choice (Domo assigns the id). */
export const ChoiceInput = Schema.Struct(choiceFields)

/** Also covers approvals. Always offers free text; preselects only reversible options. */
export const Choice = Schema.TaggedStruct("Choice", { id: ComponentId, ...choiceFields })
export type Choice = typeof Choice.Type

const questionsFields = {
  questions: Schema.Array(
    Schema.Struct({ question: Label, placeholder: Schema.optionalKey(Label) }),
  ).pipe(Schema.check(Schema.isMinLength(2), Schema.isMaxLength(4))),
}

export const QuestionsInput = Schema.Struct(questionsFields)

/** A few short open questions answered inline, sent back together as one message. */
export const Questions = Schema.TaggedStruct("Questions", { id: ComponentId, ...questionsFields })
export type Questions = typeof Questions.Type

/** The user's message for a Questions card: each question with its answer (blank = skipped). */
export const formatAnswers = (questions: Questions, answers: ReadonlyArray<string>): string =>
  questions.questions
    .map(({ question }, i) => {
      const answer = answers[i]?.trim() ?? ""
      return `${question}\n${answer.length > 0 ? answer : "(skipped)"}`
    })
    .join("\n\n")

const comparisonFields = {
  attributes: Schema.Array(Label).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(4))),
  rows: Schema.Array(Schema.Struct({ option: Label, values: Schema.Array(Schema.String) })).pipe(
    Schema.check(Schema.isMinLength(2), Schema.isMaxLength(4)),
  ),
  recommended: Schema.optionalKey(Label),
}

export const ComparisonInput = Schema.Struct(comparisonFields)

export const Comparison = Schema.TaggedStruct("Comparison", {
  id: ComponentId,
  ...comparisonFields,
})
export type Comparison = typeof Comparison.Type

const checklistFields = {
  items: Schema.Array(Schema.Struct({ label: Label, done: Schema.Boolean })).pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  ),
}

export const ChecklistInput = Schema.Struct(checklistFields)

export const Checklist = Schema.TaggedStruct("Checklist", { id: ComponentId, ...checklistFields })
export type Checklist = typeof Checklist.Type

/** The most HTML one visual may carry (inline CSS, JS and SVG included). */
export const VISUAL_MAX_HTML = 100_000

const visualFields = {
  title: Label,
  /** A self-contained HTML fragment, run in a sandboxed frame with no network. */
  html: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(VISUAL_MAX_HTML))),
  /** What the visual shows, in words: read by screen readers and used wherever it can't render. */
  summary: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(600))),
}

export const VisualInput = Schema.Struct(visualFields)

export const Visual = Schema.TaggedStruct("Visual", { id: ComponentId, ...visualFields })
export type Visual = typeof Visual.Type

export const WorkStatus = Schema.Literals(["running", "done", "failed", "blocked"])
export type WorkStatus = typeof WorkStatus.Type

/** One line for any agent work; "view" opens the run (models, tools, usage, sources). */
export const WorkReceipt = Schema.TaggedStruct("WorkReceipt", {
  id: ComponentId,
  runId: RunId,
  status: WorkStatus,
  summary: Label,
  models: Schema.Array(Schema.String),
  project: Schema.optionalKey(Schema.String),
})
export type WorkReceipt = typeof WorkReceipt.Type

/** The components an agent can put on its message (at most one per message). */
export const UiComponent = Schema.Union([Choice, Questions, Comparison, Checklist, Visual])
export type UiComponent = typeof UiComponent.Type

/** A resolved Choice or Questions card collapses into an inert receipt ("Chose Hale & Co."). */
export const ComponentResolution = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  freeText: Schema.Boolean,
  /** The user moved on with a new message instead of answering. */
  skipped: Schema.optionalKey(Schema.Boolean),
  at: Schema.DateTimeUtcFromString,
})
export type ComponentResolution = typeof ComponentResolution.Type

/** Everything "view" shows about a run: tools, files, models, usage. */
export const RunDetail = Schema.Struct({
  id: RunId,
  model: Schema.String,
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      ok: Schema.Boolean,
      /** The tool's output, shortened. */
      summary: Schema.String,
      /** What the call did, in plain words ("Edited notes.md"). */
      action: Schema.optionalKey(Schema.String),
      /** Its specifics (the command, the search), shown smaller. */
      detail: Schema.optionalKey(Schema.String),
    }),
  ),
  files: Schema.Array(Schema.String),
  /** Work handed to other models (delegate) or a council's members. */
  delegations: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["delegate", "council"]),
        model: Schema.String,
        task: Schema.String,
        summary: Schema.String,
        ok: Schema.Boolean,
      }),
    ),
  ),
  usage: Schema.optionalKey(
    Schema.Struct({
      inputTokens: Schema.Int,
      outputTokens: Schema.Int,
      cachedInputTokens: Schema.Int,
    }),
  ),
})
export type RunDetail = typeof RunDetail.Type
