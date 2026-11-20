import { ModelRef } from "@domo/domain"
import { describe, expect, it } from "vitest"
import { failureText } from "../src/conductor/failure.ts"

const opus = new ModelRef({ provider: "claude", id: "claude-opus-5-5" })

describe("failureText", () => {
  it("turns a usage limit into plain words with a way forward", () => {
    expect(
      failureText(
        "Claude Code returned an error result: You've hit your 5-hour limit · resets 3pm (America/Chicago)",
        opus,
      ),
    ).toBe(
      `I've hit your Claude usage limit until 3pm. Say "try again" after that, or start a message with @codex to carry on now.`,
    )
  })

  it("leaves other errors as they are", () => {
    expect(failureText("network down", opus)).toBe("network down")
  })
})
