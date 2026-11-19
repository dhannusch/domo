import { Effect, Option, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export class UpdateFailed extends Schema.TaggedError<UpdateFailed>()("UpdateFailed", {
  step: Schema.String,
  detail: Schema.String,
}) {}

export interface Step {
  readonly name: string
  readonly command: string
  readonly args: ReadonlyArray<string>
}

export interface UpdateOptions {
  /** The checkout the daemon runs from. */
  readonly repo: string
  /** Only report what's waiting; change nothing. */
  readonly checkOnly: boolean
  /** What makes the new code runnable (install, build), in order. */
  readonly steps: ReadonlyArray<Step>
  /** Restarts the daemon and confirms the new one is healthy; none when it isn't managed by launchd. */
  readonly restart: Option.Option<Effect.Effect<void, UpdateFailed>>
}

export type UpdateOutcome =
  | { readonly _tag: "UpToDate" }
  | { readonly _tag: "Available"; readonly changes: ReadonlyArray<string> }
  | {
      readonly _tag: "Updated"
      readonly from: string
      readonly to: string
      readonly changes: ReadonlyArray<string>
      readonly restarted: boolean
    }

/** Runs a command, returning its combined output and whether it exited 0. */
const exec = Effect.fnUntraced(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(ChildProcess.make(command, [...args], { cwd }))
      const [output, code] = yield* Effect.all(
        [handle.all.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
        { concurrency: 2 },
      )
      return { output: output.trim(), ok: code === 0 }
    }),
  ).pipe(Effect.catch((error) => Effect.succeed({ output: String(error), ok: false })))
})

/** The last few lines of a failing step: enough to see why, short enough to read on a phone. */
const tail = (output: string) => output.split("\n").slice(-12).join("\n")

/**
 * Brings this checkout up to date with its upstream branch and restarts Domo,
 * or rolls back to where it was. It refuses to touch local edits or local
 * commits: the host's checkout should only ever move forward from GitHub.
 */
export const update = Effect.fn("update")(function* (options: UpdateOptions) {
  const run = (step: string, command: string, args: ReadonlyArray<string>) =>
    exec(options.repo, command, args).pipe(
      Effect.flatMap(({ output, ok }) =>
        ok ? Effect.succeed(output) : Effect.fail(new UpdateFailed({ step, detail: tail(output) })),
      ),
    )
  const git = (step: string, ...args: Array<string>) => run(step, "git", args)

  yield* git("fetch", "fetch", "--quiet")
  const log = yield* git("fetch", "log", "--format=%s", "HEAD..@{upstream}")
  const changes = log.split("\n").filter((line) => line.length > 0)
  if (changes.length === 0) return { _tag: "UpToDate" } satisfies UpdateOutcome
  if (options.checkOnly) return { _tag: "Available", changes } satisfies UpdateOutcome

  const dirty = yield* git("check", "status", "--porcelain", "--untracked-files=no")
  if (dirty.length > 0)
    return yield* new UpdateFailed({
      step: "check",
      detail: "This checkout has local changes. Commit, stash or discard them, then update again.",
    })

  const from = yield* git("check", "rev-parse", "--short", "HEAD")
  yield* git("merge", "merge", "--ff-only", "@{upstream}").pipe(
    Effect.mapError(
      () =>
        new UpdateFailed({
          step: "merge",
          detail:
            "This checkout has commits GitHub doesn't, so it can't simply move forward. Nothing was changed.",
        }),
    ),
  )
  const to = yield* git("merge", "rev-parse", "--short", "HEAD")

  const apply = Effect.gen(function* () {
    for (const step of options.steps) yield* run(step.name, step.command, step.args)
    if (Option.isSome(options.restart)) yield* options.restart.value
  })

  // Anything failing after the merge puts the previous version back, built and running.
  yield* apply.pipe(
    Effect.catch((failure) =>
      git("rollback", "reset", "--hard", from).pipe(
        Effect.andThen(apply.pipe(Effect.ignore)),
        Effect.andThen(
          Effect.fail(
            new UpdateFailed({
              step: failure.step,
              detail: `${failure.detail}\n\nRolled back to ${from}; the previous version is running.`,
            }),
          ),
        ),
      ),
    ),
  )
  return {
    _tag: "Updated",
    from,
    to,
    changes,
    restarted: Option.isSome(options.restart),
  } satisfies UpdateOutcome
})
