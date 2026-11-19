import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { Settings } from "../src/settings/Settings.ts"
import { DatabaseTest } from "../src/store/Database.ts"

const TestLayer = Settings.layer.pipe(
  Layer.provide(DomoConfig.layerFrom({ home: "/tmp/unused", port: 0, awaySeconds: 600 })),
  Layer.provide(DatabaseTest),
)

describe("Settings", () => {
  it.effect("defaults come from config, and only changes are stored", () =>
    Effect.gen(function* () {
      const settings = yield* Settings
      expect(yield* settings.current).toEqual({
        notifications: "needed",
        awaySeconds: 600,
        lab: true,
        model: "opus",
        backgroundModel: "haiku",
      })
      yield* settings.update({ awaySeconds: 1800 })
      yield* settings.update({ lab: false })
      expect(yield* settings.current).toEqual({
        notifications: "needed",
        awaySeconds: 1800,
        lab: false,
        model: "opus",
        backgroundModel: "haiku",
      })
      expect(yield* settings.awayMs).toBe(1_800_000)
    }).pipe(Effect.provide(TestLayer)),
  )
})
