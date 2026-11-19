import { describe, expect, it } from "@effect/vitest"
import { subprocessEnv } from "../src/providers/auth.ts"

const base = { PATH: "/bin", ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "o", ANTHROPIC_BASE_URL: "u" }

describe("subprocessEnv", () => {
  it("strips provider API keys in subscription mode", () => {
    expect(subprocessEnv("subscription", base)).toEqual({ PATH: "/bin" })
  })

  it("keeps them in api-key mode", () => {
    expect(subprocessEnv("api-key", base)).toEqual(base)
  })
})
