import { randomUUID } from "node:crypto"
import {
  ChecklistInput,
  ChoiceInput,
  ChoiceOption,
  ComparisonInput,
  ComponentId,
  type FileMediaType,
  Goal,
  GoalId,
  GoalStatus,
  MAX_IMAGES,
  Message,
  QuestionsInput,
  RunId,
  TaskId,
  type UiComponent,
  VisualInput,
} from "@domo/domain"
import {
  Clock,
  Context,
  DateTime,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Option,
  Ref,
  Schema,
} from "effect"
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from "effect/ai"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { Tasks } from "../conductor/Tasks.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { GoalStore } from "../goals/GoalStore.ts"
import { Images } from "../images/Images.ts"
import { INSTRUCTIONS_MAX, Instructions } from "../instructions/Instructions.ts"
import { Memory } from "../memory/Memory.ts"
import { MemoryType } from "../memory/note.ts"
import { labelFor, MODEL_ALIASES, resolveModel } from "../models/registry.ts"
import { Notifier } from "../notify/Notifier.ts"
import { Providers } from "../providers/Providers.ts"
import { Reminders } from "../reminders/Reminders.ts"
import { makePlacement } from "../topics/placement.ts"
import { VisualCheck } from "../visual/VisualCheck.ts"
import { runCouncil, runModel, SUBAGENT_PERSONA } from "./orchestration.ts"
import { readSkill } from "./skills.ts"

/** Header every provider sends so tool calls attach to the right reply. */
export const RUN_HEADER = "x-domo-run"

class CurrentRun extends Context.Service<CurrentRun, { readonly runId: RunId }>()(
  "domo/mcp/CurrentRun",
) {}

class UnknownRun extends Schema.Error<UnknownRun>("UnknownRun")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("UnknownRun"),
  code: Schema.tag(-32001),
}) {}

const RunContext = McpServer.middleware<{ provides: CurrentRun }>()((effect, { headers }) => {
  const runId = headers[RUN_HEADER]
  return typeof runId === "string" && runId.length > 0
    ? Effect.provideService(effect, CurrentRun, { runId: RunId.make(runId) })
    : Effect.fail(new UnknownRun({ message: "This tool only works inside a Domo conversation." }))
})

const RULES =
  "Use at most one component per reply, after one sentence that states your recommendation. " +
  "It appears below your reply's text, so refer to it as below, never above. " +
  "Prefer prose; use a component only when the user must act, compare, or follow steps."

const RenderChoice = Tool.make("render_choice", {
  description:
    "Ask the user to decide between 2–4 options; they can always answer in their own words instead. " +
    "Set reversible=false for anything that can't be undone, and say the consequence on each option. " +
    "After calling this, end your reply and wait for their answer. " +
    RULES,
  parameters: ChoiceInput,
  success: Schema.String,
  dependencies: [CurrentRun],
})

const RenderQuestions = Tool.make("render_questions", {
  description:
    "Ask 2–4 short open questions at once; the user answers each in its own box and sends them " +
    "together, and any can be left blank. Use it only when the questions are quick and related; " +
    "for one question, or one with likely answers, ask in prose or use render_choice. Don't also " +
    "number the questions in your text. After calling this, end your reply and wait for the answers. " +
    RULES,
  parameters: QuestionsInput,
  success: Schema.String,
  dependencies: [CurrentRun],
})

const RenderComparison = Tool.make("render_comparison", {
  description:
    "Show 2–4 options side by side on up to 4 attributes (values in the same order as attributes). " +
    "Mark your pick in `recommended` (must equal one row's option). " +
    RULES,
  parameters: ComparisonInput,
  success: Schema.String,
  dependencies: [CurrentRun],
})

const RenderChecklist = Tool.make("render_checklist", {
  description:
    "Show a plan or steps as a checklist (1–12 items); calling it again replaces the checklist, so " +
    "use it to tick items off as work progresses. " +
    RULES,
  parameters: ChecklistInput,
  success: Schema.String,
  dependencies: [CurrentRun],
})

