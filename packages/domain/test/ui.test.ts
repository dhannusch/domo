import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { parseModelRef, UiComponent } from "../src/index.ts"

const decode = Schema.decodeUnknownSync(UiComponent)

describe("UiComponent", () => {
  it("accepts a valid Choice", () => {
    const choice = decode({
      _tag: "Choice",
      id: "c1",
      question: "Which contractor?",
      options: [
        { value: "hale", label: "Hale & Co." },
        { value: "birch", label: "Birch Build" },
      ],
      reversible: true,
      recommended: "hale",
    })
    expect(choice._tag).toBe("Choice")
  })

  it("rejects a Choice with more than four options (density cap)", () => {
    const options = ["a", "b", "c", "d", "e"].map((value) => ({ value, label: value }))
    expect(() =>
      decode({ _tag: "Choice", id: "c1", question: "Pick", options, reversible: true }),
    ).toThrow()
  })

  it("rejects a Comparison with five attributes (density cap)", () => {
    expect(() =>
      decode({
        _tag: "Comparison",
        id: "c2",
        attributes: ["a", "b", "c", "d", "e"],
        rows: [
          { option: "x", values: [] },
          { option: "y", values: [] },
        ],
      }),
    ).toThrow()
  })
})

describe("parseModelRef", () => {
  it.effect("parses provider:id", () =>
    Effect.gen(function* () {
      const ref = yield* parseModelRef("codex:gpt-5.5-codex")
      expect(ref.key).toBe("codex:gpt-5.5-codex")
    }),
  )

  it.effect("rejects unknown providers", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseModelRef("gemini:x"))
      expect(error._tag).toBe("InvalidModelRef")
    }),
  )
})
