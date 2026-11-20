import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { Tasks } from "../src/conductor/Tasks.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import { Notifier } from "../src/notify/Notifier.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { Reminders } from "../src/reminders/Reminders.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const TestLayer = Reminders.layer.pipe(
  Layer.provideMerge(Tasks.layer),
  Layer.provide(Notifier.layerNoop),
  Layer.provideMerge(Memory.layer),
  Layer.provide(HomeGit.layerNoop),
  Layer.provideMerge(ChatStore.layer),
  Layer.provideMerge(ChatBus.layer),
  Layer.provide(layerEcho),
  Layer.provide(DomoConfig.layerFrom({ home: mkdtempSync(join(tmpdir(), "domo-test-")), port: 0 })),
  Layer.provideMerge(GoalStore.layer),
  Layer.provide(DatabaseTest),
  Layer.provide(NodeFileSystem.layer),
)

const kitchen = Effect.gen(function* () {
  const topic = new Topic({
    id: TopicId.make("kitchen"),
    title: "Kitchen",
    status: "unresolved",
    stakes: "low",
    summary: "",
    sourceMessageIds: [],
    folded: true,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: yield* DateTime.now,
  })
  yield* (yield* ChatStore).upsertTopic(topic)
  return topic
})

describe("Reminders", () => {
  it.effect("a reminder posts once at its time, back in its topic, and not before", () =>
    Effect.gen(function* () {
      const reminders = yield* Reminders
      const store = yield* ChatStore
      const topic = yield* kitchen
      const now = yield* DateTime.now
      yield* reminders.add({
        topicId: topic.id,
        dueAt: DateTime.add(now, { hours: 1 }),
        note: "Call Hale & Co. about the quote",
      })
      const cancelled = yield* reminders.add({
        topicId: topic.id,
        dueAt: DateTime.add(now, { minutes: 30 }),
        note: "never mind this one",
      })
      expect(yield* reminders.cancel(cancelled.id)).toBe(true)

      expect(yield* reminders.deliverDue).toBe(0)
      yield* TestClock.adjust("61 minutes")
      expect(yield* reminders.deliverDue).toBe(1)
      expect(yield* reminders.deliverDue).toBe(0)

      const messages = yield* store.topicMessages(topic.id, 10)
      expect(messages.map((m) => m.text)).toEqual(["**Reminder:** Call Hale & Co. about the quote"])
      // A folded topic comes back so the reminder is on the page.
      const back = yield* store.getTopic(topic.id)
      expect(back._tag === "Some" && back.value.folded).toBe(false)
      expect(yield* reminders.pending).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a reminder missed while Domo was off says when it was due", () =>
    Effect.gen(function* () {
      const reminders = yield* Reminders
      const topic = yield* kitchen
      yield* reminders.add({
        topicId: topic.id,
        dueAt: DateTime.add(yield* DateTime.now, { minutes: 5 }),
        note: "Stretch",
      })
      yield* TestClock.adjust("2 hours")
      yield* reminders.deliverDue
      const [message] = yield* (yield* ChatStore).topicMessages(topic.id, 10)
      expect(message?.text).toContain("while Domo wasn't running")
    }).pipe(Effect.provide(TestLayer)),
  )
})