const RenderVisual = Tool.make("render_visual", {
  description:
    "Show a small self-contained HTML visual inline, like a diagram, an interactive explainer, a chart " +
    "or a tiny calculator, when a picture explains better than prose. Never for plain text, decisions " +
    "(render_choice) or tables of options (render_comparison). It runs in a sandboxed frame with no " +
    "network: inline all CSS and JS, draw with inline SVG or canvas, no external URLs, fonts or images. " +
    "Domo's theme is available as CSS variables: --paper, --ink, --accent, --pencil, --font-prose, " +
    "--font-hand; use them, with a transparent background. Layout rules, because it is shown from " +
    "340px to 700px wide: draw diagrams as ONE <svg viewBox=...> with width 100% so everything " +
    "scales together; never lay out a diagram with absolutely positioned HTML boxes or fixed pixel " +
    "widths. Keep labels outside or well inside shapes with room to spare, text at least 13px at " +
    "340px, at most about 8 labelled parts, and leave margins inside the viewBox. Controls (sliders, " +
    "buttons) go in normal flow above or below the drawing. Motion only if it explains a flow, " +
    "slow and looping gently. Colors only from the theme variables (so it works in light and dark): " +
    "text in --ink or --pencil at full opacity, never translucent shapes over text. Grow in height, never scroll inside. `summary` says in words what it shows. " +
    RULES,
  parameters: VisualInput,
  success: Schema.String,
  dependencies: [CurrentRun],
})

/** A visual goes back for fixes at most this many times before it is shown anyway. */
const MAX_VISUAL_FIXES = 2

const MODELS = `Models: ${MODEL_ALIASES.join(", ")} (or provider:id).`

