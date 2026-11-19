import { ModelRef } from "@domo/domain"
import { Clock, Context, Effect, Layer, Option, Schedule } from "effect"
import { SqlClient } from "effect/sql"
import { DomoConfig } from "../config/DomoConfig.ts"
import { runModel } from "../mcp/orchestration.ts"
import { Presence } from "../presence/Presence.ts"
import { Providers } from "../providers/Providers.ts"
import { Settings } from "../settings/Settings.ts"
import { HomeGit } from "./HomeGit.ts"
import { Memory, PROFILE_MAX_CHARS } from "./Memory.ts"
import { type MemoryNote, similarity } from "./note.ts"

const MERGE_MODEL = new ModelRef({ provider: "claude", id: "claude-haiku-5-5" })
const PROFILE_MODEL = new ModelRef({ provider: "claude", id: "claude-sonnet-5-5" })
const MAX_MERGES = 5
const DAY_MS = 24 * 60 * 60 * 1000

/** Facts about the user and how they want Domo to work don't fade; project details do. */
const fades = (note: MemoryNote) => note.type === "project" || note.type === "reference"

export const shouldDecay = (note: MemoryNote, nowMs: number) =>
  fades(note) &&
  ((note.uses === 0 && nowMs - Date.parse(note.created) > 30 * DAY_MS) ||
    nowMs - Date.parse(note.lastUsed) > 120 * DAY_MS)

/** Near-duplicate pairs of the same type, most similar first. */
export const duplicatePairs = (notes: ReadonlyArray<MemoryNote>) => {
  const pairs: Array<{ readonly a: MemoryNote; readonly b: MemoryNote; readonly score: number }> =
    []
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i]
      const b = notes[j]
      if (a === undefined || b === undefined || a.type !== b.type) continue
      const score = similarity(a.body, b.body)
      if (score >= 0.6) pairs.push({ a, b, score })
    }
  }
  return pairs.sort((x, y) => y.score - x.score)
}

const MERGE_INSTRUCTIONS =
  "Merge two notes about the same fact into one. Keep every specific detail; where they conflict, " +
  "prefer the newer one. Reply with the merged fact only, in one to three sentences."

const PROFILE_INSTRUCTIONS =
  "Rewrite the user's profile for their chief of staff from the notes below. Three short sections: " +
  "Who they are, How they like to work, What they're focused on. Plain sentences or brief bullets, " +
  "no headers deeper than that, under 900 words. Keep only what will still matter next month."

export interface SleepReport {
  readonly archived: number
  readonly merged: number
  readonly profile: boolean
}

/**
 * Nightly consolidation ("sleep"), once per local day while the user is away:
 * fade unused project details, merge near-duplicates, rewrite the profile
 * within its budget, and commit ~/.domo so every change can be undone.
 */
export class Sleep extends Context.Service<Sleep, { readonly run: Effect.Effect<SleepReport> }>()(
  "domo/memory/Sleep",
) {
  static readonly layer = Layer.effect(
    Sleep,
    Effect.gen(function* () {
      const memory = yield* Memory
      const providers = yield* Providers
      const git = yield* HomeGit

      const run = Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const all = yield* memory.notes

        const stale = all.filter((note) => shouldDecay(note, nowMs))
        yield* Effect.forEach(stale, (note) => memory.archive(note.name, "faded: unused"), {
          discard: true,
        })

        const live = all.filter((note) => !stale.includes(note))
        const used = new Set<string>()
        let merged = 0
        for (const { a, b } of duplicatePairs(live)) {
          if (merged >= MAX_MERGES || used.has(a.name) || used.has(b.name)) continue
          const [older, newer] = a.created <= b.created ? [a, b] : [b, a]
          const result = yield* runModel(
            providers,
            MERGE_MODEL,
            `Merge memories:\nOlder (${older.created}): ${older.body}\nNewer (${newer.created}): ${newer.body}`,
            { mode: "utility", systemPrompt: MERGE_INSTRUCTIONS },
          )
          if (!result.ok || result.text.trim().length === 0) continue
          yield* memory.write({
            ...older,
            body: result.text.trim(),
            uses: older.uses + newer.uses,
            lastUsed: older.lastUsed > newer.lastUsed ? older.lastUsed : newer.lastUsed,
          })
          yield* memory.archive(newer.name, `merged into ${older.name}`)
          used.add(a.name).add(b.name)
          merged++
        }

        const about = (yield* memory.notes)
          .filter((note) => note.type === "user" || note.type === "feedback")
          .sort((x, y) => y.uses - x.uses)
          .slice(0, 60)
        let profile = false
        if (about.length > 0) {
          const current = yield* memory.profile
          const result = yield* runModel(
            providers,
            PROFILE_MODEL,
            [
              "Profile rewrite:",
              current.trim().length > 0 ? `Current profile:\n${current.trim()}` : "No profile yet.",
              "Notes:",
              ...about.map((note) => `- (${note.type}) ${note.body}`),
            ].join("\n"),
            { mode: "utility", systemPrompt: PROFILE_INSTRUCTIONS },
          )
          if (result.ok && result.text.trim().length > 0) {
            yield* memory.writeProfile(result.text.slice(0, PROFILE_MAX_CHARS))
            profile = true
          }
        }

        yield* git.commit(`memory: nightly consolidation (${stale.length} faded, ${merged} merged)`)
        return { archived: stale.length, merged, profile }
      }).pipe(Effect.withSpan("Sleep.run"))

      return Sleep.of({ run })
    }),
  )

  /** Checks every tick: runs once per local day, only while the user is away. */
  static readonly loop = Layer.effectDiscard(
    Effect.gen(function* () {
      const sleep = yield* Sleep
      const presence = yield* Presence
      const config = yield* DomoConfig
      const settings = yield* Settings
      const sql = yield* SqlClient.SqlClient

      const tick = Effect.gen(function* () {
        const lastSeen = yield* presence.lastSeenMs
        const nowMs = yield* Clock.currentTimeMillis
        if (Option.isNone(lastSeen) || nowMs - lastSeen.value < (yield* settings.awayMs)) return
        const today = new Date(nowMs).toLocaleDateString("en-CA")
        const rows = yield* sql<{
          value: string
        }>`SELECT value FROM meta WHERE key = 'last_sleep_day'`
        if (rows[0]?.value === today) return
        yield* sql`INSERT INTO meta (key, value) VALUES ('last_sleep_day', ${today})
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`
        const report = yield* sleep.run
        yield* Effect.logInfo(`memory consolidated: ${JSON.stringify(report)}`)
      })

      yield* Effect.forkScoped(
        tick.pipe(
          Effect.catchCause((cause) => Effect.logWarning("memory consolidation failed", cause)),
          Effect.repeat(Schedule.spaced(`${config.tidyTickSeconds} seconds`)),
        ),
      )
    }),
  )
}
