import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, MessageId, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, FileSystem, Layer, Option } from "effect"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { makeSystemPrompt } from "../src/conductor/prompt.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import {
  type MemoryNote,
  parseNote,
  serializeNote,
  similarity,
  slugify,
} from "../src/memory/note.ts"
import { duplicatePairs, Sleep, shouldDecay } from "../src/memory/Sleep.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const makeLayer = (home: string) =>
  Sleep.layer.pipe(
    Layer.provideMerge(Memory.layer),
    Layer.provide(HomeGit.layerNoop),
    Layer.provideMerge(GoalStore.layer),
    Layer.provideMerge(ChatStore.layer),
    Layer.provide(layerEcho),
    Layer.provideMerge(DomoConfig.layerFrom({ home, port: 0 })),
    Layer.provide(DatabaseTest),
    Layer.provideMerge(NodeFileSystem.layer),
  )

const fresh = () => mkdtempSync(join(tmpdir(), "domo-memory-"))

const note = (over: Partial<MemoryNote>): MemoryNote => ({
  name: "n",
  type: "project",
  created: "2026-11-01",
  lastUsed: "2026-11-01",
  uses: 0,
  body: "body",
  ...over,
})

describe("memory notes", () => {
  it("round-trips through the file format", () => {
    const n = note({
      name: "kitchen-contractor",
      why: "Shapes the remodel plan",
      body: "Hired Hale & Co.",
    })
    expect(Option.getOrThrow(parseNote(serializeNote(n)))).toEqual(n)
  })

  it("names become safe file names", () => {
    expect(slugify("Kitchen contractor!")).toBe("kitchen-contractor")
    expect(slugify("../../etc/passwd")).toBe("etc-passwd")
  })

  it("spots near-duplicates by meaningful words", () => {
    expect(
      similarity(
        "The user prefers graphite and sage, no navy",
        "Prefers the graphite and sage palette, not navy",
      ),
    ).toBeGreaterThanOrEqual(0.6)
    expect(similarity("Hired Hale & Co. for the kitchen", "Kettlebell v2 ships Dec 15")).toBe(0)
  })
})

describe("remember, recall, forget", () => {
  const home = fresh()

  it.effect("writes one file per fact, gated on a reason, and finds it again", () =>
    Effect.gen(function* () {
      const memory = yield* Memory
      expect(
        yield* memory.remember({
          name: "palette",
          type: "user",
          fact: "Prefers graphite and sage, no navy.",
          why: "ok",
        }),
      ).toContain("say why")
      expect(
        yield* memory.remember({
          name: "Palette",
          type: "user",
          fact: "Prefers the graphite and sage palette; dislikes navy.",
          why: "Applies to every UI Domo builds",
        }),
      ).toBe('Remembered "palette".')
      expect(readFileSync(join(home, "memory", "palette.md"), "utf8")).toContain(
        "why: Applies to every UI",
      )

      const hits = yield* memory.recall("which colors does he like", 5)
      expect(hits).toHaveLength(0) // no shared keywords
      const found = yield* memory.recall("graphite palette", 5)
      expect(found[0]).toMatchObject({ kind: "memory", ref: "palette" })
      expect(
        Option.getOrThrow(parseNote(readFileSync(join(home, "memory", "palette.md"), "utf8"))).uses,
      ).toBe(1)
    }).pipe(Effect.provide(makeLayer(home))),
  )

  it.effect("refuses a near-duplicate under another name, and supersedes by name", () =>
    Effect.gen(function* () {
      const memory = yield* Memory
      const dup = yield* memory.remember({
        name: "colors",
        type: "user",
        fact: "Prefers graphite and sage and dislikes navy.",
        why: "Applies to every UI Domo builds",
      })
      expect(dup).toContain('similar memory already exists, "palette"')
      expect(
        yield* memory.remember({
          name: "palette",
          type: "user",
          fact: "Prefers graphite and sage; navy and blue are out.",
          why: "Applies to every UI Domo builds",
        }),
      ).toBe('Updated memory "palette".')
      const updated = Option.getOrThrow(
        parseNote(readFileSync(join(home, "memory", "palette.md"), "utf8")),
      )
      expect(updated.supersedes).toContain("dislikes navy")
      expect(
        readdirSync(join(home, "memory", "archive")).some((f) => f.startsWith("palette-")),
      ).toBe(true)
    }).pipe(Effect.provide(makeLayer(home))),
  )

  it.effect("forgetting archives rather than deletes", () =>
    Effect.gen(function* () {
      const memory = yield* Memory
      expect(yield* memory.forget("palette", "user changed their mind")).toContain("archived")
      expect(readdirSync(join(home, "memory")).includes("palette.md")).toBe(false)
      expect(yield* memory.recall("graphite palette", 5)).toHaveLength(0)
    }).pipe(Effect.provide(makeLayer(home))),
  )

  it.effect("recall also searches topic summaries, with their source messages", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      yield* store.upsertTopic(
        new Topic({
          id: TopicId.make("kitchen"),
          title: "Kitchen remodel",
          status: "resolved",
          stakes: "costly",
          summary: "Booked Hale & Co. for the cabinets.",
          decision: "Hire Hale & Co.",
          sourceMessageIds: [MessageId.make("m1")],
          folded: false,
          model: DEFAULT_MAIN_MODEL,
          lastActivityAt: yield* DateTime.now,
        }),
      )
      const hits = yield* (yield* Memory).recall("who did we hire for the cabinets", 5)
      expect(hits[0]).toMatchObject({
        kind: "topic",
        title: "Kitchen remodel",
        sourceMessageIds: ["m1"],
      })
    }).pipe(Effect.provide(makeLayer(fresh()))),
  )
})

