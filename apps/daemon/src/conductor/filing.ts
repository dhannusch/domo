import { ComponentId, Message, MessageId, type ModelRef, Topic, type TopicId } from "@domo/domain"
import { DateTime, Effect, Option } from "effect"
import type { ChatBus } from "../chat/ChatBus.ts"
import type { ChatStore } from "../chat/ChatStore.ts"
import type { Filing, TopicState } from "./Filer.ts"

/** How many recent messages back a topic's summary (what a source tag's "view" opens). */
const SOURCE_LIMIT = 12

interface Deps {
  readonly store: ChatStore["Service"]
  readonly bus: ChatBus["Service"]
  readonly newId: Effect.Effect<string>
  readonly newTopic: (title: string, model: ModelRef) => Effect.Effect<Topic>
}

const withState = (
  topic: Topic,
  state: TopicState | undefined,
  messageIds: ReadonlyArray<MessageId>,
) =>
  new Topic({
    ...topic,
    sourceMessageIds: [...topic.sourceMessageIds, ...messageIds].slice(-SOURCE_LIMIT),
    ...(state === undefined
      ? {}
      : {
          status: state.resolved ? "resolved" : "unresolved",
          summary: state.summary,
          stakes: state.stakes,
          ...(state.decision === undefined ? {} : { decision: state.decision }),
        }),
  })

/** Marks a confirmation note: Domo's own message (no model ran), answered without a model call. */
export const isConfirmation = (message: Message) =>
  message.role === "agent" && message.model === undefined && message.component?._tag === "Choice"

/**
 * Applies the filer's verdict: places the exchange, records where the topic
 * stands, and — only for costly or irreversible decisions — asks once whether
 * Domo got the decision right. The trigger is the stakes, never confidence.
 */
export const makeFiling = ({ store, bus, newId, newTopic }: Deps) => {
  const confirm = Effect.fnUntraced(function* (topic: Topic, decision: string) {
    const note = new Message({
      id: MessageId.make(yield* newId),
      topicId: topic.id,
      role: "agent",
      status: "done",
      text: `Noting this as decided: ${decision}`,
      createdAt: yield* DateTime.now,
      component: {
        _tag: "Choice",
        id: ComponentId.make(yield* newId),
        question: "Is that right?",
        options: [
          { value: "confirm", label: "That's right" },
          { value: "open", label: "Not decided yet" },
        ],
        reversible: true,
      },
    })
    yield* store.insertMessage(note)
    yield* bus.publish({ _tag: "MessageAdded", message: note })
  })

  const applyFiling = Effect.fnUntraced(function* (
    filing: Filing,
    topic: Topic,
    messageIds: ReadonlyArray<MessageId>,
    /** The user already decided explicitly in this exchange (e.g. approved via ask_user). */
    decidedExplicitly = false,
  ) {
    const now = yield* DateTime.now
    const placement = filing.placement
    const target =
      placement._tag === "New"
        ? Option.some(yield* newTopic(placement.title, topic.model))
        : yield* store.getTopic(placement._tag === "Existing" ? placement.topicId : topic.id)
    if (Option.isNone(target)) return

    const moved = placement._tag !== "Same"
    const titled =
      placement._tag === "Same" &&
      placement.title !== undefined &&
      target.value.title === "Conversation"
        ? new Topic({ ...target.value, title: placement.title })
        : target.value
    const previousDecision = titled.decision
    const updated = withState(
      moved ? new Topic({ ...titled, folded: false, lastActivityAt: now }) : titled,
      filing.state,
      messageIds,
    )
    yield* store.upsertTopic(updated)

    if (moved) {
      yield* store.refile(messageIds, updated.id)
      yield* bus.publish({
        _tag: "MessagesRefiled",
        messageIds,
        topicId: updated.id,
        topicTitle: updated.title,
      })
    }

    const decision = filing.state?.decision
    if (
      decision !== undefined &&
      !decidedExplicitly &&
      filing.state?.stakes !== "low" &&
      decision !== previousDecision
    ) {
      yield* confirm(updated, decision)
    }
  })

  /** A confirmation's answer adjusts the topic directly; no model needs to run. */
  const settleConfirmation = Effect.fnUntraced(function* (
    topicId: TopicId,
    value: string,
    freeText: boolean,
  ) {
    if (value === "confirm") return
    const topic = yield* store.getTopic(topicId)
    if (Option.isNone(topic)) return
    const { decision: _old, ...rest } = topic.value
    yield* store.upsertTopic(
      freeText
        ? new Topic({ ...topic.value, decision: value })
        : new Topic({ ...rest, status: "unresolved" }),
    )
  })

  return { applyFiling, settleConfirmation }
}
