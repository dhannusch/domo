import { RunId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { liveCheck, PROBES } from "../src/doctor/doctor.ts"
import { layerScripted } from "../src/providers/FakeProvider.ts"

const runId = RunId.make("doctor")
const codex = PROBES[1]

describe("doctor live checks", () => {
  it.effect("an expired login fails, with the fix, even though the CLI says signed in", () =>
    Effect.gen(function* () {
      const result = yield* liveCheck(codex)
      expect(result.ok).toBe(false)
      expect(result.detail).toContain("401 invalid_jwt")
      expect(result.detail).toContain("codex login")
    }).pipe(
      Effect.provide(
        layerScripted([
          [{ _tag: "RunFailed", runId, message: "unexpected status 401 invalid_jwt\nmore" }],
        ]),
      ),
    ),
  )

  it.effect("a working login passes", () =>
    Effect.gen(function* () {
      const result = yield* liveCheck(codex)
      expect(result).toMatchObject({ ok: true, name: "codex works" })
    }).pipe(
      Effect.provide(
        layerScripted([
          [
            { _tag: "TextDelta", runId, text: "OK" },
            {
              _tag: "RunCompleted",
              runId,
              text: "OK",
              usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
            },
          ],
        ]),
      ),
    ),
  )
})
