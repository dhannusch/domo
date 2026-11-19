import { join } from "node:path"
import { Effect, FileSystem } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { DomoConfig } from "../config/DomoConfig.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

/**
 * Seeds the agent home: constitution (human-owned) and seed skills (agent-owned
 * from here on), then makes the home a git repo so every self-modification is
 * a reversible commit. Idempotent: never overwrites existing files.
 */
export const initHome = Effect.fn("initHome")(function* () {
  const config = yield* DomoConfig
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const created: Array<string> = []

  yield* fs.makeDirectory(join(config.home, "skills"), { recursive: true })
  yield* fs.makeDirectory(join(config.home, "memory"), { recursive: true })
  yield* fs.makeDirectory(join(config.home, "lab"), { recursive: true })

  const constitutionTarget = join(config.home, "constitution.md")
  if (!(yield* fs.exists(constitutionTarget))) {
    yield* fs.copyFile(join(REPO_ROOT, "constitution.md"), constitutionTarget)
    created.push("constitution.md")
  }

  const seedSkills = yield* fs.readDirectory(join(REPO_ROOT, "skills"))
  for (const skill of seedSkills) {
    const target = join(config.home, "skills", skill)
    if (!(yield* fs.exists(target))) {
      yield* fs.copy(join(REPO_ROOT, "skills", skill), target)
      created.push(`skills/${skill}`)
    }
  }

  if (!(yield* fs.exists(join(config.home, ".git")))) {
    const git = (args: Array<string>) =>
      spawner.string(ChildProcess.make("git", args, { cwd: config.home }))
    yield* git(["init", "-q", "-b", "main"])
    yield* fs.writeFileString(join(config.home, ".gitignore"), "domo.db*\n")
    yield* git(["add", "-A"])
    yield* git(["commit", "-q", "-m", "chore: initialize domo home"])
    created.push(".git")
  }

  return created
})
