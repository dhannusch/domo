import type { ComponentId, MessageId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DatabaseTest } from "../src/store/Database.ts"
import { Telemetry } from "../src/telemetry/Telemetry.ts"

const TestLayer = Telemetry.layer.pipe(Layer.provide(DatabaseTest))

describe("Telemetry", () => {
  it.effect("records friction events and counts them by tag", () =>
    Effect.gen(function* () {
      const telemetry = yield* Telemetry
      const messageId = "m1" as MessageId
      yield* telemetry.record({ _tag: "MoreExpanded", messageId })
      yield* telemetry.record({ _tag: "MoreExpanded", messageId })
      yield* telemetry.record({
        _tag: "ChoiceAnswered",
        componentId: "c1" as ComponentId,
        freeText: true,
        latencyMs: 1200,
      })
      const counts = yield* telemetry.countsByTag
      expect(counts.get("MoreExpanded")).toBe(2)
      expect(counts.get("ChoiceAnswered")).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )
})
