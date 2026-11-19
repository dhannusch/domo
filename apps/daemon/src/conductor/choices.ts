import { Message, type MessageId, SendFailed, Topic } from "@domo/domain"
import { DateTime, Effect, Option } from "effect"
import type { ChatBus } from "../chat/ChatBus.ts"
import type { ChatStore } from "../chat/ChatStore.ts"
import type { Tidier } from "../presence/Tidier.ts"
import type { Telemetry } from "../telemetry/Telemetry.ts"

interface Deps {
  readonly store: ChatStore["Service"]
  readonly bus: ChatBus["Service"]
  readonly telemetry: Telemetry["Service"]
  readonly tidier: Tidier["Service"]
}

const fail = (message: string) => new SendFailed({ message })

/** Answers to components and corrections: recording, ticking, undoing, "not quite". */
export const makeChoices = ({ store, bus, telemetry, tidier }: Deps) => {
  /** Records the answer on the Choice; it collapses to an inert receipt in the UI. */
  const resolveChoice = Effect.fnUntraced(function* (
    message: Message,
    value: string,
    freeText: boolean,
  ) {
    const choice = message.component
    if (choice?._tag !== "Choice" || message.resolution !== undefined) return false
    const now = yield* DateTime.now
    const label = freeText ? value : (choice.options.find((o) => o.value === value)?.label ?? value)
    const updated = new Message({ ...message, resolution: { value, label, freeText, at: now } })
    yield* store.updateMessage(updated)
    yield* bus.publish({ _tag: "MessageUpdated", message: updated })
    yield* telemetry.record({
      _tag: "ChoiceAnswered",
      componentId: choice.id,
      freeText,
      latencyMs: Math.max(
        0,
        DateTime.toEpochMillis(now) - DateTime.toEpochMillis(message.createdAt),
      ),
    })
    return true
  })

  const check = Effect.fn("Conductor.check")(function* (
    messageId: MessageId,
    index: number,
    done: boolean,
  ) {
    const message = yield* store.getMessage(messageId)
    if (Option.isNone(message) || message.value.component?._tag !== "Checklist") return
    const checklist = message.value.component
    const items = checklist.items.map((item, i) => (i === index ? { ...item, done } : item))
    const updated = new Message({ ...message.value, component: { ...checklist, items } })
    yield* store.updateMessage(updated)
    yield* bus.publish({ _tag: "MessageUpdated", message: updated })
  })

  const undoAnswer = Effect.fn("Conductor.undoAnswer")(function* (messageId: MessageId) {
    const message = yield* store.getMessage(messageId)
    if (Option.isNone(message)) return yield* fail("That message no longer exists.")
    const { resolution, ...rest } = message.value
    const choice = message.value.component
    if (resolution === undefined || choice?._tag !== "Choice" || !choice.reversible) {
      return yield* fail("That can't be undone.")
    }
    // One undo rule everywhere: reversible things stay undoable until the next tidy.
    const lastTidy = yield* tidier.lastTidyMs
    if (Option.isSome(lastTidy) && lastTidy.value > DateTime.toEpochMillis(resolution.at)) {
      return yield* fail("That was settled before the last tidy, so it can't be undone here.")
    }
    const reopened = new Message(rest)
    yield* store.updateMessage(reopened)
    yield* bus.publish({ _tag: "MessageUpdated", message: reopened })
  })

  const notQuite = Effect.fn("Conductor.notQuite")(function* (messageId: MessageId) {
    const message = yield* store.getMessage(messageId)
    if (Option.isNone(message)) return
    yield* telemetry.record({
      _tag: "RestatementRejected",
      topicId: message.value.topicId,
      messageId,
    })
    const topic = yield* store.getTopic(message.value.topicId)
    if (Option.isNone(topic)) return
    const { decision: _wrong, ...rest } = topic.value
    yield* store.upsertTopic(new Topic({ ...rest, summary: "", status: "unresolved" }))
  })

  return { resolveChoice, check, undoAnswer, notQuite }
}
