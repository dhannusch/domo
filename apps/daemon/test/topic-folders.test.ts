import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, MessageId, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, FileSystem, Layer } from "effect"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import { DatabaseTest } from "../src/store/Database.ts"
import { ensureFolder, folderContext, folderName } from "../src/topics/folders.ts"

const topic = (title: string, now: DateTime.Utc) =>
  new Topic({
    id: TopicId.make(title),
    title,
    status: "unresolved",
    stakes: "low",
    summary: "",
    sourceMessageIds: [MessageId.make("m1")],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: now,
  })

describe("topic folders", () => {
  it("names a folder after the topic title", () => {
    expect(folderName("Newsletter plan: 2027!")).toBe("newsletter-plan-2027")
    expect(folderName("???")).toBe("topic")
  })

  it.effect("creates the folder once with a starting notes.md, never reusing another's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const home = mkdtempSync(join(tmpdir(), "domo-topics-"))
      const now = yield* DateTime.now
      const first = yield* ensureFolder(fs, home, topic("Newsletter", now))
      expect(first.folder).toBe("newsletter")
      expect(readFileSync(join(home, "topics", "newsletter", "notes.md"), "utf8")).toBe(
        "# Newsletter\n",
      )
      // Same title, different topic: its own folder.
      const second = yield* ensureFolder(fs, home, topic("newsletter", now))
      expect(second.folder).toBe("newsletter-2")
      // Already placed: kept as is, even after a rename.
      const renamed = yield* ensureFolder(fs, home, new Topic({ ...first, title: "Writing" }))
      expect(renamed.folder).toBe("newsletter")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it("tells the run where the folder is and what the notes say", () => {
    const text = folderContext("/h/topics/newsletter", "# Newsletter\n- Substack", true)
    expect(text).toContain("/h/topics/newsletter (your working directory)")
    expect(text).toContain("- Substack")
    expect(folderContext("/p", "x".repeat(9000), false)).toContain("read notes.md for the rest")
  })

  it.effect("recall finds a topic by what its notes.md says", () => {
    const home = mkdtempSync(join(tmpdir(), "domo-topics-"))
    return Effect.gen(function* () {
      const store = yield* ChatStore
      const fs = yield* FileSystem.FileSystem
      const placed = yield* ensureFolder(fs, home, topic("Newsletter", yield* DateTime.now))
      yield* store.upsertTopic(placed)
      const notes = "# Newsletter\n- Interview guide for engineering leaders"
      writeFileSync(join(home, "topics", "newsletter", "notes.md"), notes)
      yield* store.indexNotes(placed.id, notes)
      const hits = yield* (yield* Memory).recall("interview guide", 5)
      expect(hits[0]).toMatchObject({ kind: "topic", title: "Newsletter (notes)" })
      expect(hits[0]?.text).toContain("Interview guide")
      // Folders survive an upsert from a copy that doesn't know about them.
      const { folder: _unknown, ...stale } = placed
      yield* store.upsertTopic(new Topic(stale))
      expect(
        (yield* store.getTopic(placed.id)).pipe((t) => t._tag === "Some" && t.value.folder),
      ).toBe("newsletter")
    }).pipe(
      Effect.provide(
        Memory.layer.pipe(
          Layer.provide(HomeGit.layerNoop),
          Layer.provideMerge(ChatStore.layer),
          Layer.provideMerge(DomoConfig.layerFrom({ home, port: 0 })),
          Layer.provide(DatabaseTest),
          Layer.provideMerge(NodeFileSystem.layer),
        ),
      ),
    )
  })
})
