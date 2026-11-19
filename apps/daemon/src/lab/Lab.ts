import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, type LabChange, ModelRef } from "@domo/domain"
import {
  Clock,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schedule,
  Schema,
} from "effect"
import { SqlClient } from "effect/sql"
import { ChatStore } from "../chat/ChatStore.ts"
import { PERSONA } from "../conductor/persona.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { runModel } from "../mcp/orchestration.ts"
import { HomeGit } from "../memory/HomeGit.ts"
import { Presence } from "../presence/Presence.ts"
import { Providers } from "../providers/Providers.ts"
import { Settings } from "../settings/Settings.ts"
import { Telemetry } from "../telemetry/Telemetry.ts"
import { describeFriction, frictionScore, regressed } from "./friction.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")
const WATCH_DAYS = 7
const GOLDEN = 5
/** The judge is always from the other provider, so a model never grades its own family's change. */
const CANDIDATE_MODEL = DEFAULT_MAIN_MODEL
const JUDGE_MODEL = new ModelRef({ provider: "codex", id: "default" })

const LedgerEntry = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  kind: Schema.Literals(["experiment", "watch"]),
  skill: Schema.String,
  hypothesis: Schema.String,
  decision: Schema.Literals(["promoted", "discarded", "kept", "reverted"]),
  wins: Schema.optionalKey(
    Schema.Struct({ candidate: Schema.Int, baseline: Schema.Int, ties: Schema.Int }),
  ),
  commit: Schema.optionalKey(Schema.String),
  baselineFriction: Schema.optionalKey(Schema.Number),
  watchUntil: Schema.optionalKey(Schema.String),
  afterFriction: Schema.optionalKey(Schema.Number),
})
type LedgerEntry = typeof LedgerEntry.Type
const decodeEntry = Schema.decodeUnknownOption(Schema.fromJsonString(LedgerEntry))
const encodeEntry = Schema.encodeSync(Schema.fromJsonString(LedgerEntry))

const Proposal = Schema.fromJsonString(
  Schema.Struct({ skill: Schema.String, hypothesis: Schema.String, content: Schema.String }),
)
const decodeProposal = Schema.decodeUnknownOption(Proposal)
const Verdict = Schema.fromJsonString(Schema.Struct({ winner: Schema.Literals(["A", "B", "tie"]) }))
const decodeVerdict = Schema.decodeUnknownOption(Verdict)
const json = (text: string) => /\{[\s\S]*\}/.exec(text)?.[0] ?? ""

const HYPOTHESIS_INSTRUCTIONS = `You improve an AI chief of staff by editing one of its skills.
Given the friction users hit and the skills, pick the single skill edit most likely to reduce it.
Reply with JSON only: {"skill": "<existing skill name>", "hypothesis": "<one falsifiable sentence>",
"content": "<the complete new SKILL.md, frontmatter included, same name>"}. Make the smallest change that tests it.`

export interface LabReport {
  readonly experiment: "skipped" | "promoted" | "discarded"
  readonly reverted: number
}

/**
 * The Lab, while the user is away: turn friction into one hypothesis, test the
 * skill edit on recent real exchanges against the current skill (judged blind
 * by the other provider), promote only on a win, and roll back any promotion
 * that raised friction within its 7-day watch. It edits skills in ~/.domo only;
 * the constitution, rubric and judge prompt are human-owned and never touched.
 */
export class Lab extends Context.Service<
  Lab,
  {
    readonly run: Effect.Effect<LabReport>
    /** Promoted changes, newest first, with whether they're still watched, kept or undone. */
    readonly changes: Effect.Effect<ReadonlyArray<LabChange>>
    /** Reverts one promoted change now (the user's call, from settings). */
    undo(id: string): Effect.Effect<boolean>
  }
