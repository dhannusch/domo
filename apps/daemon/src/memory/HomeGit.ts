import { join } from "node:path"
import { Context, Effect, FileSystem, Layer, Option } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { DomoConfig } from "../config/DomoConfig.ts"

/**
 * ~/.domo is a git repo, so every change the agent makes to itself (memory,
 * profile, skills) is a commit and can be undone. Committing never fails the
 * caller: a missing repo or "nothing to commit" is fine.
 */
export class HomeGit extends Context.Service<
  HomeGit,
  {
    commit(message: string): Effect.Effect<void>
    /** Commits and returns the new commit's hash (none if no repo). */
    commitHash(message: string): Effect.Effect<Option.Option<string>>
    /** Undoes one commit with a new revert commit. */
    revert(hash: string): Effect.Effect<boolean>
  }
>()("domo/memory/HomeGit") {
  static readonly layer = Layer.effect(
    HomeGit,
    Effect.gen(function* () {
      const { home } = yield* DomoConfig
      const fs = yield* FileSystem.FileSystem
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const git = (args: Array<string>) =>
        spawner.string(
          ChildProcess.make(
            "git",
            ["-c", "user.name=Domo", "-c", "user.email=domo@localhost", ...args],
            {
              cwd: home,
            },
          ),
        )
      const commit = Effect.fn("HomeGit.commit")(
        function* (message: string) {
          if (!(yield* fs.exists(join(home, ".git")))) return
          yield* git(["add", "-A"])
          const status = yield* git(["status", "--porcelain"])
          if (status.trim().length === 0) return
          yield* git(["commit", "-q", "-m", message])
        },
        Effect.catch((error) => Effect.logWarning("home commit skipped", error)),
      )
      const commitHash = (message: string) =>
        commit(message).pipe(
          Effect.andThen(git(["rev-parse", "HEAD"])),
          Effect.map((out) => Option.some(out.trim())),
          Effect.orElseSucceed(() => Option.none<string>()),
        )
      const revert = (hash: string) =>
        git(["revert", "--no-edit", hash]).pipe(
          Effect.as(true),
          Effect.catch((error) => Effect.logWarning("revert failed", error).pipe(Effect.as(false))),
        )
      return HomeGit.of({ commit, commitHash, revert })
    }),
  )

  static readonly layerNoop = Layer.succeed(
    HomeGit,
    HomeGit.of({
      commit: () => Effect.void,
      commitHash: () => Effect.succeed(Option.some("noop")),
      revert: () => Effect.succeed(true),
    }),
  )
}
