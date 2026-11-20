import { join } from "node:path"
import { ModelRef } from "@domo/domain"
import { Effect, FileSystem, Option, Schema, String as Str } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { DomoConfig } from "../config/DomoConfig.ts"
import { runModel } from "../mcp/orchestration.ts"
import { subprocessEnv } from "../providers/auth.ts"
import { Providers } from "../providers/Providers.ts"

export interface CheckResult {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

const TAILSCALE_APP = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"

/** Runs a command; success means exit code 0. Output (trimmed) becomes the detail. */
const command = Effect.fnUntraced(function* (name: string, cmd: string, args: Array<string>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* spawner.string(ChildProcess.make(cmd, args)).pipe(
    Effect.map((out): CheckResult => {
      const firstLine = Str.trim(out).split("\n")[0] ?? ""
      return { name, ok: true, detail: firstLine.length > 0 ? firstLine : "ok" }
    }),
    Effect.catch((error) =>
      Effect.succeed<CheckResult>({ name, ok: false, detail: error.message }),
    ),
  )
})

const ClaudeAuthStatus = Schema.fromJsonString(
  Schema.Struct({ loggedIn: Schema.Boolean, authMethod: Schema.String }),
)

/** Checks the claude.ai login the daemon will actually use (API-key env vars stripped). */
const claudeLogin = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const config = yield* DomoConfig
  const name = "claude login"
  const out = yield* spawner
    .string(
      ChildProcess.make("claude", ["auth", "status"], {
        env: subprocessEnv(config.auth, process.env),
        extendEnv: false,
      }),
    )
    .pipe(Effect.orElseSucceed(() => ""))
  const status = Schema.decodeUnknownOption(ClaudeAuthStatus)(out)
  if (Option.isNone(status))
    return { name, ok: false, detail: "could not read `claude auth status`" }
  return status.value.loggedIn
    ? { name, ok: true, detail: status.value.authMethod }
    : { name, ok: false, detail: "not logged in — run `claude auth login`" }
})

/** The cheapest model on each side; enough to prove the login actually works. */
export const PROBES = [
  {
    name: "claude works",
    model: new ModelRef({ provider: "claude", id: "claude-haiku-5-5" }),
    fix: "run `claude auth login`",
  },
  {
    name: "codex works",
    model: new ModelRef({ provider: "codex", id: "default" }),
    fix: "run `codex logout`, then `codex login`",
  },
] as const

const firstLine = (text: string) => (Str.trim(text).split("\n")[0] ?? "").slice(0, 160)

/**
 * Sends one tiny request through the same path Domo uses. The CLIs' own status commands only
 * read the saved login, so an expired or revoked one still looks signed in there.
 */
export const liveCheck = Effect.fn("doctor.liveCheck")(function* (probe: (typeof PROBES)[number]) {
  const providers = yield* Providers
  const result = yield* runModel(providers, probe.model, "Reply with OK.", {
    mode: "utility",
    systemPrompt: "Reply with exactly: OK",
  }).pipe(
    Effect.timeoutOption("90 seconds"),
    Effect.map(Option.getOrElse(() => ({ ok: false, text: "no answer within 90 seconds" }))),
  )
  return result.ok
    ? { name: probe.name, ok: true, detail: "answered a test request" }
    : { name: probe.name, ok: false, detail: `${firstLine(result.text)} — ${probe.fix}` }
})

const TailscaleStatus = Schema.fromJsonString(Schema.Struct({ BackendState: Schema.String }))

/** The phone reaches domo over the tailnet, so Tailscale must be running and signed in. */
const tailscale = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const name = "tailscale"
  const out = yield* spawner
    .string(ChildProcess.make(TAILSCALE_APP, ["status", "--json"]))
    .pipe(Effect.orElseSucceed(() => ""))
  const status = Schema.decodeUnknownOption(TailscaleStatus)(out)
  if (Option.isNone(status))
    return { name, ok: false, detail: "Tailscale not found or not responding" }
  return status.value.BackendState === "Running"
    ? { name, ok: true, detail: "running" }
    : { name, ok: false, detail: `${status.value.BackendState} — open Tailscale and sign in` }
})

const nodeVersion = Effect.sync((): CheckResult => {
  const major = Number(process.versions.node.split(".")[0])
  return { name: "node >= 24", ok: major >= 24, detail: process.versions.node }
})

const homeWritable = Effect.gen(function* () {
  const config = yield* DomoConfig
  const fs = yield* FileSystem.FileSystem
  const probe = join(config.home, ".doctor-probe")
  return yield* fs.makeDirectory(config.home, { recursive: true }).pipe(
    Effect.andThen(fs.writeFileString(probe, "ok")),
    Effect.andThen(fs.remove(probe)),
    Effect.as<CheckResult>({ name: "home writable", ok: true, detail: config.home }),
    Effect.catch((error) =>
      Effect.succeed<CheckResult>({ name: "home writable", ok: false, detail: error.message }),
    ),
  )
})

const constitution = Effect.gen(function* () {
  const config = yield* DomoConfig
  const fs = yield* FileSystem.FileSystem
  const path = join(config.home, "constitution.md")
  const ok = yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false))
  return { name: "constitution", ok, detail: ok ? path : "missing — run `domo init`" }
})

/** Every precondition for running domo on this machine, including a real request to each side. */
export const runDoctor = Effect.fn("runDoctor")(function* () {
  return yield* Effect.all(
    [
      nodeVersion,
      command("claude CLI", "claude", ["--version"]),
      claudeLogin,
      command("codex CLI", "codex", ["--version"]),
      command("codex login", "codex", ["login", "status"]),
      ...PROBES.map(liveCheck),
      tailscale,
      homeWritable,
      constitution,
    ],
    { concurrency: "unbounded" },
  )
})
