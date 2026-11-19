import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type ChatEvent,
  DEFAULT_MAIN_MODEL,
  Message,
  MessageId,
  RunId,
  type TaskId,
  Topic,
  TopicId,
} from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Fiber, Layer, Option, Stream } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { Tasks } from "../src/conductor/Tasks.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const TestLayer = Tasks.layer.pipe(
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

/** A topic with a live parent run, as if the main agent called start_task mid-turn. */
const parentRun = Effect.gen(function* () {
  const store = yield* ChatStore
  const bus = yield* ChatBus
  const now = yield* DateTime.now
  const topic = new Topic({
    id: TopicId.make("t"),
    title: "Kitchen",
    status: "live",
    stakes: "low",
    summary: "",
    sourceMessageIds: [],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: now,
  })
  yield* store.upsertTopic(topic)
  const parent = new Message({
    id: MessageId.make("parent"),
    topicId: topic.id,
    role: "agent",
    status: "streaming",
    text: "",
    createdAt: now,
  })
  yield* store.insertMessage(parent)
  const runId = RunId.make("parent-run")
  yield* bus.registerRun(runId, { messageId: parent.id, topicId: topic.id })
  return runId
})

type Finished = Extract<ChatEvent, { _tag: "AgentFinished" }>

const finishedOf = (messageId: MessageId) =>
  Effect.gen(function* () {
    return yield* (yield* ChatBus).feed.pipe(
      Stream.filter((e): e is Finished => e._tag === "AgentFinished" && e.message.id === messageId),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    )
  })

describe("background tasks", () => {
  it.live("runs in its own reply, shows as running, and posts the result with a receipt", () =>
    Effect.gen(function* () {
      const tasks = yield* Tasks
      const store = yield* ChatStore
      const parentRunId = yield* parentRun
      const task = yield* tasks.start({
        parentRunId,
        title: "Gather quotes",
        instructions: "Gather three quotes",
      })

      const started = Option.getOrThrow(yield* store.getMessage(task.messageId))
      expect(started).toMatchObject({ status: "streaming", topicId: "t" })
      expect(started.work).toMatchObject({ status: "running", summary: "Gather quotes" })
      const watcher = yield* Effect.forkChild(finishedOf(task.messageId))
      const done = (yield* Fiber.join(watcher)).message
      expect(done.status).toBe("done")
      expect(done.work).toMatchObject({ status: "done", summary: "Finished: Gather quotes" })
      yield* Effect.sleep("20 millis") // the task leaves the running list right after posting
      expect(yield* tasks.running).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("cancelling stops the task and ends its reply", () =>
    Effect.gen(function* () {
      const tasks = yield* Tasks
      const store = yield* ChatStore
      const parentRunId = yield* parentRun
      const task = yield* tasks.start({
        parentRunId,
        title: "Slow",
        instructions: "[[slow]] take a while",
      })
      yield* Effect.sleep("100 millis")
      expect((yield* tasks.running).map((t) => t.taskId)).toEqual([task.taskId])
      expect(yield* tasks.cancel(task.taskId)).toBe(true)
      yield* Effect.sleep("50 millis")
      const stopped = Option.getOrThrow(yield* store.getMessage(task.messageId))
      expect(stopped.status).toBe("failed")
      expect(stopped.work?.status).toBe("failed")
      expect(yield* tasks.cancel("nope" as TaskId)).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("can't start outside a conversation turn", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* Tasks).start({ parentRunId: RunId.make("gone"), title: "x", instructions: "y" }),
      )
      expect(error._tag).toBe("TaskNotStarted")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("replies cut off by a restart are marked interrupted", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      yield* parentRun
      expect(yield* store.interruptStreaming).toBe(1)
      const message = Option.getOrThrow(yield* store.getMessage(MessageId.make("parent")))
      expect(message).toMatchObject({ status: "failed", text: "Interrupted when Domo restarted." })
    }).pipe(Effect.provide(TestLayer)),
  )
})
