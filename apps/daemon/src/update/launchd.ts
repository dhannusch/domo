import { DateTime, Effect, Option, Schedule, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { UpdateFailed } from "./update.ts"

/** The launchd job scripts/install-launchd.sh creates. */
export const LAUNCHD_LABEL = "com.domo.daemon"

const Health = Schema.fromJsonString(Schema.Struct({ startedAt: Schema.String }))
const decodeHealth = Schema.decodeUnknownEffect(Health)

/** Waits until a daemon started after `since` answers on /health. */
const waitHealthy = (port: number, since: string) =>
  Effect.tryPromise(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.text())).pipe(
    Effect.flatMap(decodeHealth),
    Effect.filterOrFail(
      (health) => health.startedAt > since,
      () => new Error("still the old daemon"),
    ),
    Effect.retry(Schedule.spaced("500 millis")),
    Effect.timeout("60 seconds"),
    Effect.mapError(
      () =>
        new UpdateFailed({
          step: "restart",
          detail:
            "The restarted daemon didn't answer within a minute. Its log is in ~/.domo/logs/daemon.log.",
        }),
    ),
  )

/**
 * How to restart Domo after an update: through launchd when it runs there
 * (the host setup), otherwise none, and the caller says to restart by hand.
 */
export const launchdRestart = Effect.fn("launchdRestart")(function* (port: number) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const uid = process.getuid?.()
  if (uid === undefined) return Option.none()
  const target = `gui/${uid}/${LAUNCHD_LABEL}`
  const loaded = yield* spawner.exitCode(ChildProcess.make("launchctl", ["print", target])).pipe(
    Effect.map((code) => code === 0),
    Effect.orElseSucceed(() => false),
  )
  if (!loaded) return Option.none()
  const restart = Effect.gen(function* () {
    const since = DateTime.formatIso(yield* DateTime.now)
    const code = yield* spawner
      .exitCode(ChildProcess.make("launchctl", ["kickstart", "-k", target]))
      .pipe(Effect.orElseSucceed(() => 1))
    if (code !== 0)
      return yield* new UpdateFailed({
        step: "restart",
        detail: `launchctl couldn't restart ${target}.`,
      })
    yield* waitHealthy(port, since)
  })
  return Option.some(restart)
})
