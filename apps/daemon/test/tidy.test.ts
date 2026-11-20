import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type ChatEvent, DeviceId, type MessageId, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Fiber, Layer, Option, Stream } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore, type TidyCandidate } from "../src/chat/ChatStore.ts"
import { Conductor } from "../src/conductor/Conductor.ts"
import { Filer } from "../src/conductor/Filer.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { Images } from "../src/images/Images.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import { Presence } from "../src/presence/Presence.ts"
import { selectFolds } from "../src/presence/selectFolds.ts"
import { Tidier } from "../src/presence/Tidier.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { Settings } from "../src/settings/Settings.ts"
import { DatabaseTest } from "../src/store/Database.ts"
import { Telemetry } from "../src/telemetry/Telemetry.ts"

const candidate = (id: string, over: Partial<TidyCandidate> = {}): TidyCandidate => ({
  id: TopicId.make(id),
  resolved: true,
  lastActivityAt: "2026-11-18T10:00:00.000Z",
  lastSeq: 5,
  openChoices: 0,
  ...over,
})

describe("selectFolds", () => {
  const nowMs = Date.parse("2026-11-18T12:00:00.000Z")

  it("folds resolved, read topics but never the last one touched", () => {
    const folds = selectFolds(
      [candidate("a"), candidate("b", { lastActivityAt: "2026-11-18T11:00:00.000Z" })],
      { readSeq: 10, nowMs },
    )
    expect(folds).toEqual(["a"])
  })

  it("never folds what the user hasn't read past, or a topic with an open question", () => {
    const folds = selectFolds(
      [
        candidate("unread", { lastSeq: 20 }),
        candidate("asking", { openChoices: 1 }),
        candidate("latest", { lastActivityAt: "2026-11-18T11:59:00.000Z" }),
      ],
      { readSeq: 10, nowMs },
    )
    expect(folds).toEqual([])
  })

  it("folds unresolved topics only once they're a week stale", () => {
    const folds = selectFolds(
      [
        candidate("open", { resolved: false }),
        candidate("stale", { resolved: false, lastActivityAt: "2026-11-01T00:00:00.000Z" }),
        candidate("latest", { lastActivityAt: "2026-11-18T11:59:00.000Z" }),
      ],
      { readSeq: 10, nowMs },
    )
    expect(folds).toEqual(["stale"])
  })
})

const AWAY_SECONDS = 0.05

const TestLayer = Conductor.layer.pipe(
  Layer.provide(Filer.layer),
  Layer.provideMerge(Tidier.layer),
  Layer.provideMerge(Presence.layer),
  Layer.provideMerge(Settings.layer),
  Layer.provideMerge(Memory.layer),
  Layer.provideMerge(Images.layer),
  Layer.provide(HomeGit.layerNoop),
  Layer.provideMerge(ChatStore.layer),
  Layer.provideMerge(ChatBus.layer),
  Layer.provideMerge(Telemetry.layer),
  Layer.provide(layerEcho),
  Layer.provide(
    DomoConfig.layerFrom({
      home: mkdtempSync(join(tmpdir(), "domo-test-")),
      port: 0,
      awaySeconds: AWAY_SECONDS,
    }),
  ),
  Layer.provideMerge(GoalStore.layer),
  Layer.provide(DatabaseTest),
  Layer.provide(NodeFileSystem.layer),
)

type Finished = Extract<ChatEvent, { _tag: "AgentFinished" }>

const sendAndWait = (text: string, replyTo?: MessageId) =>
  Effect.gen(function* () {
    const finished = yield* (yield* ChatBus).feed.pipe(
      Stream.filter((event): event is Finished => event._tag === "AgentFinished"),
      Stream.runHead,
      Effect.forkChild,
    )
    yield* Effect.sleep("5 millis")
    const { messageId } = yield* (yield* Conductor).send(
      replyTo === undefined ? { text } : { text, replyTo: { messageId: replyTo } },
    )
    const reply = Option.getOrThrow(yield* Fiber.join(finished)).message
    yield* Effect.sleep("30 millis") // background filing
    return { userId: messageId, reply }
  })

const device = DeviceId.make("phone")

/** Domo's confirmation note ("Noting this as decided: …"). */
const findNote = Effect.gen(function* () {
  const messages = yield* (yield* ChatStore).recentMessages(50)
  return Option.getOrThrow(Option.fromNullishOr(messages.find((m) => m.text.startsWith("Noting"))))
})