const Delegate = Tool.make("delegate", {
  description:
    "Hand one well-scoped task to another model (from either provider) and get its result back. " +
    "Good for implementation (codex), a second opinion, focused research, or cheap fan-out (haiku). " +
    "The subagent has its own tools but not these Domo tools. Give it everything it needs in `task`. " +
    MODELS,
  parameters: Schema.Struct({
    model: Schema.NonEmptyString,
    task: Schema.NonEmptyString,
    cwd: Schema.optionalKey(Schema.String),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const Council = Tool.make("council", {
  description:
    "Ask 2–5 models (mix providers) the same question independently, then have each blind-critique " +
    "the others (rounds: 2). Returns all answers and critiques for you to converge. Use for design, " +
    "naming, strategy or ambiguous research — not for simple questions. Before calling, tell the user " +
    `in one sentence that you're asking several models. ${MODELS}`,
  parameters: Schema.Struct({
    question: Schema.NonEmptyString,
    models: Schema.Array(Schema.NonEmptyString).pipe(
      Schema.check(Schema.isMinLength(2), Schema.isMaxLength(5)),
    ),
    rounds: Schema.optionalKey(Schema.Literals([1, 2])),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const AskUser = Tool.make("ask_user", {
  description:
    "Ask the user and WAIT for their answer before continuing. Required before any guarded action " +
    "(git push, publish, deploy, deleting files, system settings, sending anything outside, spending " +
    "money): set `action` to the guarded action named in the refusal, say exactly what you'll do and " +
    "its consequence, and only proceed if they approve. Also use it for decisions you can't continue " +
    "without. Default options are Go ahead / Not now.",
  parameters: Schema.Struct({
    question: Schema.NonEmptyString,
    action: Schema.optionalKey(Schema.String),
    consequence: Schema.optionalKey(Schema.String),
    options: Schema.optionalKey(
      Schema.Array(ChoiceOption).pipe(Schema.check(Schema.isMinLength(2), Schema.isMaxLength(4))),
    ),
    reversible: Schema.optionalKey(Schema.Boolean),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const ProposeInstructions = Tool.make("propose_instructions_change", {
  description:
    "Suggest a change to domo.md, the user's own instructions for how you behave (tone, length, " +
    "standing rules), when they ask you to behave differently from now on or a preference clearly " +
    "should stick. It shows the change and saves it only if they approve. Send the complete new " +
    "file in `content` (keep their wording, change only what's needed) and, in `change`, the exact " +
    "words added or removed (e.g. 'Add: Keep answers under 100 words').",
  parameters: Schema.Struct({
    content: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(INSTRUCTIONS_MAX))),
    change: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(120))),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const StartTask = Tool.make("start_task", {
  description:
    "Run long or multi-step work in the background (more than a couple of minutes: a migration, a " +
    "research sweep, a large refactor) so the chat stays free. The task gets its own reply, which " +
    "fills in when it's done; it can ask the user and render components like you. Give it complete, " +
    "self-contained instructions. Then tell the user in one sentence what's running and end your " +
    `reply. ${MODELS}`,
  parameters: Schema.Struct({
    title: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(80))),
    instructions: Schema.NonEmptyString,
    model: Schema.optionalKey(Schema.String),
    cwd: Schema.optionalKey(Schema.String),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const TaskStatus = Tool.make("task_status", {
  description: "List background tasks that are still running, with how long each has run.",
  success: Schema.String,
})

const CancelTask = Tool.make("cancel_task", {
  description:
    "Stop a running background task (when the user asks to stop it, or it's no longer needed).",
  parameters: Schema.Struct({ taskId: Schema.NonEmptyString }),
  success: Schema.String,
})

const SetGoal = Tool.make("set_goal", {
  description:
    "Record a durable outcome the user wants (e.g. 'ship kettlebell v2 by December'). Domo checks in on " +
    "it when they come back. Use when the user states a goal or commitment, not for one-off tasks.",
  parameters: Schema.Struct({
    title: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(80))),
    outcome: Schema.NonEmptyString,
    due: Schema.optionalKey(Schema.String),
    cadenceDays: Schema.optionalKey(
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 30 }))),
    ),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const UpdateGoal = Tool.make("update_goal", {
  description:
    "Record progress on a goal, change its cadence or due date, or mark it done or dropped. Add a short " +
    "progress note whenever real progress happens in conversation.",
  parameters: Schema.Struct({
    id: Schema.NonEmptyString,
    note: Schema.optionalKey(Schema.String),
    status: Schema.optionalKey(GoalStatus),
    due: Schema.optionalKey(Schema.String),
    cadenceDays: Schema.optionalKey(
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 30 }))),
    ),
  }),
  success: Schema.String,
})

const ListGoals = Tool.make("list_goals", {
  description: "List the user's active goals with their ids, due dates and latest progress.",
  success: Schema.String,
})

const Remember = Tool.make("remember", {
  description:
    "Keep one durable fact for future conversations: who the user is and their preferences (user), how " +
    "they want you to work (feedback), ongoing projects and constraints (project), or where something " +
    "lives (reference). One fact per memory. `why` must say why it will still matter later; skip " +
    "anything that only matters today. Reusing a name supersedes that memory.",
  parameters: Schema.Struct({
    name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(60))),
    type: MemoryType,
    fact: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1200))),
    why: Schema.NonEmptyString,
  }),
  success: Schema.String,
})

const Recall = Tool.make("recall", {
  description:
    "Search long-term memory and past topics. Use before answering anything that depends on earlier " +
    "conversations or the user's preferences. When you use a result, say where it came from in a few " +
    "words (e.g. 'you decided on Nov 4').",
  parameters: Schema.Struct({ query: Schema.NonEmptyString }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const Forget = Tool.make("forget", {
  description: "Retire a memory that's wrong or no longer true (it's archived, not deleted).",
  parameters: Schema.Struct({ name: Schema.NonEmptyString, reason: Schema.NonEmptyString }),
  success: Schema.String,
})

const ReadSkill = Tool.make("read_skill", {
  description:
    "Read the full instructions of one of your skills (listed in your instructions) before using it.",
  parameters: Schema.Struct({ name: Schema.NonEmptyString }),
  success: Schema.String,
})

const TopicTitle = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(60)))

const StartTopic = Tool.make("start_topic", {
  description:
    "Begin a new topic from this exchange, when the user wants a subject to have its own topic. " +
    "This exchange moves there, the user's next messages continue in it, and it gets its own " +
    "folder for notes.md and files. Use rename_topic instead when this conversation already is " +
    "that subject.",
  parameters: Schema.Struct({ title: TopicTitle }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const RenameTopic = Tool.make("rename_topic", {
  description:
    "Rename the topic this conversation is in (and its folder), when the user names the subject " +
    "it's really about. Everything in it stays; only the name and folder path change.",
  parameters: Schema.Struct({ title: TopicTitle }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

const FILE_TYPES: Record<string, FileMediaType> = {
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
  svg: "image/svg+xml",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
}

const fileName = (path: string) => path.split("/").at(-1) ?? path

/** At most this many files on one reply. */
const MAX_FILES = 6

const Schedule_ = Tool.make("schedule", {
  description:
    "Say or do something at a set time: a reminder, a follow-up, a check-in. At `at` you post " +
    "`note` into this topic and the user gets a phone notification. With `task`, that work runs " +
    "in the background at that time instead and its result is what you post. Use the current " +
    "time in your instructions to work out `at`. Only tell the user you'll remind or follow up " +
    "after this has confirmed it.",
  parameters: Schema.Struct({
    at: Schema.NonEmptyString.annotate({
      description: "When, as ISO 8601 with the user's UTC offset, e.g. 2026-11-24T09:00:00-06:00",
    }),
    note: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(500))),
    task: Schema.optionalKey(Schema.NonEmptyString),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const AttachFile = Tool.make("attach_file", {
  description:
    "Hand the user a file you made, shown in your reply: images (PNG, JPEG, WebP, GIF) appear as " +
    "pictures; a deck or page (HTML), PDF, SVG, Markdown, text or CSV appears as a card that opens " +
    "in Domo's viewer. Use it for logos, mockups, proposal decks, one-pagers and documents. Up to " +
    "4 images and 6 files per reply.",
  parameters: Schema.Struct({
    path: Schema.NonEmptyString,
    name: Schema.optionalKey(Schema.NonEmptyString.annotate({ description: "What the card says" })),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const ExportPdf = Tool.make("export_pdf", {
  description:
    "Turn an HTML file (a deck, a one-pager, a brand book) into a PDF beside it and attach the " +
    "PDF. Size each slide with CSS: `@page { size: 1920px 1080px; margin: 0 }` and one " +
    "`<section>` per page with `break-after: page`.",
  parameters: Schema.Struct({ path: Schema.NonEmptyString }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const SnapshotHtml = Tool.make("snapshot_html", {
  description:
    "Turn an HTML page you write into a PNG and show it in your reply: the way to show a design " +
    "mockup, cover, logo or social card as a real picture. Write a complete page sized to " +
    "width (default 1200). Give a height only for a fixed format (a 1200x630 social card); " +
    "without one the picture is exactly as tall as the content. Web fonts may load from Google " +
    "Fonts, nothing else from the network. " +
    "Returns where the PNG was saved so you can keep or reuse it.",
  parameters: Schema.Struct({
    html: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(200_000))),
    width: Schema.optionalKey(
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 200, maximum: 2400 }))),
    ),
    height: Schema.optionalKey(
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 200, maximum: 2400 }))),
    ),
  }),
  success: Schema.String,
  dependencies: [CurrentRun],
})

const ListScheduled = Tool.make("list_scheduled", {
  description: "List the reminders and follow-ups still to come, with their ids.",
  success: Schema.String,
})

const CancelScheduled = Tool.make("cancel_scheduled", {
  description: "Cancel a reminder or follow-up by its id (from list_scheduled).",
  parameters: Schema.Struct({ id: Schema.NonEmptyString }),
  success: Schema.String,
})

export const DomoTools = Toolkit.make(
  RenderChoice,
  RenderQuestions,
  RenderComparison,
  RenderChecklist,
  RenderVisual,
  Delegate,
  Council,
  AskUser,
  ProposeInstructions,
  StartTask,
  TaskStatus,
  CancelTask,
  SetGoal,
  UpdateGoal,
  ListGoals,
  Remember,
  Recall,
  Forget,
  ReadSkill,
  StartTopic,
  RenameTopic,
  Schedule_,
  AttachFile,
  ExportPdf,
  SnapshotHtml,
  ListScheduled,
  CancelScheduled,
)

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
/** "2026-11-04" → "Nov 4" for source tags. */
const dayLabel = (isoDay: string) => dayFormat.format(new Date(`${isoDay}T12:00:00Z`))

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max)}…`)

const DomoToolHandlers = DomoTools.toLayer(
  Effect.gen(function* () {
    const bus = yield* ChatBus
    const notifier = yield* Notifier
    const instructionsFile = yield* Instructions
    const visualCheck = yield* VisualCheck
    /** How many times each run's visual was sent back for fixes. */
    const visualTries = yield* Ref.make<ReadonlyMap<string, number>>(new Map())
    const store = yield* ChatStore
    const providers = yield* Providers
    const config = yield* DomoConfig
    const fs = yield* FileSystem.FileSystem
    const tasks = yield* Tasks
    const goals = yield* GoalStore
    const memory = yield* Memory
    const reminders = yield* Reminders
    const images = yield* Images

    /** Keeps a copy of a file and adds it to the reply being written (up to MAX_FILES). */
    const showFile = Effect.fnUntraced(function* (
      bytes: Uint8Array,
      name: string,
      mediaType: FileMediaType,
    ) {
      const { runId } = yield* CurrentRun
      const run = yield* bus.lookupRun(runId)
      if (Option.isNone(run)) return "This conversation turn has already ended; nothing was shown."
      const message = yield* store.getMessage(run.value.messageId)
      if (Option.isNone(message)) return "Nothing was shown."
      const attached = message.value.files ?? []
      if (attached.length >= MAX_FILES) return `A reply can carry at most ${MAX_FILES} files.`
      const saved = yield* images.saveFile(bytes, name, mediaType).pipe(
        Effect.map(Option.some),
        Effect.catchTag("ImageRejected", () => Effect.succeed(Option.none())),
      )
      if (Option.isNone(saved)) return "That file couldn't be attached (empty or over 25 MB)."
      const updated = new Message({ ...message.value, files: [...attached, saved.value] })
      yield* store.updateMessage(updated)
      yield* bus.publish({ _tag: "MessageUpdated", message: updated })
      return `Attached "${name}" below your reply; the user can open it in Domo.`
    })

    /** Saves an image and adds it to the reply being written (up to MAX_IMAGES). */
    const showImage = Effect.fnUntraced(function* (bytes: Uint8Array, type: string) {
      const { runId } = yield* CurrentRun
      const run = yield* bus.lookupRun(runId)
      if (Option.isNone(run)) return "This conversation turn has already ended; nothing was shown."
      const message = yield* store.getMessage(run.value.messageId)
      if (Option.isNone(message)) return "Nothing was shown."
      const shown = message.value.images ?? []
      if (shown.length >= MAX_IMAGES) return `A reply can show at most ${MAX_IMAGES} images.`
      const saved = yield* images.save(bytes, type).pipe(
        Effect.map(Option.some),
        Effect.catchTag("ImageRejected", () => Effect.succeed(Option.none())),
      )
      if (Option.isNone(saved))
        return "That image couldn't be shown (wrong type, empty or over 10 MB)."
      const updated = new Message({ ...message.value, images: [...shown, saved.value] })
      yield* store.updateMessage(updated)
      yield* bus.publish({ _tag: "MessageUpdated", message: updated })
      const found = yield* images.find(saved.value.id)
      return `Shown below your reply${Option.isSome(found) ? ` (saved at ${found.value.path})` : ""}.`
    })
    const placement = makePlacement({ store, bus, fs, home: config.home })

    /**
     * Puts the component on the reply being written; a second call replaces it (one per message).
     * A component that was already answered is replaced by a fresh one, so its answer doesn't
     * carry over to a different question.
     */
    const attach = Effect.fnUntraced(function* (
      build: (id: ComponentId) => UiComponent,
      done: string,
    ) {
      const { runId } = yield* CurrentRun
      const run = yield* bus.lookupRun(runId)
      if (Option.isNone(run)) return "This conversation turn has already ended; nothing was shown."
      const message = yield* store.getMessage(run.value.messageId)
      if (Option.isNone(message)) return "Nothing was shown."
      const { resolution: answered, ...current } = message.value
      const previous = answered === undefined ? current.component : undefined
      const id = previous?._tag !== undefined ? previous.id : ComponentId.make(randomUUID())
      const updated = new Message({ ...current, component: build(id) })
      yield* store.updateMessage(updated)
      yield* bus.publish({ _tag: "MessageUpdated", message: updated })
      return done
    })

    return DomoTools.of({
      render_choice: ({ recommended, ...input }) =>
        attach(
          (id) => ({
            _tag: "Choice",
            id,
            ...input,
            // Drop a recommendation that doesn't name one of the options.
            ...(recommended !== undefined && input.options.some((o) => o.value === recommended)
              ? { recommended }
              : {}),
          }),
          "Shown. End your reply now and wait for the user's answer.",
        ),
      render_questions: (input) =>
        attach(
          (id) => ({ _tag: "Questions", id, ...input }),
          "Shown. End your reply now and wait for the user's answers.",
        ),
      render_comparison: (input) =>
        attach((id) => ({ _tag: "Comparison", id, ...input }), "Shown."),
      render_checklist: (input) => attach((id) => ({ _tag: "Checklist", id, ...input }), "Shown."),
      render_visual: Effect.fnUntraced(function* (input) {
        const { runId } = yield* CurrentRun
        const tries = (yield* Ref.get(visualTries)).get(runId) ?? 0
        const { layout, review } = yield* visualCheck.review(input)
        const problems = [...layout, ...review].slice(0, 8)
        if (tries >= MAX_VISUAL_FIXES && layout.length > 0) {
          // Out of fixes and still broken: better no picture than an unreadable one.
          yield* Ref.update(visualTries, (m) => new Map(m).set(runId, 0))
          yield* Effect.logInfo("visual dropped after fixes", layout)
          return (
            "This visual still doesn't render cleanly, so it won't be shown. Don't call render_visual again " +
            "for it; explain in prose instead, without mentioning the visual."
          )
        }
        if (tries < MAX_VISUAL_FIXES && problems.length > 0) {
          yield* Ref.update(visualTries, (m) => new Map(m).set(runId, tries + 1))
          yield* Effect.logInfo(`visual held back (${tries + 1}/${MAX_VISUAL_FIXES})`, problems)
          return (
            "Not shown yet: a check of how it renders found problems. Fix them and call render_visual " +
            `again with the whole corrected HTML (fix ${tries + 1} of ${MAX_VISUAL_FIXES}; after that it is ` +
            `shown only if nothing overlaps, overflows or is too small). Don't mention this to the user.\n${problems.map((p) => `- ${p}`).join("\n")}`
          )
        }
        yield* Ref.update(visualTries, (m) => {
          const next = new Map(m)
          next.delete(runId)
          return next
        })
        return yield* attach((id) => ({ _tag: "Visual", id, ...input }), "Shown.")
      }),

      delegate: Effect.fnUntraced(function* ({ model: name, task, cwd }) {
        const model = resolveModel(name)
        if (model === undefined) return `Unknown model "${name}". ${MODELS}`
        const { runId } = yield* CurrentRun
        const run = yield* bus.lookupRun(runId)
        const topic = Option.isSome(run) ? yield* store.getTopic(run.value.topicId) : Option.none()
        const workDir = cwd ?? (Option.isSome(topic) ? topic.value.project : undefined)
        const result = yield* runModel(providers, model, task, {
          mode: "agent",
          systemPrompt: SUBAGENT_PERSONA,
          ...(workDir === undefined ? {} : { cwd: workDir }),
        })
        yield* bus.recordDelegation(runId, {
          kind: "delegate",
          model: model.key,
          task: clip(task, 300),
          summary: clip(result.text, 400),
          ok: result.ok,
        })
        return result.ok
          ? clip(result.text, 8000)
          : `${labelFor(model)} couldn't finish: ${clip(result.text, 500)}`
      }),

      council: Effect.fnUntraced(function* ({ question, models: names, rounds }) {
        const models = names.map(resolveModel)
        const unknown = names.filter((_, i) => models[i] === undefined)
        if (unknown.length > 0) return `Unknown model(s): ${unknown.join(", ")}. ${MODELS}`
        const { runId } = yield* CurrentRun
        const transcript = yield* runCouncil(
          providers,
          question,
          models.filter((m) => m !== undefined),
          rounds ?? 2,
          labelFor,
        )
        for (const member of transcript.members) {
          yield* bus.recordDelegation(runId, {
            kind: "council",
            model: member.model.key,
            task: `Proposal ${member.label}`,
            summary: clip(member.critique?.text ?? member.answer.text, 400),
            ok: member.answer.ok,
          })
        }
        return transcript.report
      }),

      ask_user: Effect.fnUntraced(function* ({
        question,
        action,
        consequence,
        options,
        reversible,
      }) {
        const { runId } = yield* CurrentRun
        const run = yield* bus.lookupRun(runId)
        if (Option.isNone(run))
          return "This conversation turn has already ended; ask in your reply instead."
        const choices = options ?? [
          {
            value: "approve",
            label: "Go ahead",
            ...(consequence === undefined ? {} : { consequence }),
          },
          { value: "decline", label: "Not now" },
        ]
        yield* attach(
          (id) => ({
            _tag: "Choice",
            id,
            question,
            options: choices,
            reversible: reversible ?? false,
          }),
          "",
        )
        yield* Effect.forkChild(
          notifier.needsYou({ title: "Domo needs you", body: question, tag: run.value.messageId }),
        )
        const waiting = yield* bus.registerAsk(run.value.messageId)
        const answer = yield* Deferred.await(waiting).pipe(
          Effect.timeout("25 minutes"),
          Effect.option,
        )
        if (Option.isNone(answer)) {
          return "No answer yet. Stop here and tell the user, in one sentence, what you're waiting on."
        }
        if (answer.value._tag === "MovedOn") {
          return "The user moved on without answering. Don't do it; finish your reply in one sentence."
        }
        const { value, label, freeText } = answer.value
        if (freeText) return `The user replied: "${label}". Follow that.`
        if (value === "approve") {
          if (action !== undefined) yield* bus.approve(runId, action)
          return "Approved. Go ahead with exactly what you described, then report the result."
        }
        if (value === "decline")
          return "Declined. Don't do it; say in one sentence what you'll do instead."
        return `The user chose: ${label}.`
      }),

      propose_instructions_change: Effect.fnUntraced(function* ({ content, change }) {
        const { runId } = yield* CurrentRun
        const run = yield* bus.lookupRun(runId)
        if (Option.isNone(run))
          return "This conversation turn has already ended; suggest the change in your reply instead."
        yield* attach(
          (id) => ({
            _tag: "Choice",
            id,
            question: "Save this to your instructions for me?",
            options: [
              { value: "approve", label: "Save it", consequence: change },
              { value: "decline", label: "Leave them as they are" },
            ],
            reversible: true,
          }),
          "",
        )
        const answer = yield* Deferred.await(yield* bus.registerAsk(run.value.messageId)).pipe(
          Effect.timeout("25 minutes"),
          Effect.option,
        )
        if (Option.isNone(answer) || answer.value._tag === "MovedOn")
          return "Not saved: the user didn't answer. Don't mention it again unless they bring it up."
        if (answer.value.freeText)
          return `Not saved yet. The user replied: "${answer.value.label}". Adjust and propose again if it fits.`
        if (answer.value.value !== "approve") return "Not saved. Carry on as before."
        yield* instructionsFile.save(content, "domo")
        return "Saved to domo.md. Follow it from now on; confirm in one short sentence."
      }),

      start_task: Effect.fnUntraced(function* ({ title, instructions, model: name, cwd }) {
        const model = name === undefined ? undefined : resolveModel(name)
        if (name !== undefined && model === undefined) return `Unknown model "${name}". ${MODELS}`
        const { runId } = yield* CurrentRun
        return yield* tasks
          .start({
            parentRunId: runId,
            title,
            instructions,
            ...(model === undefined ? {} : { model }),
            ...(cwd === undefined ? {} : { cwd }),
          })
          .pipe(
            Effect.map(
              (task) =>
                `Started "${title}" in the background (task ${task.taskId}). Tell the user in one ` +
                "sentence; its result will appear as its own reply.",
            ),
            Effect.catchTag("TaskNotStarted", (error) =>
              Effect.succeed(`Couldn't start it: ${error.message}`),
            ),
          )
      }),

      task_status: () =>
        Effect.gen(function* () {
          const list = yield* tasks.running
          if (list.length === 0) return "No background tasks are running."
          const now = yield* Clock.currentTimeMillis
          return list
            .map(
              (t) =>
                `- ${t.title} (task ${t.taskId}), running ${Math.round((now - t.startedMs) / 60_000)} min`,
            )
            .join("\n")
        }),

      cancel_task: ({ taskId }) =>
        tasks
          .cancel(TaskId.make(taskId))
          .pipe(Effect.map((stopped) => (stopped ? "Stopped." : "No running task has that id."))),

      set_goal: Effect.fnUntraced(function* ({ title, outcome, due, cadenceDays }) {
        const { runId } = yield* CurrentRun
        const run = yield* bus.lookupRun(runId)
        const now = yield* DateTime.now
        const cadence = cadenceDays ?? 3
        const goal = new Goal({
          id: GoalId.make(randomUUID()),
          title,
          outcome,
          status: "active",
          cadenceDays: cadence,
          nextCheckInAt: DateTime.add(now, { days: cadence }),
          progress: [],
          createdAt: now,
          ...(due === undefined ? {} : { due }),
          ...(Option.isSome(run) ? { topicId: run.value.topicId } : {}),
        })
        yield* goals.save(goal)
        return `Saved goal "${title}" (id ${goal.id}). I'll check in every ${cadence} day(s).`
      }),

      update_goal: Effect.fnUntraced(function* ({ id, note, status, due, cadenceDays }) {
        const existing = yield* goals.get(GoalId.make(id))
        if (Option.isNone(existing)) return `No goal has id ${id}. Use list_goals.`
        const now = yield* DateTime.now
        const goal = existing.value
        const cadence = cadenceDays ?? goal.cadenceDays
        yield* goals.save(
          new Goal({
            ...goal,
            cadenceDays: cadence,
            ...(status === undefined ? {} : { status }),
            ...(due === undefined ? {} : { due }),
            ...(note === undefined
              ? {}
              : {
                  progress: [{ at: now, note: clip(note, 280) }, ...goal.progress].slice(0, 5),
                  // Progress resets the clock: the next check-in is a full cadence away.
                  nextCheckInAt: DateTime.add(now, { days: cadence }),
                }),
          }),
        )
        return status === "done" ? `Marked "${goal.title}" done.` : `Updated "${goal.title}".`
      }),

      list_goals: () =>
        goals.active.pipe(
          Effect.map((list) =>
            list.length === 0
              ? "No active goals."
              : list
                  .map(
                    (g) =>
                      `- ${g.title} (id ${g.id})${g.due === undefined ? "" : `, due ${g.due}`}: ${g.outcome}` +
                      (g.progress[0] === undefined ? "" : `. Latest: ${g.progress[0].note}`),
                  )
                  .join("\n"),
          ),
        ),

      remember: (input) => memory.remember(input),

      recall: Effect.fnUntraced(function* ({ query }) {
        const hits = yield* memory.recall(query, 6)
        if (hits.length === 0) return "Nothing in memory matches that."
        // Answers drawn from earlier topics carry a source tag the user can open ("view").
        const { runId } = yield* CurrentRun
        const run = yield* bus.lookupRun(runId)
        const tags = hits
          .filter((h) => h.kind === "topic" && (h.sourceMessageIds?.length ?? 0) > 0)
          .slice(0, 2)
          .map((h) => ({ label: dayLabel(h.when), messageIds: h.sourceMessageIds ?? [] }))
        if (Option.isSome(run) && tags.length > 0) {
          const message = yield* store.getMessage(run.value.messageId)
          if (Option.isSome(message)) {
            const tagged = new Message({
              ...message.value,
              sources: [...(message.value.sources ?? []), ...tags].slice(0, 3),
            })
            yield* store.updateMessage(tagged)
            yield* bus.publish({ _tag: "MessageUpdated", message: tagged })
          }
        }
        return hits
          .map((h) =>
            h.kind === "memory"
              ? `- Memory "${h.ref}" (as of ${h.when}): ${h.text}`
              : `- Topic "${h.title}" (${h.when}): ${h.text}`,
          )
          .join("\n")
      }),

      forget: ({ name, reason }) => memory.forget(name, reason),

      attach_file: Effect.fnUntraced(function* ({ path, name }) {
        const extension = path.split(".").at(-1)?.toLowerCase() ?? ""
        const bytes = yield* fs.readFile(path).pipe(Effect.option)
        if (Option.isNone(bytes)) return `Couldn't read ${path}.`
        const image = IMAGE_TYPES[extension]
        if (image !== undefined) return yield* showImage(bytes.value, image)
        const file = FILE_TYPES[extension]
        if (file === undefined) return "Attach images, HTML, PDF, SVG, Markdown, text or CSV files."
        return yield* showFile(bytes.value, name ?? fileName(path), file)
      }),
      export_pdf: Effect.fnUntraced(function* ({ path }) {
        const html = yield* fs.readFileString(path).pipe(Effect.option)
        if (Option.isNone(html)) return `Couldn't read ${path}.`
        const pdf = yield* visualCheck.pdf(html.value)
        if (Option.isNone(pdf))
          return "Chrome isn't available on this computer, so no PDF was made."
        const out = path.replace(/\.html?$/i, "") + ".pdf"
        yield* fs.writeFile(out, pdf.value).pipe(Effect.orDie)
        const shown = yield* showFile(pdf.value, fileName(out), "application/pdf")
        return `Saved ${out}. ${shown}`
      }),
      snapshot_html: Effect.fnUntraced(function* ({ html, width, height }) {
        const png = yield* visualCheck.snapshot(html, width ?? 1200, height)
        if (Option.isNone(png))
          return "Chrome isn't available on this computer, so no picture could be made."
        return yield* showImage(png.value, "image/png")
      }),
      schedule: Effect.fnUntraced(function* ({ at, note, task }) {
        const run = yield* bus.lookupRun((yield* CurrentRun).runId)
        if (Option.isNone(run)) return "This conversation turn has already ended."
        const when = DateTime.make(at)
        if (Option.isNone(when) || !/([+-]\d\d:?\d\d|Z)$/.test(at))
          return `"${at}" isn't a time I can use. Give ISO 8601 with the UTC offset.`
        const now = yield* DateTime.now
        if (DateTime.toEpochMillis(when.value) <= DateTime.toEpochMillis(now))
          return "That time has already passed. Pick a time in the future."
        const reminder = yield* reminders.add({
          topicId: run.value.topicId,
          dueAt: DateTime.toUtc(when.value),
          note,
          ...(task === undefined ? {} : { task }),
        })
        return `Scheduled (id ${reminder.id}) for ${at}: "${note}"${task === undefined ? "" : " (runs as a task)"}. Confirm to the user in one short sentence, with the day and time in their words.`
      }),
      list_scheduled: () =>
        reminders.pending.pipe(
          Effect.map((all) =>
            all.length === 0
              ? "Nothing scheduled."
              : all
                  .map(
                    (r) =>
                      `- ${r.id}: ${DateTime.formatIso(r.dueAt)} (UTC): ${r.note}${r.task === undefined ? "" : " [task]"}`,
                  )
                  .join("\n"),
          ),
        ),
      cancel_scheduled: ({ id }) =>
        reminders
          .cancel(id)
          .pipe(Effect.map((ok) => (ok ? "Cancelled." : `Nothing scheduled with id ${id}.`))),
      start_topic: Effect.fnUntraced(function* ({ title }) {
        const run = yield* bus.lookupRun((yield* CurrentRun).runId)
        if (Option.isNone(run)) return "This conversation turn has already ended."
        return yield* placement.startTopic(run.value, title)
      }),
      rename_topic: Effect.fnUntraced(function* ({ title }) {
        const run = yield* bus.lookupRun((yield* CurrentRun).runId)
        if (Option.isNone(run)) return "This conversation turn has already ended."
        return yield* placement.renameTopic(run.value, title)
      }),
      read_skill: ({ name }) =>
        readSkill(config.home, name).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
    })
  }),
)

/**
 * Domo's own MCP server, shared by both providers: the intelligent-UI tools
 * now; delegate, council and ask_user arrive with orchestration.
 */
export const DomoMcpLive = McpServer.toolkit(DomoTools).pipe(
  Layer.provide(RunContext.layer),
  Layer.provide(DomoToolHandlers),
  Layer.provide(
    McpServer.layerHttp({
      name: "domo",
      version: "0.1.0",
      path: "/mcp",
      protocols: [
        McpProtocol.v2025_11_25,
        McpProtocol.v2025_06_18,
        McpProtocol.v2025_03_26,
        McpProtocol.v2024_11_05,
      ],
    }),
  ),
)
