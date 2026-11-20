import { join } from "node:path"
import { type MessageId, TopicId } from "@domo/domain"
import { Clock, Context, DateTime, Effect, FileSystem, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { ChatStore } from "../chat/ChatStore.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { folderPath, readNotes } from "../topics/folders.ts"
import { HomeGit } from "./HomeGit.ts"
import {
  ftsQuery,
  type MemoryNote,
  type MemoryType,
  parseNote,
  serializeNote,
  similarity,
  slugify,
} from "./note.ts"

/** Near-duplicates at or above this keyword overlap aren't written twice. */
const DUPLICATE_AT = 0.6
/** The profile always in context stays within ~1,500 tokens. */
export const PROFILE_MAX_CHARS = 6000

export interface RecallHit {
  readonly kind: "memory" | "topic"
  readonly ref: string
  readonly title: string
  readonly text: string
  /** When the fact was last true or touched (ISO day). */
  readonly when: string
  /** Topic hits: the messages behind the summary (for a source tag). */
  readonly sourceMessageIds?: ReadonlyArray<MessageId>
}

export interface RememberInput {
  readonly name: string
  readonly type: MemoryType
  readonly fact: string
  readonly why: string
}

const today = (now: DateTime.Utc) => DateTime.formatIso(now).slice(0, 10)

/**
 * Long-term memory: atomic notes in ~/.domo/memory (agent-owned, git-versioned),
 * searched with SQLite FTS5 together with topic summaries. Only the profile is
 * ever preloaded; everything else is recalled just in time.
 */
export class Memory extends Context.Service<
  Memory,
  {
    remember(input: RememberInput): Effect.Effect<string>
    recall(query: string, limit: number): Effect.Effect<ReadonlyArray<RecallHit>>
    forget(name: string, reason: string): Effect.Effect<string>
    readonly notes: Effect.Effect<ReadonlyArray<MemoryNote>>
    readonly profile: Effect.Effect<string>
    writeProfile(text: string): Effect.Effect<void>
    /** Moves a note to memory/archive (never deleted). */
    archive(name: string, reason: string): Effect.Effect<void>
    /** Writes a note as-is (used by consolidation to merge duplicates). */
    write(note: MemoryNote): Effect.Effect<void>
    /** Rebuilds the search index from the files (they're the source of truth). */
    readonly reindex: Effect.Effect<number>
  }
>()("domo/memory/Memory") {
  static readonly layer = Layer.effect(
    Memory,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const sql = yield* SqlClient.SqlClient
      const store = yield* ChatStore
      const git = yield* HomeGit
      const { home } = yield* DomoConfig
      const dir = join(home, "memory")
      const archiveDir = join(dir, "archive")
      const fileOf = (slug: string) => join(dir, `${slug}.md`)

      const readNote = (slug: string) =>
        fs.readFileString(fileOf(slug)).pipe(
          Effect.map(parseNote),
          Effect.orElseSucceed(() => Option.none<MemoryNote>()),
        )

      const index = Effect.fnUntraced(function* (note: MemoryNote) {
        yield* sql`DELETE FROM memory_fts WHERE slug = ${note.name}`
        yield* sql`INSERT INTO memory_fts (slug, title, body) VALUES (${note.name}, ${note.name.replace(/-/g, " ")}, ${note.body})`
      })

      const write = Effect.fn("Memory.write")(function* (note: MemoryNote) {
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(fileOf(note.name), serializeNote(note))
        yield* index(note)
      }, Effect.orDie)

      const archive = Effect.fn("Memory.archive")(function* (name: string, reason: string) {
        const slug = slugify(name)
        const note = yield* readNote(slug)
        if (Option.isNone(note)) return
        const now = yield* DateTime.now
        yield* fs.makeDirectory(archiveDir, { recursive: true })
        yield* fs.writeFileString(
          join(archiveDir, `${slug}-${today(now)}-${yield* Clock.currentTimeMillis}.md`),
          `${serializeNote(note.value)}\n<!-- archived ${today(now)}: ${reason} -->\n`,
        )
        yield* fs.remove(fileOf(slug))
        yield* sql`DELETE FROM memory_fts WHERE slug = ${slug}`
      }, Effect.orDie)

      const notes = Effect.gen(function* () {
        if (!(yield* fs.exists(dir))) return []
        const files = (yield* fs.readDirectory(dir)).filter((f) => f.endsWith(".md"))
        const parsed = yield* Effect.forEach(files, (f) => readNote(f.slice(0, -3)))
        return parsed.flatMap(Option.toArray)
      }).pipe(Effect.orDie)

      const searchMemories = (query: string, limit: number) =>
        sql<{ slug: string }>`
          SELECT slug FROM memory_fts WHERE memory_fts MATCH ${query} ORDER BY bm25(memory_fts) LIMIT ${limit}
        `.pipe(Effect.orElseSucceed(() => []))

      const remember = Effect.fn("Memory.remember")(function* (input: RememberInput) {
        const slug = slugify(input.name)
        if (slug.length === 0) return "Give the memory a short name (a few words)."
        if (input.why.trim().length < 8) {
          return "Only remember facts that will matter later; say why this one is durable."
        }
        const now = yield* DateTime.now
        const existing = yield* readNote(slug)

        if (Option.isNone(existing)) {
          // The write gate: don't store the same fact twice under different names.
          const query = ftsQuery(input.fact)
          const candidates = query.length === 0 ? [] : yield* searchMemories(query, 3)
          for (const candidate of candidates) {
            const other = yield* readNote(candidate.slug)
            if (Option.isSome(other) && similarity(other.value.body, input.fact) >= DUPLICATE_AT) {
              return (
                `A similar memory already exists, "${other.value.name}": ${other.value.body}\n` +
                `If this replaces it, call remember again with name "${other.value.name}" to supersede it; otherwise skip.`
              )
            }
          }
        }

        // Updating a fact supersedes it: the old version is archived, never overwritten in place.
        if (Option.isSome(existing)) yield* archive(slug, `superseded by a newer version`)
        yield* write({
          name: slug,
          type: input.type,
          created: Option.isSome(existing) ? existing.value.created : today(now),
          lastUsed: today(now),
          uses: Option.isSome(existing) ? existing.value.uses : 0,
          why: input.why,
          body: input.fact,
          ...(Option.isSome(existing) ? { supersedes: existing.value.body.slice(0, 200) } : {}),
        })
        yield* git.commit(`memory: ${Option.isSome(existing) ? "update" : "remember"} ${slug}`)
        return Option.isSome(existing) ? `Updated memory "${slug}".` : `Remembered "${slug}".`
      })

      const recall = Effect.fn("Memory.recall")(function* (text: string, limit: number) {
        const query = ftsQuery(text)
        if (query.length === 0) return []
        const now = yield* DateTime.now
        const memoryRows = yield* searchMemories(query, limit)
        const memoryHits: Array<RecallHit> = []
        for (const row of memoryRows) {
          const note = yield* readNote(row.slug)
          if (Option.isNone(note)) continue
          memoryHits.push({
            kind: "memory",
            ref: note.value.name,
            title: note.value.name.replace(/-/g, " "),
            text: note.value.body,
            when: note.value.lastUsed,
          })
          // Use keeps a memory alive through consolidation.
          yield* write({ ...note.value, uses: note.value.uses + 1, lastUsed: today(now) })
        }
        const topicRows = yield* sql<{ topic_id: string }>`
          SELECT topic_id FROM topic_fts WHERE topic_fts MATCH ${query} ORDER BY bm25(topic_fts) LIMIT ${limit}
        `.pipe(Effect.orElseSucceed(() => []))
        const topicHits: Array<RecallHit> = []
        for (const row of topicRows) {
          const topic = yield* store.getTopic(TopicId.make(row.topic_id))
          if (Option.isNone(topic) || topic.value.summary.length === 0) continue
          topicHits.push({
            kind: "topic",
            ref: topic.value.id,
            title: topic.value.title,
            text: [
              topic.value.summary,
              topic.value.decision === undefined ? "" : `Decided: ${topic.value.decision}`,
            ]
              .filter((part) => part.length > 0)
              .join(" "),
            when: DateTime.formatIso(topic.value.lastActivityAt).slice(0, 10),
            sourceMessageIds: topic.value.sourceMessageIds,
          })
        }
        // A topic's own notes.md: the plan and decisions kept for that subject.
        for (const topicId of yield* store.searchNotes(query, limit)) {
          if (topicHits.some((hit) => hit.ref === topicId)) continue
          const topic = yield* store.getTopic(topicId)
          if (Option.isNone(topic) || topic.value.folder === undefined) continue
          const notes = yield* readNotes(fs, home, topic.value.folder)
          topicHits.push({
            kind: "topic",
            ref: topic.value.id,
            title: `${topic.value.title} (notes)`,
            text: `${folderPath(home, topic.value.folder)}/notes.md:\n${notes.slice(0, 1500)}`,
            when: DateTime.formatIso(topic.value.lastActivityAt).slice(0, 10),
            sourceMessageIds: topic.value.sourceMessageIds,
          })
        }
        return [...memoryHits, ...topicHits].slice(0, limit)
      }, Effect.orDie)

      const forget = Effect.fn("Memory.forget")(function* (name: string, reason: string) {
        const slug = slugify(name)
        const note = yield* readNote(slug)
        if (Option.isNone(note)) return `No memory called "${slug}".`
        yield* archive(slug, reason)
        yield* git.commit(`memory: forget ${slug}`)
        return `Forgot "${slug}" (archived, not deleted).`
      })

      const profilePath = join(home, "profile.md")
      const profile = fs.readFileString(profilePath).pipe(Effect.orElseSucceed(() => ""))
      const writeProfile = Effect.fn("Memory.writeProfile")(function* (text: string) {
        yield* fs.writeFileString(profilePath, `${text.trim().slice(0, PROFILE_MAX_CHARS)}\n`)
      }, Effect.orDie)

      const reindex = Effect.gen(function* () {
        yield* sql`DELETE FROM memory_fts`
        const all = yield* notes
        yield* Effect.forEach(all, index, { discard: true })
        return all.length
      }).pipe(Effect.orDie)

      yield* reindex
      return Memory.of({
        remember,
        recall,
        forget,
        notes,
        profile,
        writeProfile,
        archive,
        write,
        reindex,
      })
    }),
  )
}
