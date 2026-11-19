/**
 * Auth mode for the SDK subprocesses. "subscription" (default) strips API-key
 * variables so the claude/codex CLIs use the user's own logins; "api-key" is
 * the explicit fallback (set DOMO_AUTH=api-key).
 */
export type AuthMode = "subscription" | "api-key"

const API_KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "CODEX_API_KEY",
]

export const subprocessEnv = (mode: AuthMode, base: NodeJS.ProcessEnv): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && (mode === "api-key" || !API_KEY_VARS.includes(key))) env[key] = value
  }
  return env
}
