import type { ChatEvent, History, Message, MessageId } from "@domo/domain"

/**
 * The chat as the page renders it. Events only append or complete messages, so
 * the page never reflows under the reader (UX rubric UX-02).
 */
export interface ChatView {
  readonly order: ReadonlyArray<MessageId>
  readonly messages: ReadonlyMap<MessageId, Message>
  /** Streaming text for agent messages that haven't finished yet. */
  readonly drafts: ReadonlyMap<MessageId, string>
  /** Messages the filer moved to another topic, with that topic's title (shown as a quiet hint). */
  readonly refiled: ReadonlyMap<MessageId, string>
  /** How many topics are folded into "Earlier". */
  readonly earlierCount: number
  /** Live tool activity for replies still being written. */
  readonly progress: ReadonlyMap<MessageId, { readonly tools: number; readonly current: string }>
}

export const fromHistory = ({ messages, earlier }: History): ChatView => ({
  order: messages.map((message) => message.id),
  messages: new Map(messages.map((message) => [message.id, message])),
  earlierCount: earlier,
  drafts: new Map(),
  refiled: new Map(),
  progress: new Map(),
})

export const applyEvent = (view: ChatView, event: ChatEvent): ChatView => {
  switch (event._tag) {
    case "MessageAdded": {
      if (view.messages.has(event.message.id)) return view
      return {
        ...view,
        order: [...view.order, event.message.id],
        messages: new Map(view.messages).set(event.message.id, event.message),
      }
    }
    case "AgentDelta": {
      const drafts = new Map(view.drafts)
      drafts.set(event.messageId, (drafts.get(event.messageId) ?? "") + event.text)
      return { ...view, drafts }
    }
    case "AgentFinished": {
      const drafts = new Map(view.drafts)
      drafts.delete(event.message.id)
      const progress = new Map(view.progress)
      progress.delete(event.message.id)
      const known = view.messages.has(event.message.id)
      return {
        ...view,
        order: known ? view.order : [...view.order, event.message.id],
        messages: new Map(view.messages).set(event.message.id, event.message),
        drafts,
        progress,
      }
    }
    case "MessageUpdated": {
      // In place: a component appeared, was answered or ticked. Never reorders.
      if (!view.messages.has(event.message.id)) return view
      return { ...view, messages: new Map(view.messages).set(event.message.id, event.message) }
    }
    case "WorkProgress":
      return {
        ...view,
        progress: new Map(view.progress).set(event.messageId, {
          tools: event.tools,
          current: event.current,
        }),
      }
    case "MessagesRefiled": {
      const refiled = new Map(view.refiled)
      for (const id of event.messageIds) refiled.set(id, event.topicTitle)
      return { ...view, refiled }
    }
  }
}

/** Items for the "needs you" marker: unanswered Choices and replies busy with tools. */
export const needsYou = (view: ChatView) => {
  const decisions: Array<Message> = []
  const running: Array<Message> = []
  for (const id of view.order) {
    const message = view.messages.get(id)
    if (message === undefined) continue
    if (
      (message.component?._tag === "Choice" || message.component?._tag === "Questions") &&
      message.resolution === undefined &&
      message.status === "done"
    ) {
      decisions.push(message)
    }
    // Running: a reply busy with tools, or a background task (its receipt says "running").
    if (
      message.status === "streaming" &&
      (view.progress.has(id) || message.work?.status === "running")
    ) {
      running.push(message)
    }
  }
  return { decisions, running }
}
