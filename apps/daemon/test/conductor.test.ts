import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type ChatEvent, ComponentId, Message, type MessageId, type RunId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Stream } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { Conductor } from "../src/conductor/Conductor.ts"
import { Filer } from "../src/conductor/Filer.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { GoalStore } from "../src/goals/GoalStore.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { Memory } from "../src/memory/Memory.ts"
import { Presence } from "../src/presence/Presence.ts"
import { Tidier } from "../src/presence/Tidier.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { layerScripted } from "../src/providers/FakeProvider.ts"
import type { Providers } from "../src/providers/Providers.ts"
import { Settings } from "../src/settings/Settings.ts"
import { DatabaseTest } from "../src/store/Database.ts"
import { Telemetry } from "../src/telemetry/Telemetry.ts"

const makeLayer = (providers: Layer.Layer<Providers>) =>
  Conductor.layer.pipe(
    Layer.provide(Filer.layer),
    Layer.provideMerge(Tidier.layer),
    Layer.provideMerge(Presence.layer),
    Layer.provideMerge(Settings.layer),
    Layer.provideMerge(Memory.layer),
    Layer.provide(HomeGit.layerNoop),
    Layer.provideMerge(ChatStore.layer),
    Layer.provideMerge(ChatBus.layer),
    Layer.provideMerge(Telemetry.layer),
    Layer.provide(providers),
    Layer.provide(
      DomoConfig.layerFrom({ home: mkdtempSync(join(tmpdir(), "domo-test-")), port: 0 }),
    ),
    Layer.provideMerge(GoalStore.layer),
    Layer.provide(DatabaseTest),
    Layer.provide(NodeFileSystem.layer),
  )

type Finished = Extract<ChatEvent, { _tag: "AgentFinished" }>
type Refiled = Extract<ChatEvent, { _tag: "MessagesRefiled" }>

/** Sends a message and waits for the agent reply to finish on the feed. */
const sendAndWait = (text: string, replyTo?: MessageId) =>
  Effect.gen(function* () {
    const conductor = yield* Conductor
    const finished = yield* (yield* ChatBus).feed.pipe(
      Stream.filter((event): event is Finished => event._tag === "AgentFinished"),
      Stream.runHead,
      Effect.forkChild,
    )
    yield* Effect.sleep("5 millis")
    const { messageId } = yield* conductor.send(
      replyTo === undefined ? { text } : { text, replyTo: { messageId: replyTo } },
    )
    const reply = Option.getOrThrow(yield* Fiber.join(finished)).message
    yield* Effect.sleep("20 millis") // let background filing settle
    return { userId: messageId, reply }
  })