>()("domo/lab/Lab") {
  static readonly layer = Layer.effect(
    Lab,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const sql = yield* SqlClient.SqlClient
      const store = yield* ChatStore
      const telemetry = yield* Telemetry
      const providers = yield* Providers
      const git = yield* HomeGit
      const { home } = yield* DomoConfig
      const ledgerPath = join(home, "lab", "ledger.jsonl")
      const skillPath = (name: string) => join(home, "skills", name, "SKILL.md")

      const ledger = fs.readFileString(ledgerPath).pipe(
        Effect.map((text) => text.split("\n").flatMap((line) => Option.toArray(decodeEntry(line)))),
        Effect.orElseSucceed(() => [] as Array<LedgerEntry>),
      )
      const append = (entry: LedgerEntry) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(join(home, "lab"), { recursive: true })
          const existing = yield* fs.readFileString(ledgerPath).pipe(Effect.orElseSucceed(() => ""))
          yield* fs.writeFileString(ledgerPath, `${existing}${encodeEntry(entry)}\n`)
        }).pipe(Effect.orDie)

      const frictionBetween = Effect.fnUntraced(function* (from: string, to: string) {
        const counts = yield* telemetry.countsBetween(from, to)
        const rows = yield* sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ${from} AND created_at < ${to}
        `.pipe(Effect.orDie)
        return { counts, score: frictionScore(counts, rows[0]?.n ?? 0) }
      })

      const golden = Effect.gen(function* () {
        const messages = yield* store.recentMessages(200)
        const pairs: Array<{ readonly user: string; readonly agent: string }> = []
        for (let i = 0; i + 1 < messages.length; i++) {
          const u = messages[i]
          const a = messages[i + 1]
          if (
            u?.role === "user" &&
            a?.role === "agent" &&
            a.status === "done" &&
            a.model !== undefined
          ) {
            pairs.push({ user: u.text, agent: a.text })
          }
        }
        return pairs.slice(-GOLDEN)
      })

      const judgePrompt = fs
        .readFileString(join(REPO_ROOT, "evals", "rubric", "judge-prompt.md"))
        .pipe(
          Effect.orElseSucceed(
            () => 'Judge which answer is better for the user. Reply JSON {"winner":"A"|"B"|"tie"}.',
          ),
        )

      /** Pairwise, blind; the candidate takes A and B in turn so order bias cancels out. */
      const evaluate = Effect.fnUntraced(function* (
        skill: string,
        current: string,
        candidate: string,
      ) {
        const cases = yield* golden
        const judge = yield* judgePrompt
        const withSkill = (content: string) => `${PERSONA}\n\nSkill ${skill}:\n${content}`
        let candidateWins = 0
        let baselineWins = 0
        let ties = 0
        for (const [i, c] of cases.entries()) {
          const [baseline, proposed] = yield* Effect.all(
            [
              runModel(providers, CANDIDATE_MODEL, c.user, {
                mode: "utility",
                systemPrompt: withSkill(current),
              }),
              runModel(providers, CANDIDATE_MODEL, c.user, {
                mode: "utility",
                systemPrompt: withSkill(candidate),
              }),
            ],
            { concurrency: 2 },
          )
          const candidateIsA = i % 2 === 0
          const [a, b] = candidateIsA
            ? [proposed.text, baseline.text]
            : [baseline.text, proposed.text]
          const verdict = yield* runModel(
            providers,
            JUDGE_MODEL,
            `Judge:\nRequest: ${c.user}\n\nAnswer A:\n${a}\n\nAnswer B:\n${b}`,
            { mode: "utility", systemPrompt: judge },
          )
          const winner = Option.map(decodeVerdict(json(verdict.text)), (v) => v.winner)
          if (Option.isNone(winner) || winner.value === "tie") ties++
          else if ((winner.value === "A") === candidateIsA) candidateWins++
          else baselineWins++
        }
        return { candidate: candidateWins, baseline: baselineWins, ties }
      })

      const experiment = Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const now = DateTime.formatIso(DateTime.makeUnsafe(nowMs))
        const weekAgo = DateTime.formatIso(DateTime.makeUnsafe(nowMs - WATCH_DAYS * 86_400_000))
        const friction = yield* frictionBetween(weekAgo, now)
        if (friction.score === 0 || (yield* golden).length < 3) return "skipped" as const

        const names = (yield* fs
          .readDirectory(join(home, "skills"))
          .pipe(Effect.orElseSucceed(() => []))).filter((n) => n !== "lab")
        const skills = yield* Effect.forEach(names, (name) =>
          fs.readFileString(skillPath(name)).pipe(
            Effect.map((content) => ({ name, content })),
            Effect.orElseSucceed(() => ({ name, content: "" })),
          ),
        )
        const proposalText = yield* runModel(
          providers,
          CANDIDATE_MODEL,
          [
            `Lab hypothesis:\nFriction this week: ${describeFriction(friction.counts)}`,
            ...skills.map((s) => `--- skill ${s.name} ---\n${s.content}`),
          ].join("\n\n"),
          { mode: "utility", systemPrompt: HYPOTHESIS_INSTRUCTIONS },
        )
        const proposal = decodeProposal(json(proposalText.text))
        const target = Option.flatMap(proposal, (p) =>
          Option.fromNullishOr(skills.find((s) => s.name === p.skill && s.content.length > 0)),
        )
        if (Option.isNone(proposal) || Option.isNone(target)) return "skipped" as const
        const { skill, hypothesis, content } = proposal.value
        if (!content.startsWith("---") || content.length > 8000) return "skipped" as const

        const wins = yield* evaluate(skill, target.value.content, content)
        const id = randomUUID()
        if (wins.candidate < Math.max(1, wins.baseline)) {
          yield* append({
            id,
            at: now,
            kind: "experiment",
            skill,
            hypothesis,
            decision: "discarded",
            wins,
          })
          return "discarded" as const
        }
        yield* fs
          .writeFileString(skillPath(skill), content.endsWith("\n") ? content : `${content}\n`)
          .pipe(Effect.orDie)
        const commit = yield* git.commitHash(`lab: ${skill}: ${hypothesis.slice(0, 120)}`)
        yield* append({
          id,
          at: now,
          kind: "experiment",
          skill,
          hypothesis,
          decision: "promoted",
          wins,
          baselineFriction: friction.score,
          watchUntil: DateTime.formatIso(DateTime.makeUnsafe(nowMs + WATCH_DAYS * 86_400_000)),
          ...(Option.isSome(commit) ? { commit: commit.value } : {}),
        })
        return "promoted" as const
      })

      /** Promotions past their watch window: kept, or reverted if friction rose. */
      const watch = Effect.gen(function* () {
        const entries = yield* ledger
        const nowIso = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis))
        const watched = new Set(entries.filter((e) => e.kind === "watch").map((e) => e.id))
        let reverted = 0
        for (const e of entries) {
          if (e.kind !== "experiment" || e.decision !== "promoted" || watched.has(e.id)) continue
          if (e.watchUntil === undefined || e.watchUntil > nowIso) continue
          const after = yield* frictionBetween(e.at, e.watchUntil)
          const worse = regressed(e.baselineFriction ?? 0, after.score)
          if (worse && e.commit !== undefined) {
            yield* git.revert(e.commit)
            reverted++
          }
          yield* append({
            ...e,
            kind: "watch",
            at: nowIso,
            decision: worse ? "reverted" : "kept",
            afterFriction: after.score,
          })
        }
        return reverted
      })

      const run = Effect.gen(function* () {
        const reverted = yield* watch
        const result = yield* experiment
        return { experiment: result, reverted } satisfies LabReport
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("lab run failed", cause).pipe(
            Effect.as<LabReport>({ experiment: "skipped", reverted: 0 }),
          ),
        ),
        Effect.withSpan("Lab.run"),
      )

      const changes = Effect.map(ledger, (entries) => {
        const settled = new Map(
          entries.filter((e) => e.kind === "watch").map((e) => [e.id, e.decision]),
        )
        return entries
          .filter((e) => e.kind === "experiment" && e.decision === "promoted")
          .map(
            (e): LabChange => ({
              id: e.id,
              at: e.at,
              skill: e.skill,
              hypothesis: e.hypothesis,
              status:
                settled.get(e.id) === "reverted"
                  ? "undone"
                  : settled.get(e.id) === "kept"
                    ? "kept"
                    : "watching",
            }),
          )
          .reverse()
      })

      const undo = Effect.fn("Lab.undo")(function* (id: string) {
        const entries = yield* ledger
        const entry = entries.find(
          (e) => e.id === id && e.kind === "experiment" && e.decision === "promoted",
        )
        if (entry === undefined || entry.commit === undefined) return false
        if (entries.some((e) => e.id === id && e.kind === "watch" && e.decision === "reverted"))
          return false
        if (!(yield* git.revert(entry.commit))) return false
        const nowIso = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis))
        yield* append({ ...entry, kind: "watch", at: nowIso, decision: "reverted" })
        return true
      })

      return Lab.of({ run, changes, undo })
    }),
  )

  /** Once per local day, only while the user is away; pauses implicitly when they return (next tick). */
  static readonly loop = Layer.effectDiscard(
    Effect.gen(function* () {
      const lab = yield* Lab
      const presence = yield* Presence
      const settings = yield* Settings
      const sql = yield* SqlClient.SqlClient
      const config = yield* DomoConfig
      const tick = Effect.gen(function* () {
        if (!(yield* settings.current).lab) return
        const lastSeen = yield* presence.lastSeenMs
        const nowMs = yield* Clock.currentTimeMillis
        if (Option.isNone(lastSeen) || nowMs - lastSeen.value < (yield* settings.awayMs)) return
        const today = new Date(nowMs).toLocaleDateString("en-CA")
        const rows = yield* sql<{
          value: string
        }>`SELECT value FROM meta WHERE key = 'last_lab_day'`
        if (rows[0]?.value === today) return
        yield* sql`INSERT INTO meta (key, value) VALUES ('last_lab_day', ${today})
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`
        yield* Effect.logInfo(`lab: ${JSON.stringify(yield* lab.run)}`)
      })
      yield* Effect.forkScoped(
        tick.pipe(
          Effect.catchCause((cause) => Effect.logWarning("lab check failed", cause)),
          Effect.repeat(Schedule.spaced(`${config.tidyTickSeconds} seconds`)),
        ),
      )
    }),
  )
}