describe("nightly consolidation", () => {
  it("fades unused project details but never facts about the user", () => {
    const now = Date.parse("2026-11-18T00:00:00Z")
    expect(shouldDecay(note({ type: "project", created: "2026-09-01" }), now)).toBe(true)
    expect(shouldDecay(note({ type: "project", created: "2026-11-10" }), now)).toBe(false)
    expect(
      shouldDecay(note({ type: "user", created: "2025-01-01", lastUsed: "2025-01-01" }), now),
    ).toBe(false)
  })

  it("pairs near-duplicates of the same type", () => {
    const a = note({ name: "a", body: "Kitchen contractor is Hale & Co., starting Dec 2" })
    const b = note({ name: "b", body: "Hale & Co. is the kitchen contractor, start Dec 2" })
    const c = note({
      name: "c",
      type: "user",
      body: "Hale & Co. is the kitchen contractor, start Dec 2",
    })
    expect(duplicatePairs([a, b, c]).map((p) => [p.a.name, p.b.name])).toEqual([["a", "b"]])
  })

  it.live("fades, merges, rewrites the profile, and the profile reaches every turn", () =>
    Effect.gen(function* () {
      const memory = yield* Memory
      yield* memory.write(
        note({
          name: "old-detail",
          type: "project",
          created: "2025-01-01",
          body: "Old printer model",
        }),
      )
      yield* memory.write(
        note({
          name: "contractor",
          created: "2026-11-01",
          lastUsed: "2026-11-18",
          uses: 2,
          body: "Kitchen contractor is Hale & Co., starting Dec 2",
        }),
      )
      yield* memory.write(
        note({
          name: "contractor-2",
          created: "2026-11-10",
          lastUsed: "2026-11-18",
          uses: 1,
          body: "Hale & Co. is the kitchen contractor; start Dec 2",
        }),
      )
      yield* memory.write(
        note({
          name: "style",
          type: "feedback",
          created: "2026-11-18",
          lastUsed: "2026-11-18",
          body: "Keep replies short",
        }),
      )

      const report = yield* (yield* Sleep).run
      expect(report).toEqual({ archived: 1, merged: 1, profile: true })
      const names = (yield* memory.notes).map((n) => n.name).sort()
      expect(names).toEqual(["contractor", "style"])
      expect((yield* memory.notes).find((n) => n.name === "contractor")?.uses).toBe(3)

      const prompt = yield* makeSystemPrompt(
        yield* DomoConfig,
        yield* FileSystem.FileSystem,
        yield* GoalStore,
        memory,
      )
      expect(prompt).toContain("Profile built from 1 notes.")
    }).pipe(Effect.provide(makeLayer(fresh()))),
  )
})
