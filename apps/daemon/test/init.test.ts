import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { initHome } from "../src/init/init.ts"

describe("initHome", () => {
  it.effect("seeds constitution, skills and git, and is idempotent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const home = yield* fs.makeTempDirectoryScoped()
      const config = DomoConfig.layerFrom({ home, port: 0 })

      const first = yield* initHome().pipe(Effect.provide(config))
      expect(first).toContain("constitution.md")
      expect(first).toContain("skills/orchestration")
      expect(yield* fs.exists(join(home, ".git"))).toBe(true)

      const second = yield* initHome().pipe(Effect.provide(config))
      expect(second).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )
})
