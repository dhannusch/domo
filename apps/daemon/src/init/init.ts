import { join } from "node:path"
import { Effect, FileSystem, Option } from "effect"
import type { PlatformError } from "effect/PlatformError"
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
/** Every file under a directory, as paths relative to it. */
const listFiles = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  dir: string,
): Effect.fn.Return<ReadonlyArray<string>, PlatformError> {
  const out: Array<string> = []
  for (const entry of yield* fs.readDirectory(dir)) {
    const path = join(dir, entry)
    if ((yield* fs.stat(path)).type === "Directory")
      for (const inner of yield* listFiles(fs, path)) out.push(join(entry, inner))
    else out.push(entry)
  }
  return out
})

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
    if (!hasGit) continue
    // Refresh the whole skill (references, scripts, templates too) when anything in the seed
    // changed, but only while nothing but seeding has touched it.
    const seedDir = join(REPO_ROOT, "skills", skill)
    const files = yield* listFiles(fs, seedDir)
    let changed = false
    for (const file of files) {
      const seed = yield* fs.readFile(join(seedDir, file))
      const home = yield* fs.readFile(join(target, file)).pipe(Effect.option)
      if (Option.isNone(home) || Buffer.compare(Buffer.from(seed), Buffer.from(home.value)) !== 0)
        changed = true
    }
    if (!changed) continue
    const history = yield* git(["log", "--format=%s", "--", `skills/${skill}`]).pipe(
      Effect.orElseSucceed(() => "edited"),
    )
    const onlySeeded = history
      .split("\n")
      .filter((line) => line.length > 0)
      .every((line) => line.startsWith("chore: "))
    if (onlySeeded) {
      yield* fs.copy(seedDir, target, { overwrite: true })
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
