import { Effect, Schema } from "effect"

export const Provider = Schema.Literals(["claude", "codex"])
export type Provider = typeof Provider.Type

/** A model from either provider, written as `provider:id` (e.g. `claude:claude-opus-5-5`). */
export class ModelRef extends Schema.Class<ModelRef>("domo/domain/ModelRef")({
  provider: Provider,
  id: Schema.NonEmptyString,
}) {
  get key(): string {
    return `${this.provider}:${this.id}`
  }
}

export class InvalidModelRef extends Schema.TaggedError<InvalidModelRef>()("InvalidModelRef", {
  input: Schema.String,
}) {}

export const parseModelRef = Effect.fnUntraced(function* (
  input: string,
): Effect.fn.Return<ModelRef, InvalidModelRef> {
  const separator = input.indexOf(":")
  const provider = input.slice(0, separator)
  const id = input.slice(separator + 1)
  if (separator <= 0 || id.length === 0 || (provider !== "claude" && provider !== "codex")) {
    return yield* new InvalidModelRef({ input })
  }
  return new ModelRef({ provider, id })
})

export const DEFAULT_MAIN_MODEL = new ModelRef({ provider: "claude", id: "claude-opus-5-5" })
