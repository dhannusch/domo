import { Goal, GoalId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { CheckIns } from "../src/goals/CheckIns.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const TestLayer = CheckIns.layer.pipe(
  Layer.provideMerge(GoalStore.layer),
  Layer.provideMerge(ChatStore.layer),
  Layer.provideMerge(ChatBus.layer),
  Layer.provide(layerEcho),
  Layer.provide(DatabaseTest),
  Layer.provide(NodeFileSystem.layer),
)

const goal = (id: string, nextCheckInAt: DateTime.Utc, over: Partial<Goal> = {}) =>
  new Goal({
    id: GoalId.make(id),
    title: "Ship kettlebell v2",
    outcome: "v2 live in the App Store",
    status: "active",
    cadenceDays: 2,
    nextCheckInAt,
    progress: [],
    createdAt: nextCheckInAt,
    ...over,
  })

describe("goals", () => {
  it.effect("only active goals whose check-in has come are due", () =>
    Effect.gen(function* () {
      const goals = yield* GoalStore
      const now = yield* DateTime.now
      yield* goals.save(goal("due", DateTime.subtract(now, { hours: 1 })))
      yield* goals.save(goal("later", DateTime.add(now, { days: 1 })))
      yield* goals.save(goal("done", DateTime.subtract(now, { hours: 1 }), { status: "done" }))
      expect((yield* goals.due(now)).map((g) => g.id)).toEqual(["due"])
      expect((yield* goals.active).map((g) => g.id).sort()).toEqual(["due", "later"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("a due goal gets one check-in note in its topic, and the next check-in moves out", () =>
    Effect.gen(function* () {
      const goals = yield* GoalStore
      const store = yield* ChatStore
      const now = yield* DateTime.now
      yield* goals.save(goal("g1", DateTime.subtract(now, { minutes: 5 })))

      expect(yield* (yield* CheckIns).run).toBe(1)
      const notes = (yield* store.recentMessages(10)).filter((m) =>
        m.text.startsWith("Checking in on"),
      )
      expect(notes).toHaveLength(1)
      expect(notes[0]?.text).toContain("Ship kettlebell v2")
      const topic = Option.getOrThrow(yield* store.getTopic(notes[0]?.topicId ?? ("" as never)))
      expect(topic.title).toBe("Ship kettlebell v2")

      const moved = Option.getOrThrow(yield* goals.get(GoalId.make("g1")))
      expect(DateTime.toEpochMillis(moved.nextCheckInAt)).toBeGreaterThan(
        DateTime.toEpochMillis(now),
      )
      // The next visit doesn't repeat it.
      expect(yield* (yield* CheckIns).run).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )
})
