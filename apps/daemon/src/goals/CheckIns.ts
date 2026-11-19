import { randomUUID } from "node:crypto"
import { Goal, Message, MessageId, ModelRef, Topic, TopicId } from "@domo/domain"
import { Context, DateTime, Effect, FiberSet, Layer, Option } from "effect"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { runModel } from "../mcp/orchestration.ts"
import { Providers } from "../providers/Providers.ts"
import { GoalStore } from "./GoalStore.ts"

export const CHECK_IN_MODEL = new ModelRef({ provider: "claude", id: "claude-haiku-5-5" })

/** At most this many check-ins at once, so a return never floods the page. */
const MAX_PER_VISIT = 3

const INSTRUCTIONS = `You are Domo, the user's chief of staff, checking in on one of their goals.
Write one or two short sentences. If something moved, say what. If nothing moved, say plainly that
it's stuck and offer one concrete next step you can take for them. No greeting, no lists, no headers.`

export const checkInPrompt = (goal: Goal, recent: ReadonlyArray<Message>) =>
  [
    `Goal check-in: ${goal.title}`,
    `What done looks like: ${goal.outcome}`,
    ...(goal.due === undefined ? [] : [`Due: ${goal.due}`]),
    goal.progress.length === 0
      ? "No progress recorded yet."
      : `Recent progress:\n${goal.progress.map((p) => `- ${DateTime.formatIso(p.at).slice(0, 10)}: ${p.note}`).join("\n")}`,
    ...(recent.length === 0
      ? []
      : [
          "Latest messages in this goal's topic:",
          ...recent.map((m) => `${m.role === "user" ? "User" : "Domo"}: ${m.text.slice(0, 300)}`),
        ]),
  ].join("\n")

/**
 * Goal check-ins: when the user comes back (or opens Domo for the first time
 * in a day), each goal due for a check-in gets one short note in its topic.
 * Then its next check-in moves a full cadence out, whatever the note said.
 */
export class CheckIns extends Context.Service<
  CheckIns,
  {
    /** Posts check-ins for due goals; returns how many were posted. */
    readonly run: Effect.Effect<number>
    /** Same, in the background (from the presence handler). */
    readonly runInBackground: Effect.Effect<void>
  }
>()("domo/goals/CheckIns") {
  static readonly layer = Layer.effect(
    CheckIns,
    Effect.gen(function* () {
      const goals = yield* GoalStore
      const store = yield* ChatStore
      const bus = yield* ChatBus
      const providers = yield* Providers
      const background = yield* FiberSet.make()

      const topicFor = Effect.fnUntraced(function* (goal: Goal) {
        const existing =
          goal.topicId === undefined ? Option.none() : yield* store.getTopic(goal.topicId)
        if (Option.isSome(existing)) return existing.value
        const topic = new Topic({
          id: TopicId.make(randomUUID()),
          title: goal.title,
          status: "unresolved",
          stakes: "low",
          summary: goal.outcome,
          sourceMessageIds: [],
          folded: false,
          model: CHECK_IN_MODEL,
          lastActivityAt: yield* DateTime.now,
        })
        yield* store.upsertTopic(topic)
        return topic
      })

      const checkIn = Effect.fnUntraced(function* (goal: Goal) {
        const now = yield* DateTime.now
        // Move the next check-in first, so a failure never makes it repeat on every visit.
        yield* goals.save(
          new Goal({ ...goal, nextCheckInAt: DateTime.add(now, { days: goal.cadenceDays }) }),
        )
        const topic = yield* topicFor(goal)
        const recent = yield* store.topicMessages(topic.id, 8)
        const note = yield* runModel(providers, CHECK_IN_MODEL, checkInPrompt(goal, recent), {
          mode: "utility",
          systemPrompt: INSTRUCTIONS,
        }).pipe(Effect.timeout("2 minutes"), Effect.option)
        if (Option.isNone(note) || !note.value.ok || note.value.text.trim().length === 0)
          return false
        const message = new Message({
          id: MessageId.make(randomUUID()),
          topicId: topic.id,
          role: "agent",
          status: "done",
          text: note.value.text.trim(),
          model: CHECK_IN_MODEL.key,
          createdAt: now,
        })
        yield* store.insertMessage(message)
        yield* store.upsertTopic(new Topic({ ...topic, folded: false, lastActivityAt: now }))
        yield* bus.publish({ _tag: "MessageAdded", message })
        return true
      })

      const run = Effect.gen(function* () {
        const due = (yield* goals.due(yield* DateTime.now)).slice(0, MAX_PER_VISIT)
        const posted = yield* Effect.forEach(due, checkIn, { concurrency: MAX_PER_VISIT })
        return posted.filter(Boolean).length
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("goal check-ins failed", cause).pipe(Effect.as(0)),
        ),
        Effect.withSpan("CheckIns.run"),
      )

      return CheckIns.of({
        run,
        runInBackground: FiberSet.run(background, run).pipe(Effect.asVoid),
      })
    }),
  )
}
