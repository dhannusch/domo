import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, Message, MessageId, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, FileSystem, Layer, Option } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { DatabaseTest } from "../src/store/Database.ts"
import { ensureFolder } from "../src/topics/folders.ts"
import { makePlacement } from "../src/topics/placement.ts"

const TestLayer = Layer.mergeAll(ChatStore.layer, ChatBus.layer).pipe(
  Layer.provide(DatabaseTest),
  Layer.provideMerge(NodeFileSystem.layer),
)

/** A topic with its folder and one exchange (a user message and the reply being written). */
const setup = Effect.gen(function* () {
  const home = mkdtempSync(join(tmpdir(), "domo-place-"))
  const store = yield* ChatStore
  const bus = yield* ChatBus
  const fs = yield* FileSystem.FileSystem
  const now = yield* DateTime.now
  const topic = yield* ensureFolder(
    fs,
    home,
    new Topic({
      id: TopicId.make("t"),
      title: "Open conversation",
      status: "unresolved",
      stakes: "low",
      summary: "",
      sourceMessageIds: [],
      folded: false,
      model: DEFAULT_MAIN_MODEL,
      providerSessionId: "session-1",
      lastActivityAt: now,
    }),
  )
  yield* store.upsertTopic(topic)
  const base = { topicId: topic.id, status: "done" as const, createdAt: now }
  yield* store.insertMessage(
    new Message({ ...base, id: MessageId.make("u1"), role: "user", text: "make it a topic" }),
  )
  yield* store.insertMessage(
    new Message({ ...base, id: MessageId.make("a1"), role: "agent", text: "" }),
  )
  const run = { messageId: MessageId.make("a1"), topicId: topic.id }
  return { home, store, bus, run, placement: makePlacement({ store, bus, fs, home }) }
})

describe("topic placement", () => {
  it.effect("start_topic moves the exchange into a new topic with its own folder", () =>
    Effect.gen(function* () {
      const { home, store, bus, run, placement } = yield* setup
      yield* placement.startTopic(run, "How Teams Ship")
      const moved = Option.getOrThrow(yield* store.getMessage(MessageId.make("u1")))
      const topic = Option.getOrThrow(yield* store.getTopic(moved.topicId))
      expect(topic.title).toBe("How Teams Ship")
      expect(Option.getOrThrow(yield* store.getMessage(run.messageId)).topicId).toBe(topic.id)
      expect(readFileSync(join(home, "topics", "how-teams-ship", "notes.md"), "utf8")).toBe(
        "# How Teams Ship\n",
      )
      // The next message continues there, and the Filer leaves this exchange alone.
      expect(Option.map(yield* store.currentTopic, (t) => t.id)).toEqual(Option.some(topic.id))
      expect(yield* bus.takePlaced(run.messageId)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rename_topic renames the topic and its folder, keeping what's in it", () =>
    Effect.gen(function* () {
      const { home, store, bus, run, placement } = yield* setup
      yield* placement.renameTopic(run, "How Teams Ship")
      const topic = Option.getOrThrow(yield* store.getTopic(run.topicId))
      expect(topic.title).toBe("How Teams Ship")
      expect(topic.folder).toBe("how-teams-ship")
      expect(existsSync(join(home, "topics", "open-conversation"))).toBe(false)
      expect(readFileSync(join(home, "topics", "how-teams-ship", "notes.md"), "utf8")).toContain(
        "# Open conversation",
      )
      // Its session was tied to the old folder, so the next run starts afresh.
      expect(topic.providerSessionId).toBeUndefined()
      expect(yield* bus.takePlaced(run.messageId)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
