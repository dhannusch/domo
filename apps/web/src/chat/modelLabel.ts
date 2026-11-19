const KNOWN: Record<string, string> = {
  "claude:claude-opus-5-5": "Opus 5.5",
  "claude:claude-sonnet-5-5": "Sonnet 5.5",
  "claude:claude-haiku-5-5": "Haiku 5.5",
  "claude:claude-fable-5-2": "Fable 5.2",
  "codex:default": "Codex",
}

export const modelLabel = (key: string): string => KNOWN[key] ?? key.replace(/^[a-z]+:/, "")
