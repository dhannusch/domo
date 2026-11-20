import type { ModelRef } from "@domo/domain"

const LIMIT = /hit your [^·\n]*limit(?:[^·\n]*·\s*resets ([^(\n]+))?/i
const OTHER = { claude: "@codex", codex: "@opus" } as const
const SIGNED_OUT = /\b401\b|invalid_jwt|refresh token|not logged in|please (log|sign) ?in/i
const SIGN_IN = { claude: "claude auth login", codex: "codex logout && codex login" } as const

/**
 * What a failed reply says. A usage limit is the common case, so it gets plain words and a way
 * forward instead of the provider's raw error.
 */
export const failureText = (raw: string, model: ModelRef): string => {
  const name = model.provider === "claude" ? "Claude" : "Codex"
  if (SIGNED_OUT.test(raw))
    return (
      `${name}'s sign-in on the computer running Domo has expired. Sign in again there ` +
      `(\`${SIGN_IN[model.provider]}\`), or start a message with ${OTHER[model.provider]} to carry on now.`
    )
  const limit = LIMIT.exec(raw)
  if (limit === null) return raw
  const resets = limit[1]?.trim()
  return (
    `I've hit your ${name} usage limit${resets === undefined ? "" : ` until ${resets}`}. ` +
    `Say "try again" after that, or start a message with ${OTHER[model.provider]} to carry on now.`
  )
}
