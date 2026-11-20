import { randomUUID } from "node:crypto"
import {
  type ImageRef,
  Message,
  MessageId,
  type ModelRef,
  type ReplyTarget,
  type ReplyTo,
  replyTargets,
  SendFailed,
  Topic,
  TopicId,
} from "@domo/domain"
import { Context, DateTime, Effect, FiberSet, FileSystem, Layer, Option, Semaphore } from "effect"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { GoalStore } from "../goals/GoalStore.ts"
import { Images } from "../images/Images.ts"
import { Memory } from "../memory/Memory.ts"
import { parseMention } from "../models/registry.ts"
import { Tidier } from "../presence/Tidier.ts"
import { Providers } from "../providers/Providers.ts"
import { Settings } from "../settings/Settings.ts"
import { Telemetry } from "../telemetry/Telemetry.ts"
import { ensureFolder, folderContext, folderPath, readNotes } from "../topics/folders.ts"
import { makeChoices } from "./choices.ts"
import { Filer } from "./Filer.ts"
import { isConfirmation, makeFiling } from "./filing.ts"
import { makeSystemPrompt, mcpFor, nameOf } from "./prompt.ts"
import { makeTurn } from "./turn.ts"

export interface SendInput {
  readonly text: string
  readonly replyTo?: ReplyTo
  readonly images?: ReadonlyArray<ImageRef>
}

export interface AnswerInput {
  readonly messageId: MessageId
  readonly value: string
  readonly freeText: boolean
}

const newId = Effect.sync(() => randomUUID())

/** How much unseen topic history to hand a provider session at most. */
const SEED_LIMIT = 30

const transcript = (messages: ReadonlyArray<Message>): string =>
  messages.map((m) => `${m.role === "user" ? "User" : "Domo"}: ${m.text}`).join("\n\n")

const fail = (message: string) => new SendFailed({ message })

/** Returning to a topic idle this long (or folded) starts with a restatement. */
const PICK_UP_AFTER_MS = 30 * 60 * 1000

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

/** "Nov 4 · view": the original messages behind a restatement. */
const sourceTag = (topic: Topic, replyTo: ReplyTo | undefined) => ({
  label: dayLabel.format(DateTime.toDateUtc(topic.lastActivityAt)),
  messageIds:
    topic.sourceMessageIds.length > 0
      ? topic.sourceMessageIds
      : replyTo === undefined
        ? []
        : [replyTo.messageId],
})

const pickUpNote = (topic: Topic) =>
  [
    "[The user is coming back to this topic.",
    topic.summary.length > 0 ? ` Where it stood: ${topic.summary}` : "",
    topic.decision === undefined ? "" : ` Decided: ${topic.decision}.`,
    " Begin your reply with one short sentence restating where this stands, then answer.]",
  ].join("")

/**
 * Turns a user message into an agent reply. The message goes straight to the
 * current topic (or the replied message's topic) — no routing delay. The run
 * gets Domo's MCP tools so it can put a component on its reply; afterwards the
 * Filer files the exchange in the background.
 */
export class Conductor extends Context.Service<
  Conductor,
  {
    send(input: SendInput): Effect.Effect<{ readonly messageId: MessageId }, SendFailed>
    /** Answers a Choice, then continues the conversation with the answer. */
    answer(input: AnswerInput): Effect.Effect<void, SendFailed>
    check(messageId: MessageId, index: number, done: boolean): Effect.Effect<void>
    /** Re-opens a reversible Choice; allowed until the next tidy. */
    undoAnswer(messageId: MessageId): Effect.Effect<void, SendFailed>
    /** "Not quite": the restatement was wrong, so the topic's summary is re-derived. */
    notQuite(messageId: MessageId): Effect.Effect<void>
  }
