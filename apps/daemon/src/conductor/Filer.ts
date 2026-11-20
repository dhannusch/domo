import { randomUUID } from "node:crypto"
import { ModelRef, RunId, Stakes, type Topic, type TopicId } from "@domo/domain"
import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { Providers } from "../providers/Providers.ts"
import { Settings } from "../settings/Settings.ts"

/** Where an exchange belongs. The default — and every failure — is "same". */
export type Placement =
  | { readonly _tag: "Same"; readonly title?: string }
  | { readonly _tag: "Existing"; readonly topicId: TopicId }
  | { readonly _tag: "New"; readonly title: string }

/** Where the chosen topic now stands — what tidying, restatements and confirmations rely on. */
export interface TopicState {
  readonly resolved: boolean
  /** One sentence: where things stand. */
  readonly summary: string
  readonly decision?: string
  readonly stakes: Stakes
}

export interface Filing {
  readonly placement: Placement
  readonly state?: TopicState
}

export interface Exchange {
  readonly user: string
  readonly agent: string
}

export const FILER_MODEL = new ModelRef({ provider: "claude", id: "claude-haiku-5-5" })

const INSTRUCTIONS = `You file one chat exchange into the right topic of an ongoing conversation.
Topics are labeled T0 (the current topic), T1, T2, and so on.
Reply with JSON only, no prose:
{"topic": "T0" | "T1" | ... | "new", "title": "2-4 word topic title",
 "resolved": true | false, "summary": "one sentence: where this topic now stands",
 "decision": "what was decided, if anything was settled" (omit if nothing was decided),
 "stakes": "low" | "costly" | "irreversible"}
- Choose T0 unless the exchange is clearly about another listed topic, or clearly a new subject.
- Always give a short, plain title for the chosen topic (no quotes, no trailing punctuation).
- resolved is true only if nothing is left open: no question pending, no next step waiting on anyone.
- Write summary and decision to the user, in the second person ("you"), never "he", "she" or
  "the user". Example decision: "You'll take management only if you stay hands-on".
- stakes describes the decision: "costly" if getting it wrong costs real money or time,
  "irreversible" if it can't be undone; otherwise "low".`

const Answer = Schema.fromJsonString(
  Schema.Struct({
    topic: Schema.String,
    title: Schema.optionalKey(Schema.String),
    resolved: Schema.optionalKey(Schema.Boolean),
    summary: Schema.optionalKey(Schema.String),
    decision: Schema.optionalKey(Schema.NullOr(Schema.String)),
    stakes: Schema.optionalKey(Schema.String),
  }),
)
const decodeStakes = Schema.decodeUnknownOption(Stakes)
const decodeAnswer = Schema.decodeUnknownOption(Answer)

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max)}…`)

const describe = (topic: Topic, label: string) =>
  `${label}: ${topic.title}${topic.summary.length > 0 ? ` — ${clip(topic.summary, 200)}` : ""}`

const SAME: Filing = { placement: { _tag: "Same" } }

/** Parses the filer's reply; anything unexpected files into the current topic. */
export const parseFiling = (reply: string, candidates: ReadonlyArray<Topic>): Filing => {
  const json = /\{[\s\S]*\}/.exec(reply)?.[0]
  const answer = json === undefined ? Option.none() : decodeAnswer(json)
  if (Option.isNone(answer)) return SAME
  const a = answer.value
  const title = a.title?.trim().replace(/^"|"$/g, "")
  const hasTitle = title !== undefined && title.length > 0
  const label = a.topic.trim().toUpperCase()
  const index = Number(label.replace(/^T/, ""))
  const target = Number.isInteger(index) && index > 0 ? candidates[index] : undefined

  const placement: Placement =
    label === "NEW"
      ? hasTitle
        ? { _tag: "New", title: clip(title, 60) }
        : { _tag: "Same" }
      : target !== undefined
        ? { _tag: "Existing", topicId: target.id }
        : hasTitle
          ? { _tag: "Same", title: clip(title, 60) }
          : { _tag: "Same" }
  // A "new" without a title fell back to Same, so its state would describe the wrong topic.
  if (label === "NEW" && !hasTitle) return SAME

  const summary = a.summary?.trim()
  if (summary === undefined || summary.length === 0) return { placement }
  const decision = a.decision?.trim()
  return {
    placement,
    state: {
      resolved: a.resolved === true,
      summary: clip(summary, 280),
      stakes: Option.getOrElse(decodeStakes(a.stakes), () => "low" as const),
      ...(decision === undefined || decision.length === 0 ? {} : { decision: clip(decision, 200) }),
    },
  }
}

/**
 * Files each exchange after it happens, in the background, with a cheap
 * tool-less model call. Routing never delays the user's message.
 */
export class Filer extends Context.Service<
  Filer,
  {
    file(exchange: Exchange, current: Topic, others: ReadonlyArray<Topic>): Effect.Effect<Filing>
  }
>()("domo/conductor/Filer") {
  static readonly layer = Layer.effect(
    Filer,
    Effect.gen(function* () {
      const providers = yield* Providers
      const settings = yield* Settings

      const file = Effect.fn("Filer.file")(
        function* (exchange: Exchange, current: Topic, others: ReadonlyArray<Topic>) {
          const candidates = [current, ...others]
          const prompt = [
            ...candidates.map((topic, i) => describe(topic, i === 0 ? "T0 (current)" : `T${i}`)),
            "",
            "Exchange:",
            `User: ${clip(exchange.user, 800)}`,
            `Domo: ${clip(exchange.agent, 600)}`,
          ].join("\n")

          const reply = yield* Ref.make("")
          yield* providers
            .run({
              runId: RunId.make(randomUUID()),
              model: yield* settings.backgroundModel,
              prompt,
              systemPrompt: INSTRUCTIONS,
              mode: "utility",
            })
            .pipe(
              Stream.runForEach((event) =>
                event._tag === "RunCompleted" ? Ref.set(reply, event.text) : Effect.void,
              ),
            )
          return parseFiling(yield* Ref.get(reply), candidates)
        },
        Effect.timeout("45 seconds"),
        Effect.catch((error) => Effect.logWarning("filing skipped", error).pipe(Effect.as(SAME))),
      )

      return Filer.of({ file })
    }),
  )
}
