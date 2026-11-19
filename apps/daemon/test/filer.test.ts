import { DEFAULT_MAIN_MODEL, Topic, TopicId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import { parseFiling } from "../src/conductor/Filer.ts"

const topic = (id: string, title: string) =>
  new Topic({
    id: TopicId.make(id),
    title,
    status: "live",
    stakes: "low",
    summary: "",
    sourceMessageIds: [],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: DateTime.makeUnsafe(0),
  })

const candidates = [topic("t0", "Conversation"), topic("t1", "Kitchen")]

describe("parseFiling", () => {
  it("keeps the current topic and picks up a title", () => {
    expect(parseFiling('{"topic":"T0","title":"Weekend plans"}', candidates)).toEqual({
      placement: { _tag: "Same", title: "Weekend plans" },
    })
  })

  it("files into an existing topic by label", () => {
    expect(parseFiling('Sure: {"topic": "T1"}', candidates).placement).toEqual({
      _tag: "Existing",
      topicId: "t1",
    })
  })

  it("creates a new topic only with a title", () => {
    expect(parseFiling('{"topic":"new","title":"Taxes"}', candidates).placement).toEqual({
      _tag: "New",
      title: "Taxes",
    })
    expect(parseFiling('{"topic":"new","summary":"x"}', candidates)).toEqual({
      placement: { _tag: "Same" },
    })
  })

  it("reads where the topic stands: resolved, summary, decision, stakes", () => {
    const filing = parseFiling(
      '{"topic":"T1","resolved":true,"summary":"Booked Hale & Co.","decision":"Hire Hale & Co.","stakes":"costly"}',
      candidates,
    )
    expect(filing.state).toEqual({
      resolved: true,
      summary: "Booked Hale & Co.",
      decision: "Hire Hale & Co.",
      stakes: "costly",
    })
  })

  it("defaults unknown stakes to low and treats a missing resolved as open", () => {
    const filing = parseFiling(
      '{"topic":"T0","summary":"Still deciding","stakes":"huge"}',
      candidates,
    )
    expect(filing.state).toEqual({ resolved: false, summary: "Still deciding", stakes: "low" })
  })

  it("falls back to the current topic on anything unexpected", () => {
    expect(parseFiling("I think it's about the kitchen", candidates)).toEqual({
      placement: { _tag: "Same" },
    })
    expect(parseFiling('{"topic":"T9"}', candidates)).toEqual({ placement: { _tag: "Same" } })
  })
})
