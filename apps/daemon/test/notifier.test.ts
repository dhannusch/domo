import { ComponentId, Message, MessageId, TopicId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { preview, replyNote } from "../src/notify/Notifier.ts"

const reply = (fields: Partial<ConstructorParameters<typeof Message>[0]> = {}) =>
  new Message({
    id: MessageId.make("m1"),
    topicId: TopicId.make("t1"),
    role: "agent",
    status: "done",
    text: "## Plan\n\nThe **short** answer: yes. [Details](https://x.test) follow.",
    createdAt: DateTime.makeUnsafe(0),
    ...fields,
  })

describe("replyNote", () => {
  it("notifies a finished reply as plain text when the user wants replies", () => {
    expect(replyNote(reply(), "all")).toEqual(
      Option.some({
        title: "Domo replied",
        body: "Plan The short answer: yes. Details follow.",
        tag: "m1",
      }),
    )
  })

  it("only notifies open questions under 'needed', and nothing under 'off'", () => {
    expect(replyNote(reply(), "needed")).toEqual(Option.none())
    const asking = reply({
      component: {
        _tag: "Questions",
        id: ComponentId.make("c1"),
        questions: [{ question: "Who reads it?" }, { question: "How often?" }],
      },
    })
    expect(Option.map(replyNote(asking, "needed"), (n) => n.title)).toEqual(
      Option.some("Domo needs you"),
    )
    expect(replyNote(asking, "off")).toEqual(Option.none())
  })

  it("never notifies a reply still being written or waiting its turn", () => {
    expect(replyNote(reply({ status: "streaming" }), "all")).toEqual(Option.none())
    expect(replyNote(reply({ status: "queued" }), "all")).toEqual(Option.none())
  })

  it("keeps previews short", () => {
    expect(preview("word ".repeat(100)).length).toBeLessThanOrEqual(140)
  })
})
