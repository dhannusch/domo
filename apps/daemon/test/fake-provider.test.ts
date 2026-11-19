import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, type RunId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { layerScripted, loadFixture } from "../src/providers/FakeProvider.ts"
import { Providers } from "../src/providers/Providers.ts"

const request = { runId: "r1" as RunId, model: DEFAULT_MAIN_MODEL, prompt: "hi" }

describe("FakeProvider", () => {
  it.effect("replays a recorded fixture with the request's runId", () =>
    Effect.gen(function* () {
      const fixture = yield* loadFixture(join(import.meta.dirname, "fixtures/hello.jsonl"))
      const events = yield* Effect.gen(function* () {
        const providers = yield* Providers
        return yield* Stream.runCollect(providers.run(request))
      }).pipe(Effect.provide(layerScripted([fixture])))
      expect(events.map((e) => e._tag)).toEqual(["RunStarted", "TextDelta", "RunCompleted"])
      expect(events.every((e) => e.runId === "r1")).toBe(true)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.effect("fails with ProviderError when the script is exhausted", () =>
    Effect.gen(function* () {
      const providers = yield* Providers
      const error = yield* Effect.flip(Stream.runCollect(providers.run(request)))
      expect(error._tag).toBe("ProviderError")
    }).pipe(Effect.provide(layerScripted([]))),
  )
})

describe("recorded live fixtures", () => {
  it.effect("the Codex smoke-test recording replays as a complete run", () =>
    Effect.gen(function* () {
      const fixture = yield* loadFixture(join(import.meta.dirname, "fixtures/live-codex.jsonl"))
      expect(fixture.map((e) => e._tag)).toEqual(["RunStarted", "TextDelta", "RunCompleted"])
      expect(fixture.at(-1)).toMatchObject({ _tag: "RunCompleted", text: "domo online" })
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.effect("the Claude smoke-test recording streams deltas and completes", () =>
    Effect.gen(function* () {
      const fixture = yield* loadFixture(join(import.meta.dirname, "fixtures/live-claude.jsonl"))
      expect(fixture[0]?._tag).toBe("RunStarted")
      const text = fixture.flatMap((e) => (e._tag === "TextDelta" ? [e.text] : [])).join("")
      expect(text).toBe("domo online")
      expect(fixture.at(-1)).toMatchObject({ _tag: "RunCompleted", text: "domo online" })
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})
