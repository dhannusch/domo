import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
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

  it.effect("refreshes a seed skill nobody edited, and leaves an edited one alone", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const home = yield* fs.makeTempDirectoryScoped()
      const config = DomoConfig.layerFrom({ home, port: 0 })
      const git = (...args: Array<string>) =>
        spawner.string(
          ChildProcess.make("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
            cwd: home,
          }),
        )
      yield* initHome().pipe(Effect.provide(config))
      const stale = join(home, "skills", "getting-to-know-you", "SKILL.md")
      const edited = join(home, "skills", "orchestration", "SKILL.md")
      // An older seed, committed only by seeding.
      yield* fs.writeFileString(stale, "old seed")
      yield* git("commit", "-qam", "chore: seed skills/getting-to-know-you")
      // A skill the Lab improved.
      yield* fs.writeFileString(edited, "lab version")
      yield* git("commit", "-qam", "lab: orchestration: shorter")

      // A seed file added to an untouched skill (a new reference) arrives too.
      const craft = join(home, "skills", "brand-identity", "references", "craft.md")
      yield* fs.remove(craft)
      yield* git("commit", "-qam", "chore: seed skills/brand-identity")

      const updated = yield* initHome().pipe(Effect.provide(config))
      expect([...updated].sort()).toEqual([
        "skills/brand-identity (updated)",
        "skills/getting-to-know-you (updated)",
      ])
      expect(yield* fs.exists(craft)).toBe(true)
      expect(yield* fs.readFileString(stale)).toContain("# Getting to know you")
      expect(yield* fs.readFileString(edited)).toBe("lab version")
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )
})
