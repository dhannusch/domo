import { DEFAULT_MAIN_MODEL, MessageId, Topic, TopicId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { makeFiling } from "../src/conductor/filing.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const TestLayer = Layer.mergeAll(ChatStore.layer, ChatBus.layer).pipe(
  Layer.provideMerge(DatabaseTest),
)

const setup = Effect.gen(function* () {
  const store = yield* ChatStore
  const bus = yield* ChatBus
  let n = 0
  const newId = Effect.sync(() => `id-${++n}`)
  const topic = new Topic({
    id: TopicId.make("t"),
    title: "Deploy",
    status: "live",
    stakes: "low",
    summary: "",
    sourceMessageIds: [],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: yield* DateTime.now,
  })
  yield* store.upsertTopic(topic)
  const { applyFiling } = makeFiling({
    store,
    bus,
    newId,
    newTopic: (title, model) =>
      Effect.succeed(new Topic({ ...topic, id: TopicId.make(title), title, model })),
  })
  return { store, topic, applyFiling }
})

const costly = {
  placement: { _tag: "Same" as const },
  state: {
    resolved: true,
    summary: "Pushed.",
    decision: "Push to main",
    stakes: "costly" as const,
  },
}

describe("stakes-based confirmations", () => {
  it.effect("a costly decision gets one confirmation note", () =>
    Effect.gen(function* () {
      const { store, topic, applyFiling } = yield* setup
      yield* applyFiling(costly, topic, [MessageId.make("m1")])
      const notes = (yield* store.topicMessages(topic.id, 10)).filter((m) =>
        m.text.startsWith("Noting"),
      )
      expect(notes).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "no confirmation when the user already decided explicitly (e.g. approved via ask_user)",
    () =>
      Effect.gen(function* () {
        const { store, topic, applyFiling } = yield* setup
        yield* applyFiling(costly, topic, [MessageId.make("m1")], true)
        const notes = (yield* store.topicMessages(topic.id, 10)).filter((m) =>
          m.text.startsWith("Noting"),
        )
        expect(notes).toHaveLength(0)
      }).pipe(Effect.provide(TestLayer)),
  )
})