describe("tidying and the return line", () => {
  it.live("folds a finished topic while away, reports it on return, and undoes it", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const presence = yield* Presence
      const tidier = yield* Tidier
      yield* sendAndWait("[[topic:Kitchen]] [[resolved]] booked the contractor")
      const taxes = yield* sendAndWait("[[topic:Taxes]] what's due?")
      yield* presence.touch(device, taxes.reply.id)

      yield* Effect.sleep("100 millis") // away
      const tidy = Option.getOrThrow(yield* tidier.tidy)
      expect(tidy.topics).toBe(1)
      expect(yield* store.foldedCount).toBe(1)
      const visible = yield* store.recentMessages(50)
      expect(visible.some((m) => m.text.includes("Kitchen"))).toBe(false)
      expect(visible.some((m) => m.text.includes("Taxes"))).toBe(true)
      const earlier = yield* store.earlierMessages(50)
      expect(earlier.some((m) => m.text.includes("booked the contractor"))).toBe(true)

      const back = yield* presence.touch(device, undefined)
      expect(back.greeting).toBe(true)
      const summary = Option.getOrThrow(back.summary)
      expect(summary.tidied).toEqual({ id: tidy.id, topics: 1 })
      // Only the first touch after an absence returns the line.
      const again = yield* presence.touch(device, undefined)
      expect(Option.isNone(again.summary)).toBe(true)
      expect(again.greeting).toBe(false)

      yield* tidier.undo(tidy.id)
      expect(yield* store.foldedCount).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("doesn't fold anything the user hasn't read", () =>
    Effect.gen(function* () {
      yield* sendAndWait("[[topic:Kitchen]] [[resolved]] done")
      yield* sendAndWait("[[topic:Taxes]] what's due?")
      // No presence: nothing has been read.
      yield* Effect.sleep("100 millis")
      expect(Option.isNone(yield* (yield* Tidier).tidy)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("pick-ups, confirmations and corrections", () => {
  it.live("returning to an older topic tags the reply with its source", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const kitchen = yield* sendAndWait("[[topic:Kitchen]] pick a contractor")
      yield* sendAndWait("[[topic:Taxes]] what's due?")
      // Make Kitchen an hour old.
      // The filer moved the exchange into "Kitchen" after it was written, so look it up again.
      const kitchenId = Option.getOrThrow(yield* store.getMessage(kitchen.userId)).topicId
      const kitchenTopic = Option.getOrThrow(yield* store.getTopic(kitchenId))
      const hourAgo = DateTime.subtract(yield* DateTime.now, { hours: 1 })
      yield* store.upsertTopic(new Topic({ ...kitchenTopic, lastActivityAt: hourAgo }))

      const { reply } = yield* sendAndWait("and the start date?", kitchen.userId)
      expect(reply.sources?.[0]?.messageIds).toContain(kitchen.userId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live(
    "a costly decision is confirmed once, and 'not decided yet' reopens it without a model run",
    () =>
      Effect.gen(function* () {
        const store = yield* ChatStore
        const { reply } = yield* sendAndWait("[[decide:Hire Hale & Co.]] let's go with them")
        const notes = (yield* store.recentMessages(50)).filter((m) => m.text.startsWith("Noting"))
        expect(notes).toHaveLength(1)
        const note = yield* findNote
        expect(note.text).toBe("Noting this as decided: Hire Hale & Co.")
        expect(Option.getOrThrow(yield* store.getTopic(reply.topicId)).decision).toBe(
          "Hire Hale & Co.",
        )

        const before = (yield* store.recentMessages(50)).length
        yield* (yield* Conductor).answer({ messageId: note.id, value: "open", freeText: false })
        yield* Effect.sleep("30 millis")
        expect((yield* store.recentMessages(50)).length).toBe(before)
        const topic = Option.getOrThrow(yield* store.getTopic(reply.topicId))
        expect(topic.decision).toBeUndefined()
        expect(topic.status).toBe("unresolved")
      }).pipe(Effect.provide(TestLayer)),
  )

  it.live("a reversible answer can be undone until the next tidy", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const conductor = yield* Conductor
      yield* sendAndWait("[[resolved]] [[decide:Hire Hale & Co.]] go")
      const note = yield* findNote
      yield* conductor.answer({ messageId: note.id, value: "confirm", freeText: false })
      yield* conductor.undoAnswer(note.id)
      expect(Option.getOrThrow(yield* store.getMessage(note.id)).resolution).toBeUndefined()

      yield* conductor.answer({ messageId: note.id, value: "confirm", freeText: false })
      // A tidy after the answer closes the undo window.
      yield* (yield* Presence).touch(device, note.id)
      yield* sendAndWait("[[topic:Other]] next thing")
      yield* Effect.sleep("100 millis")
      expect(Option.isSome(yield* (yield* Tidier).tidy)).toBe(true)
      const late = yield* Effect.flip(conductor.undoAnswer(note.id))
      expect(late._tag).toBe("SendFailed")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.live("'not quite' records friction and clears the topic's summary for re-filing", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const { reply } = yield* sendAndWait("[[decide:Hire Hale & Co.]] go")
      yield* (yield* Conductor).notQuite(reply.id)
      const topic = Option.getOrThrow(yield* store.getTopic(reply.topicId))
      expect(topic.summary).toBe("")
      expect(topic.decision).toBeUndefined()
      expect((yield* (yield* Telemetry).countsByTag).get("RestatementRejected")).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )
})