describe("Conductor", () => {
  it.live("persists the exchange and streams the agent reply", () =>
    Effect.gen(function* () {
      const { reply } = yield* sendAndWait("hello")
      expect(reply).toMatchObject({ role: "agent", status: "done", text: "Echo: hello" })
      const history = yield* (yield* ChatStore).recentMessages(10)
      expect(history.map((m) => [m.role, m.text])).toEqual([
        ["user", "hello"],
        ["agent", "Echo: hello"],
      ])
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("resumes the provider session and names the topic", () =>
    Effect.gen(function* () {
      yield* sendAndWait("first")
      const second = yield* sendAndWait("second")
      expect(second.reply.text).toBe("Echo: second") // no re-seeding inside one session
      const topic = Option.getOrThrow(yield* (yield* ChatStore).currentTopic)
      expect(topic.providerSessionId).toMatch(/^echo-/)
      expect(topic.title).toBe("Echo chat")
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("a model switch seeds the new session with the topic so far", () =>
    Effect.gen(function* () {
      yield* sendAndWait("start")
      const { reply } = yield* sendAndWait("@codex take over")
      expect(reply.model).toBe("codex:default")
      expect(reply.text).toBe("Echo: take over (with context)")
      const counts = yield* (yield* Telemetry).countsByTag
      expect(counts.get("ModelOverridden")).toBe(1)
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("the filer moves an exchange to a new topic and announces it", () =>
    Effect.gen(function* () {
      yield* sendAndWait("hello")
      const refiled = yield* (yield* ChatBus).feed.pipe(
        Stream.filter((event): event is Refiled => event._tag === "MessagesRefiled"),
        Stream.runHead,
        Effect.forkChild,
      )
      yield* Effect.sleep("5 millis")
      const { userId } = yield* sendAndWait("[[topic:Kitchen remodel]] did the quote arrive?")
      const event = Option.getOrThrow(yield* Fiber.join(refiled))
      expect(event.topicTitle).toBe("Kitchen remodel")
      expect(event.messageIds).toContain(userId)
      const current = Option.getOrThrow(yield* (yield* ChatStore).currentTopic)
      expect(current.title).toBe("Kitchen remodel")
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("a re-filed topic's first session is seeded, and replies go to the replied topic", () =>
    Effect.gen(function* () {
      const kitchen = yield* sendAndWait("[[topic:Kitchen]] pick a contractor")
      // Runs in Kitchen (now current) with a fresh session, which must be caught up first.
      const taxes = yield* sendAndWait("[[topic:Taxes]] what's due?")
      expect(taxes.reply.text).toContain("(with context)")
      const { reply } = yield* sendAndWait("and the start date?", kitchen.userId)
      const store = yield* ChatStore
      const replyMessage = Option.getOrThrow(yield* store.getMessage(reply.id))
      const kitchenTopic = Option.getOrThrow(yield* store.getTopic(replyMessage.topicId))
      expect(kitchenTopic.title).toBe("Kitchen")
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("a provider failure finishes the message as failed", () =>
    Effect.gen(function* () {
      const { reply } = yield* sendAndWait("hello")
      expect(reply.status).toBe("failed")
    }).pipe(Effect.provide(makeLayer(layerScripted([])))),
  )

  it.live("answering a Choice records it and continues the conversation", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const { reply } = yield* sendAndWait("which contractor?")
      // As if the agent had called render_choice during the run.
      yield* store.updateMessage(
        new Message({
          ...reply,
          component: {
            _tag: "Choice",
            id: ComponentId.make("c1"),
            question: "Which contractor?",
            options: [
              { value: "hale", label: "Hale & Co." },
              { value: "birch", label: "Birch Build" },
            ],
            reversible: true,
          },
        }),
      )
      const conductor = yield* Conductor
      const next = yield* (yield* ChatBus).feed.pipe(
        Stream.filter((event): event is Finished => event._tag === "AgentFinished"),
        Stream.runHead,
        Effect.forkChild,
      )
      yield* Effect.sleep("5 millis")
      yield* conductor.answer({ messageId: reply.id, value: "hale", freeText: false })
      const continued = Option.getOrThrow(yield* Fiber.join(next)).message
      expect(continued.text).toContain("Hale & Co.")

      const answered = Option.getOrThrow(yield* store.getMessage(reply.id))
      expect(answered.resolution).toMatchObject({
        value: "hale",
        label: "Hale & Co.",
        freeText: false,
      })
      const again = yield* Effect.flip(
        conductor.answer({ messageId: reply.id, value: "birch", freeText: false }),
      )
      expect(again._tag).toBe("SendFailed")
      const counts = yield* (yield* Telemetry).countsByTag
      expect(counts.get("ChoiceAnswered")).toBe(1)
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("replying to an unanswered Choice in your own words answers it", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const { reply } = yield* sendAndWait("which one?")
      yield* store.updateMessage(
        new Message({
          ...reply,
          component: {
            _tag: "Choice",
            id: ComponentId.make("c2"),
            question: "Which one?",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
            reversible: true,
          },
        }),
      )
      yield* sendAndWait("neither, wait until spring", reply.id)
      const answered = Option.getOrThrow(yield* store.getMessage(reply.id))
      expect(answered.resolution).toMatchObject({
        freeText: true,
        label: "neither, wait until spring",
      })
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("ticking a checklist item updates the message in place", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const { reply } = yield* sendAndWait("plan it")
      yield* store.updateMessage(
        new Message({
          ...reply,
          component: {
            _tag: "Checklist",
            id: ComponentId.make("k1"),
            items: [
              { label: "Measure", done: false },
              { label: "Order", done: false },
            ],
          },
        }),
      )
      yield* (yield* Conductor).check(reply.id, 1, true)
      const updated = Option.getOrThrow(yield* store.getMessage(reply.id))
      expect(
        updated.component?._tag === "Checklist" && updated.component.items.map((i) => i.done),
      ).toEqual([false, true])
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("tool activity produces a work receipt and a viewable run", () =>
    Effect.gen(function* () {
      const runId = "fixture" as RunId
      const { reply } = yield* sendAndWait("fix it")
      expect(reply.work).toMatchObject({ status: "done", summary: "Ran 2 tools, edited 1 file" })
      const run = Option.getOrThrow(yield* (yield* ChatStore).getRun(reply.work?.runId ?? runId))
      expect(run.tools.map((t) => t.name)).toEqual(["Edit", "Bash"])
      expect(run.files).toEqual(["/p/a.ts"])
    }).pipe(
      Effect.provide(
        makeLayer(
          layerScripted([
            [
              { _tag: "RunStarted", runId: "x" as RunId, sessionId: "s1" },
              { _tag: "ToolStarted", runId: "x" as RunId, callId: "1", name: "Edit", input: {} },
              { _tag: "FileChanged", runId: "x" as RunId, path: "/p/a.ts" },
              { _tag: "ToolFinished", runId: "x" as RunId, callId: "1", ok: true, summary: "ok" },
              { _tag: "ToolStarted", runId: "x" as RunId, callId: "2", name: "Bash", input: {} },
              {
                _tag: "ToolStarted",
                runId: "x" as RunId,
                callId: "3",
                name: "mcp__domo__render_choice",
                input: {},
              },
              {
                _tag: "ToolFinished",
                runId: "x" as RunId,
                callId: "2",
                ok: true,
                summary: "tests pass",
              },
              { _tag: "TextDelta", runId: "x" as RunId, text: "Fixed." },
              {
                _tag: "RunCompleted",
                runId: "x" as RunId,
                text: "Fixed.",
                usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
              },
            ],
          ]),
        ),
      ),
    ),
  )

  it.live("the echo provider's [[work]] directive yields a receipt", () =>
    Effect.gen(function* () {
      const { reply } = yield* sendAndWait("[[work]] now")
      expect(reply.work?.summary).toBe("Ran 2 tools, edited 1 file")
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("answering a question an agent is waiting on goes straight to it, with no new run", () =>
    Effect.gen(function* () {
      const store = yield* ChatStore
      const bus = yield* ChatBus
      const { reply } = yield* sendAndWait("push it?")
      yield* store.updateMessage(
        new Message({
          ...reply,
          component: {
            _tag: "Choice",
            id: ComponentId.make("ask1"),
            question: "Push the branch?",
            options: [
              { value: "approve", label: "Go ahead" },
              { value: "decline", label: "Not now" },
            ],
            reversible: false,
          },
        }),
      )
      const waiting = yield* bus.registerAsk(reply.id)
      const before = (yield* store.recentMessages(50)).length
      yield* (yield* Conductor).answer({ messageId: reply.id, value: "approve", freeText: false })
      expect(yield* Deferred.await(waiting)).toMatchObject({ _tag: "Answered", value: "approve" })
      expect((yield* store.recentMessages(50)).length).toBe(before)
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )

  it.live("a new message while an agent waits releases it", () =>
    Effect.gen(function* () {
      const bus = yield* ChatBus
      const { reply } = yield* sendAndWait("first")
      const waiting = yield* bus.registerAsk(reply.id)
      yield* sendAndWait("something else entirely")
      expect(yield* Deferred.await(waiting)).toEqual({ _tag: "MovedOn" })
    }).pipe(Effect.provide(makeLayer(layerEcho))),
  )
})
