import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { type Step, update } from "../src/update/update.ts"

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}
const git = (cwd: string, ...args: Array<string>) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim()

/** A GitHub stand-in (bare repo), a developer clone that pushes, and the host clone that updates. */
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "domo-update-"))
  const remote = join(root, "remote.git")
  execFileSync("git", ["init", "--bare", "-q", "-b", "main", remote])
  const dev = join(root, "dev")
  git(root, "clone", "-q", remote, dev)
  writeFileSync(join(dev, "a.txt"), "one\n")
  git(dev, "add", "-A")
  git(dev, "commit", "-q", "-m", "first")
  git(dev, "push", "-q", "origin", "HEAD:main")
  const host = join(root, "host")
  git(root, "clone", "-q", remote, host)
  const ship = (file: string, message: string) => {
    writeFileSync(join(dev, file), `${message}\n`)
    git(dev, "add", "-A")
    git(dev, "commit", "-q", "-m", message)
    git(dev, "push", "-q", "origin", "HEAD:main")
  }
  return { host, ship }
}

const ok: Step = { name: "build", command: "true", args: [] }
const broken: Step = { name: "build", command: "false", args: [] }
const options = (repo: string, steps: ReadonlyArray<Step>, checkOnly = false) => ({
  repo,
  checkOnly,
  steps,
  restart: Option.none(),
})

describe("domo update", () => {
  it.live("reports, applies, and rolls back a failed build", () =>
    Effect.gen(function* () {
      const { host, ship } = setup()
      expect((yield* update(options(host, [ok])))._tag).toBe("UpToDate")

      ship("b.txt", "feat: settings sheet")
      const waiting = yield* update(options(host, [ok], true))
      expect(waiting).toEqual({ _tag: "Available", changes: ["feat: settings sheet"] })
      expect(existsSync(join(host, "b.txt"))).toBe(false)

      const done = yield* update(options(host, [ok]))
      expect(done._tag).toBe("Updated")
      expect(existsSync(join(host, "b.txt"))).toBe(true)

      ship("c.txt", "feat: broken build")
      const before = git(host, "rev-parse", "HEAD")
      const failed = yield* Effect.flip(update(options(host, [broken])))
      expect(failed.step).toBe("build")
      expect(failed.detail).toContain("Rolled back")
      expect(git(host, "rev-parse", "HEAD")).toBe(before)
      expect(existsSync(join(host, "c.txt"))).toBe(false)
    }).pipe(Effect.provide(NodeServices.layer)),
  )

  it.live("refuses to touch local edits", () =>
    Effect.gen(function* () {
      const { host, ship } = setup()
      ship("b.txt", "feat: something")
      writeFileSync(join(host, "a.txt"), "edited on the host\n")
      const refused = yield* Effect.flip(update(options(host, [ok])))
      expect(refused.step).toBe("check")
      expect(existsSync(join(host, "b.txt"))).toBe(false)
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})
