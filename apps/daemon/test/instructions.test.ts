import { describe, expect, it } from "@effect/vitest"
import { INSTRUCTIONS_TEMPLATE, instructionsForPrompt } from "../src/instructions/Instructions.ts"

describe("domo.md", () => {
  it("adds nothing to the prompt while it's still the template", () => {
    expect(instructionsForPrompt(INSTRUCTIONS_TEMPLATE)).toBe("")
  })

  it("passes the user's words, without comments, as instructions that take precedence", () => {
    const prompt = instructionsForPrompt(
      `${INSTRUCTIONS_TEMPLATE}\nBe blunt. No emoji.\n<!-- note to self -->`,
    )
    expect(prompt).toContain("Be blunt. No emoji.")
    expect(prompt).toContain("take precedence")
    expect(prompt).not.toContain("note to self")
    expect(prompt).not.toContain("Domo reads this before")
  })
})
