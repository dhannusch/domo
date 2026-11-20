import { join } from "node:path"
import { Effect, FileSystem } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { DomoConfig } from "../config/DomoConfig.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

/**
 * Seeds the agent home: constitution (human-owned) and seed skills (agent-owned
 * from here on), then makes the home a git repo so every self-modification is
 * a reversible commit. Idempotent. A seed skill already in the home is refreshed from the repo
 * only while nothing but seeding has ever touched it (its git history is all `chore:` commits),
 * so an improved seed reaches existing installs but never overwrites the agent's or Lab's edits.
 */
export const initHome = Effect.fn("initHome")(function* () {
  const config = yield* DomoConfig
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const created: Array<string> = []
  const git = (args: Array<string>) =>
    spawner.string(ChildProcess.make("git", args, { cwd: config.home }))
  const hasGit = yield* fs.exists(join(config.home, ".git"))

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
      continue
    }
    const seedFile = join(REPO_ROOT, "skills", skill, "SKILL.md")
    const homeFile = join(target, "SKILL.md")
    if (!hasGit || !(yield* fs.exists(seedFile)) || !(yield* fs.exists(homeFile))) continue
    const seed = yield* fs.readFileString(seedFile)
    if (seed === (yield* fs.readFileString(homeFile))) continue
    const history = yield* git(["log", "--format=%s", "--", `skills/${skill}`]).pipe(
      Effect.orElseSucceed(() => "edited"),
    )
    const onlySeeded = history
      .split("\n")
      .filter((line) => line.length > 0)
      .every((line) => line.startsWith("chore: "))
    if (onlySeeded) {
      yield* fs.writeFileString(homeFile, seed)
      created.push(`skills/${skill} (updated)`)
    }
  }

  if (!hasGit) {
    yield* git(["init", "-q", "-b", "main"])
    yield* fs.writeFileString(join(config.home, ".gitignore"), "domo.db*\n")
    yield* git(["add", "-A"])
    yield* git(["commit", "-q", "-m", "chore: initialize domo home"])
    created.push(".git")
  }

  return created
})
