import type { ModelRef } from "@domo/domain"

const LIMIT = /hit your [^·\n]*limit(?:[^·\n]*·\s*resets ([^(\n]+))?/i
const OTHER = { claude: "@codex", codex: "@opus" } as const

/**
 * What a failed reply says. A usage limit is the common case, so it gets plain words and a way
 * forward instead of the provider's raw error.
 */
export const failureText = (raw: string, model: ModelRef): string => {
  const limit = LIMIT.exec(raw)
  if (limit === null) return raw
  const name = model.provider === "claude" ? "Claude" : "Codex"
  const resets = limit[1]?.trim()
  return (
    `I've hit your ${name} usage limit${resets === undefined ? "" : ` until ${resets}`}. ` +
    `Say "try again" after that, or start a message with ${OTHER[model.provider]} to carry on now.`
  )
}
