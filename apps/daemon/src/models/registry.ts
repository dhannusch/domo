import { type ModelOption, ModelRef } from "@domo/domain"

/**
 * Known models. Domo chooses the model (orchestration, Phase 4); the user never
 * has to. A leading `@alias` is a hidden developer override for testing routing
 * and is not advertised anywhere in the UI.
 */
const ALIASES: ReadonlyArray<{
  readonly alias: string
  readonly label: string
  readonly model: ModelRef
}> = [
  {
    alias: "opus",
    label: "Claude Opus 5.5",
    model: new ModelRef({ provider: "claude", id: "claude-opus-5-5" }),
  },
  {
    alias: "sonnet",
    label: "Claude Sonnet 5.5",
    model: new ModelRef({ provider: "claude", id: "claude-sonnet-5-5" }),
  },
  {
    alias: "haiku",
    label: "Claude Haiku 5.5",
    model: new ModelRef({ provider: "claude", id: "claude-haiku-5-5" }),
  },
  {
    alias: "fable",
    label: "Claude Fable 5.2",
    model: new ModelRef({ provider: "claude", id: "claude-fable-5-2" }),
  },
  {
    alias: "codex",
    label: "Codex (default model)",
    model: new ModelRef({ provider: "codex", id: "default" }),
  },
  {
    // Codex's "fast and affordable" tier on a ChatGPT login (gpt-*-mini models aren't offered there).
    alias: "luna",
    label: "Codex Luna",
    model: new ModelRef({ provider: "codex", id: "gpt-6-luna" }),
  },
]

export const modelOptions: ReadonlyArray<ModelOption> = ALIASES.map(({ alias, label }) => ({
  key: alias,
  label,
}))

export const labelFor = (model: ModelRef): string =>
  ALIASES.find((entry) => entry.model.key === model.key)?.label ?? model.key

/** A leading `@alias` switches the model for this topic and is stripped from the text. */
export const parseMention = (
  text: string,
): { readonly model?: ModelRef; readonly text: string } => {
  const match = /^@([a-z0-9-]+)\s+/i.exec(text)
  const alias = match?.[1]?.toLowerCase()
  const entry = ALIASES.find((candidate) => candidate.alias === alias)
  return match === null || entry === undefined
    ? { text }
    : { model: entry.model, text: text.slice(match[0].length) }
}

/** A model named by alias ("codex", "sonnet") or as provider:id; undefined if unknown. */
export const resolveModel = (name: string): ModelRef | undefined => {
  const trimmed = name.trim().toLowerCase()
  const alias = ALIASES.find((entry) => entry.alias === trimmed || entry.model.key === trimmed)
  if (alias !== undefined) return alias.model
  const [provider, ...rest] = name.trim().split(":")
  const id = rest.join(":")
  return (provider === "claude" || provider === "codex") && id.length > 0
    ? new ModelRef({ provider, id })
    : undefined
}

export const MODEL_ALIASES = ALIASES.map((entry) => entry.alias)
