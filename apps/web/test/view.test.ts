import { type ChatEvent, type Message, MessageId, type TopicId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import { applyEvent, fromHistory } from "../src/chat/view.ts"

const message = (
  id: string,
  role: "user" | "agent",
  status: Message["status"],
  text: string,
): Message =>
  ({
    id: id as MessageId,
    topicId: "t" as TopicId,
    role,
    status,
    text,
    createdAt: DateTime.makeUnsafe(0),
  }) as Message

describe("chat view", () => {
  it("appends messages, streams drafts, and completes in place (no reflow)", () => {
    const events: ReadonlyArray<ChatEvent> = [
      { _tag: "MessageAdded", message: message("u1", "user", "done", "hi") },
      { _tag: "MessageAdded", message: message("a1", "agent", "streaming", "") },
      { _tag: "AgentDelta", messageId: MessageId.make("a1"), text: "Hel" },
      { _tag: "AgentDelta", messageId: MessageId.make("a1"), text: "lo" },
    ]
    const streaming = events.reduce(applyEvent, fromHistory({ messages: [], earlier: 0 }))
    expect(streaming.order).toEqual(["u1", "a1"])
    expect(streaming.drafts.get(MessageId.make("a1"))).toBe("Hello")

    const done = applyEvent(streaming, {
      _tag: "AgentFinished",
      message: message("a1", "agent", "done", "Hello"),
    })
    expect(done.order).toEqual(["u1", "a1"])
    expect(done.drafts.size).toBe(0)
    expect(done.messages.get(MessageId.make("a1"))?.status).toBe("done")
  })

  it("ignores duplicate MessageAdded (history and feed can overlap)", () => {
    const view = fromHistory({ messages: [message("u1", "user", "done", "hi")], earlier: 0 })
    const again = applyEvent(view, {
      _tag: "MessageAdded",
      message: message("u1", "user", "done", "hi"),
    })
    expect(again.order).toEqual(["u1"])
  })
})