>()("domo/conductor/Conductor") {
  static readonly layer = Layer.effect(
    Conductor,
    Effect.gen(function* () {
      const store = yield* ChatStore
      const bus = yield* ChatBus
      const providers = yield* Providers
      const telemetry = yield* Telemetry
      const settings = yield* Settings
      const filer = yield* Filer
      const tidier = yield* Tidier
      const config = yield* DomoConfig
      const fs = yield* FileSystem.FileSystem
      const images = yield* Images
      const systemPrompt = makeSystemPrompt(config, fs, yield* GoalStore, yield* Memory)
      const background = yield* FiberSet.make()
      const oneAtATime = yield* Semaphore.make(1)
      const interrupted = yield* store.interruptStreaming
      if (interrupted > 0)
        yield* Effect.logInfo(`marked ${interrupted} interrupted reply(s) from before the restart`)
      const turn = makeTurn({ store, bus, providers, mcp: mcpFor(config), systemPrompt, nameOf })

      const newTopic = Effect.fnUntraced(function* (title: string, model: ModelRef) {
        return new Topic({
          id: TopicId.make(yield* newId),
          title,
          status: "live",
          stakes: "low",
          summary: "",
          sourceMessageIds: [],
          folded: false,
          model,
          lastActivityAt: yield* DateTime.now,
        })
      })

      /** Reply-to picks the topic deterministically; otherwise stay in the current one. */
      const resolveTopic = Effect.fnUntraced(function* (
        replyTo: ReplyTo | undefined,
        requested: ModelRef | undefined,
      ) {
        const now = yield* DateTime.now
        const replied =
          replyTo === undefined
            ? Option.none<Message>()
            : yield* store.getMessage(replyTo.messageId)
        const base = Option.isSome(replied)
          ? yield* store.getTopic(replied.value.topicId)
          : yield* store.currentTopic
        const fallback = yield* settings.mainModel
        if (Option.isNone(base)) {
          const fresh = yield* newTopic("Conversation", requested ?? fallback)
          return requested === undefined ? fresh : new Topic({ ...fresh, modelPinned: true })
        }

        const topic = base.value
        if (requested === undefined) {
          // Unpinned topics follow the default model, even after it changes in settings.
          if (topic.modelPinned === true || topic.model.key === fallback.key)
            return new Topic({ ...topic, folded: false, lastActivityAt: now })
          const { providerSessionId: _old, ...unpinned } = topic
          return new Topic({ ...unpinned, folded: false, model: fallback, lastActivityAt: now })
        }
        if (requested.key === topic.model.key)
          return new Topic({ ...topic, folded: false, modelPinned: true, lastActivityAt: now })
        // A different model means a new provider session; seeding catches it up.
        yield* telemetry.record({
          _tag: "ModelOverridden",
          from: topic.model.key,
          to: requested.key,
        })
        const { providerSessionId: _dropped, ...rest } = topic
        return new Topic({
          ...rest,
          folded: false,
          model: requested,
          modelPinned: true,
          lastActivityAt: now,
        })
      })

      const { applyFiling, settleConfirmation } = makeFiling({ store, bus, newId, newTopic })

      /**
       * Gives the topic its folder the first time it runs. A provider session started elsewhere
       * can't resume in the new working directory, so it starts afresh, seeded with recent messages.
       */
      const withFolder = Effect.fnUntraced(function* (topic: Topic) {
        if (topic.folder !== undefined) return yield* ensureFolder(fs, config.home, topic)
        const placed = yield* ensureFolder(fs, config.home, topic)
        const { providerSessionId: _elsewhere, ...rest } = placed
        const moved = topic.project === undefined ? new Topic(rest) : placed
        yield* store.upsertTopic(moved)
        return moved
      })

      const runAgent = Effect.fnUntraced(function* (
        resolved: Topic,
        userMessage: Message,
        agentMessage: Message,
        prompt: string,
      ) {
        // Re-read inside the permit: an earlier run may have saved the provider session since.
        const stored = yield* store.getTopic(resolved.id)
        const current =
          Option.isSome(stored) && stored.value.model.key === resolved.model.key
            ? stored.value
            : resolved
        const topic = yield* withFolder(current)
        const folder = folderPath(config.home, topic.folder ?? "")
        const notes = yield* readNotes(fs, config.home, topic.folder ?? "")
        const unseen = yield* store.unseenMessages(
          topic.id,
          topic.providerSessionId,
          [userMessage.id, agentMessage.id],
          SEED_LIMIT,
        )
        const seeded =
          unseen.length === 0
            ? prompt
            : `Context from this conversation that you haven't seen yet:\n\n${transcript(unseen)}\n\n---\n\n${prompt}`

        const { finished, outcome } = yield* turn({
          message: agentMessage,
          model: topic.model,
          prompt: seeded,
          onSession: (sessionId) =>
            store.upsertTopic(new Topic({ ...topic, providerSessionId: sessionId })),
          ...(topic.providerSessionId === undefined ? {} : { sessionId: topic.providerSessionId }),
          cwd: topic.project ?? folder,
          images: yield* images.forRun(userMessage.images ?? []),
          ...(topic.project === undefined ? {} : { project: topic.project }),
          context: folderContext(folder, notes, topic.project === undefined),
        })
        // Whatever the run wrote to notes.md becomes searchable.
        yield* store.indexNotes(topic.id, yield* readNotes(fs, config.home, topic.folder ?? ""))
        const failed = Option.isSome(outcome.failure)

        if (failed || outcome.sessionId === undefined) return Option.none()
        yield* store.markSeen(
          [...unseen.map((m) => m.id), userMessage.id, agentMessage.id],
          outcome.sessionId,
        )
        return Option.some({ topic, reply: finished })
      })

      /** Runs after the run's permit is released, so filing never delays the next message. */
      const fileExchange = Effect.fnUntraced(function* (
        topic: Topic,
        userMessage: Message,
        reply: Message,
      ) {
        const others = (yield* store.openTopics(8)).filter((t) => t.id !== topic.id)
        const filing = yield* filer.file(
          { user: userMessage.text, agent: reply.text },
          topic,
          others,
        )
        // An answered question in the reply means the user already decided; don't ask twice.
        const decided = Option.exists(
          yield* store.getMessage(reply.id),
          (m) => m.resolution !== undefined,
        )
        yield* applyFiling(filing, topic, [userMessage.id, reply.id], decided)
      })

      /** The highlighted fragment, or the start of the replied-to message. */
      const quoteOf = Effect.fnUntraced(function* (target: ReplyTarget) {
        if (target.quote !== undefined) return target.quote.exact
        const replied = yield* store.getMessage(target.messageId)
        if (Option.isNone(replied)) return undefined
        const text = replied.value.text
        return text.length <= 400 ? text : `${text.slice(0, 400)}…`
      })

      /** Every quote the user picked, as markdown blockquotes in the order they were picked. */
      const quoteFor = Effect.fnUntraced(function* (replyTo: ReplyTo | undefined) {
        if (replyTo === undefined) return undefined
        const quotes = yield* Effect.forEach(replyTargets(replyTo), quoteOf)
        const found = quotes.filter((q) => q !== undefined)
        if (found.length === 0) return undefined
        return found.map((q) => q.replace(/^/gm, "> ")).join("\n\n")
      })

      const { resolveChoice, check, undoAnswer, notQuite } = makeChoices({
        store,
        bus,
        telemetry,
        tidier,
      })

      /** Shows the user's words in the chat without starting a run (the agent is already running). */
      const postUserMessage = Effect.fnUntraced(function* (topicId: TopicId, input: SendInput) {
        const userMessage = new Message({
          id: MessageId.make(yield* newId),
          topicId,
          role: "user",
          status: "done",
          text: input.text,
          createdAt: yield* DateTime.now,
          ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
          ...(input.images === undefined || input.images.length === 0
            ? {}
            : { images: input.images }),
        })
        yield* store.insertMessage(userMessage)
        yield* bus.publish({ _tag: "MessageAdded", message: userMessage })
        return { messageId: userMessage.id }
      })

      const send = Effect.fn("Conductor.send")(function* (input: SendInput) {
        const mention = parseMention(input.text)
        const attached = input.images ?? []
        for (const image of attached) {
          if (Option.isNone(yield* images.find(image.id)))
            return yield* fail("An attached image didn't upload. Attach it again.")
        }
        if (mention.text.trim().length === 0 && attached.length === 0)
          return yield* fail("Nothing to send after the model mention.")

        // Replying to an unanswered Choice in your own words answers it.
        if (input.replyTo !== undefined) {
          const replied = yield* store.getMessage(input.replyTo.messageId)
          if (Option.isSome(replied) && (yield* resolveChoice(replied.value, mention.text, true))) {
            if (isConfirmation(replied.value))
              yield* settleConfirmation(replied.value.topicId, mention.text, true)
            // An agent is waiting on this question (ask_user): hand it the reply; no new run.
            const waited = yield* bus.completeAsk(replied.value.id, {
              _tag: "Answered",
              value: mention.text,
              label: mention.text,
              freeText: true,
            })
            if (waited) return yield* postUserMessage(replied.value.topicId, input)
          }
        } else {
          // A new message instead of an answer: waiting agents stop waiting, so the chat never stalls.
          yield* bus.releaseAsks
        }

        const current = yield* store.currentTopic
        const before = yield* resolvePrevious(input.replyTo)
        const topic = yield* resolveTopic(input.replyTo, mention.model)
        yield* store.upsertTopic(topic)
        // Coming back to an older topic: the reply restates where it stood, with its source.
        const pickUp =
          Option.isSome(before) &&
          (Option.isNone(current) || current.value.id !== before.value.id) &&
          (before.value.folded || (yield* olderThan(before.value, PICK_UP_AFTER_MS)))
            ? before
            : Option.none<Topic>()

        const now = yield* DateTime.now
        const userMessage = new Message({
          id: MessageId.make(yield* newId),
          topicId: topic.id,
          role: "user",
          status: "done",
          text: input.text,
          createdAt: now,
          ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
          ...(attached.length === 0 ? {} : { images: attached }),
        })
        const agentMessage = new Message({
          id: MessageId.make(yield* newId),
          topicId: topic.id,
          role: "agent",
          status: "streaming",
          text: "",
          model: topic.model.key,
          createdAt: now,
          ...(Option.isSome(pickUp) && sourceTag(pickUp.value, input.replyTo).messageIds.length > 0
            ? { sources: [sourceTag(pickUp.value, input.replyTo)] }
            : {}),
        })
        yield* store.insertMessage(userMessage)
        yield* store.insertMessage(agentMessage)
        yield* bus.publish({ _tag: "MessageAdded", message: userMessage })
        yield* bus.publish({ _tag: "MessageAdded", message: agentMessage })

        const quoted = yield* quoteFor(input.replyTo)
        const said =
          mention.text.trim().length > 0 ? mention.text : "(The user sent only the attached image.)"
        const asked = quoted === undefined ? said : `${quoted}\n\n${said}`
        const prompt = Option.isSome(pickUp) ? `${pickUpNote(pickUp.value)}\n\n${asked}` : asked
        yield* FiberSet.run(
          background,
          oneAtATime
            .withPermits(1)(runAgent(topic, userMessage, agentMessage, prompt))
            .pipe(
              Effect.flatMap((result) =>
                // Replies were placed deliberately, so they skip filing.
                Option.isSome(result) && input.replyTo === undefined
                  ? fileExchange(result.value.topic, userMessage, result.value.reply)
                  : Effect.void,
              ),
            ),
        )
        return { messageId: userMessage.id }
      })

      const answer = Effect.fn("Conductor.answer")(function* (input: AnswerInput) {
        const message = yield* store.getMessage(input.messageId)
        if (Option.isNone(message)) return yield* fail("That message no longer exists.")
        const resolved = yield* resolveChoice(message.value, input.value, input.freeText)
        if (!resolved) return yield* fail("That question was already answered.")
        // An agent is waiting on this question (ask_user): answer it directly; no new run.
        const label0 =
          Option.getOrThrow(yield* store.getMessage(input.messageId)).resolution?.label ??
          input.value
        const waited = yield* bus.completeAsk(input.messageId, {
          _tag: "Answered",
          value: input.value,
          label: label0,
          freeText: input.freeText,
        })
        if (waited) return
        // Domo's own confirmation notes adjust the topic; no model needs to run.
        if (isConfirmation(message.value)) {
          return yield* settleConfirmation(message.value.topicId, input.value, input.freeText)
        }
        const label =
          Option.getOrThrow(yield* store.getMessage(input.messageId)).resolution?.label ??
          input.value
        yield* send({ text: label, replyTo: { messageId: input.messageId } })
      })

      /** The topic a reply goes back to, as it was before this message. */
      const resolvePrevious = Effect.fnUntraced(function* (replyTo: ReplyTo | undefined) {
        if (replyTo === undefined) return Option.none<Topic>()
        const replied = yield* store.getMessage(replyTo.messageId)
        return Option.isSome(replied)
          ? yield* store.getTopic(replied.value.topicId)
          : Option.none<Topic>()
      })

      const olderThan = Effect.fnUntraced(function* (topic: Topic, ms: number) {
        const now = yield* DateTime.now
        return DateTime.toEpochMillis(now) - DateTime.toEpochMillis(topic.lastActivityAt) > ms
      })

      return Conductor.of({ send, answer, check, undoAnswer, notQuite })
    }),
  )
}
