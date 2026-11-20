import { randomUUID } from "node:crypto"
import { Message, MessageId, Topic, TopicId } from "@domo/domain"
import { Context, DateTime, Effect, Layer, Option, Schedule, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { Tasks } from "../conductor/Tasks.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { Notifier } from "../notify/Notifier.ts"

/** Something to say or do at a set time, in the topic it was asked for. */
export interface Reminder {
  readonly id: string
  readonly topicId: TopicId
  readonly dueAt: DateTime.Utc
  /** What Domo says when it's due. */
  readonly note: string
  /** When set, this runs as a background task at that time, and its result is the message. */
  readonly task?: string
}

const Row = Schema.Struct({
  id: Schema.String,
  topic_id: Schema.String,
  due_at: Schema.DateTimeUtcFromString,
  note: Schema.String,
  task: Schema.NullOr(Schema.String),
})
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row))

/** A reminder that fires this much later than due (Domo wasn't running) says so. */
const LATE_MS = 10 * 60 * 1000

export class Reminders extends Context.Service<
  Reminders,
  {
    add(input: Omit<Reminder, "id">): Effect.Effect<Reminder>
    readonly pending: Effect.Effect<ReadonlyArray<Reminder>>
    cancel(id: string): Effect.Effect<boolean>
    /** Delivers everything due (each once). The loop calls it; tests call it directly. */
    readonly deliverDue: Effect.Effect<number>
  }
>()("domo/reminders/Reminders") {
  static readonly layer = Layer.effect(
    Reminders,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const store = yield* ChatStore
      const bus = yield* ChatBus
      const tasks = yield* Tasks
      const notifier = yield* Notifier

      const toReminder = (row: typeof Row.Type): Reminder => ({
        id: row.id,
        topicId: TopicId.make(row.topic_id),
        dueAt: row.due_at,
        note: row.note,
        ...(row.task === null ? {} : { task: row.task }),
      })

      const pending = sql`SELECT id, topic_id, due_at, note, task FROM reminders
        WHERE status = 'pending' ORDER BY due_at`.pipe(
        Effect.flatMap(decodeRows),
        Effect.map((rows) => rows.map(toReminder)),
        Effect.orDie,
      )

      const add = Effect.fn("Reminders.add")(function* (input: Omit<Reminder, "id">) {
        const reminder: Reminder = { id: randomUUID(), ...input }
        yield* sql`INSERT INTO reminders (id, topic_id, due_at, note, task, status, created_at)
          VALUES (${reminder.id}, ${input.topicId}, ${DateTime.formatIso(input.dueAt)}, ${input.note},
            ${input.task ?? null}, 'pending', ${DateTime.formatIso(yield* DateTime.now)})`
        return reminder
      }, Effect.orDie)

      const cancel = Effect.fn("Reminders.cancel")(function* (id: string) {
        const known = (yield* pending).some((r) => r.id === id)
        if (known) yield* sql`UPDATE reminders SET status = 'cancelled' WHERE id = ${id}`
        return known
      }, Effect.orDie)

      /** Posts the note into its topic, bringing the topic back from Earlier if it was folded. */
      const post = Effect.fnUntraced(function* (reminder: Reminder, note: string) {
        const now = yield* DateTime.now
        const topic = yield* store.getTopic(reminder.topicId)
        if (Option.isSome(topic))
          yield* store.upsertTopic(
            new Topic({ ...topic.value, folded: false, lastActivityAt: now }),
          )
        const message = new Message({
          id: MessageId.make(randomUUID()),
          topicId: reminder.topicId,
          role: "agent",
          status: "done",
          text: note,
          createdAt: now,
        })
        yield* store.insertMessage(message)
        yield* bus.publish({ _tag: "MessageAdded", message })
      })

      const deliver = Effect.fnUntraced(function* (reminder: Reminder) {
        // Marked first, so a failure never makes it fire twice.
        yield* sql`UPDATE reminders SET status = 'done' WHERE id = ${reminder.id}`.pipe(
          Effect.orDie,
        )
        const now = yield* DateTime.now
        const lateBy = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(reminder.dueAt)
        const late =
          lateBy > LATE_MS
            ? ` (This was due ${DateTime.formatIso(reminder.dueAt).slice(0, 16).replace("T", " ")} UTC, while Domo wasn't running.)`
            : ""
        if (reminder.task !== undefined) {
          yield* tasks
            .start({ topicId: reminder.topicId, title: reminder.note, instructions: reminder.task })
            .pipe(Effect.catch(() => post(reminder, `Reminder: ${reminder.note}${late}`)))
        } else {
          yield* post(reminder, `**Reminder:** ${reminder.note}${late}`)
        }
        yield* Effect.forkChild(
          notifier.needsYou({ title: "Domo reminder", body: reminder.note, tag: reminder.id }),
        )
      })

      const deliverDue = Effect.gen(function* () {
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        const due = (yield* pending).filter((r) => DateTime.toEpochMillis(r.dueAt) <= now)
        yield* Effect.forEach(due, deliver, { discard: true })
        return due.length
      })

      return Reminders.of({ add, pending, cancel, deliverDue })
    }),
  )

  /** Checks every few seconds; reminders are delivered within a tick of their time. */
  static readonly loop = Layer.effectDiscard(
    Effect.gen(function* () {
      const reminders = yield* Reminders
      const { tidyTickSeconds } = yield* DomoConfig
      yield* reminders.deliverDue.pipe(
        Effect.catchCause((cause) => Effect.logWarning("reminders tick failed", cause)),
        Effect.repeat(Schedule.spaced(`${Math.min(20, tidyTickSeconds)} seconds`)),
        Effect.forkScoped,
      )
    }),
  )
}
