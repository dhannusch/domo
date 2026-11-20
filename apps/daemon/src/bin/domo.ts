#!/usr/bin/env node
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL } from "@domo/domain"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { ask } from "../ask/ask.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { runDoctor } from "../doctor/doctor.ts"
import { tailnetHost, tailnetOwner } from "../doctor/tailscale.ts"
import { loadToken } from "../http/access.ts"
import { DaemonLive } from "../http/app.ts"
import { initHome } from "../init/init.ts"
import { ProvidersLive } from "../providers/live.ts"
import { launchdRestart } from "../update/launchd.ts"
import { update } from "../update/update.ts"

const domo = Command.make("domo").pipe(
  Command.withSharedFlags({
    home: Flag.String("home").pipe(
      Flag.withDescription("Agent home (default ~/.domo or $DOMO_HOME)"),
      Flag.optional,
    ),
    port: Flag.Int("port").pipe(Flag.withDescription("Daemon port (default 7420)"), Flag.optional),
  }),
  Command.withDescription("domo — your chief of staff"),
)

/** Flags win over env; lets the Lab start shadow instances with their own home/port. */
const configLayer = Effect.gen(function* () {
  const root = yield* domo
  const base = yield* Effect.provide(
    Effect.gen(function* () {
      return yield* DomoConfig
    }),
    DomoConfig.layer,
  )
  return DomoConfig.layerFrom({
    ...base,
    home: Option.getOrElse(root.home, () => base.home),
    port: Option.getOrElse(root.port, () => base.port),
  })
})

const withConfig = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  configLayer.pipe(Effect.flatMap((layer) => Effect.provide(effect, layer)))

const doctor = Command.make(
  "doctor",
  {},
  Effect.fn(function* () {
    yield* Console.log("Checking (sends one tiny request to Claude and to Codex)…")
    const results = yield* withConfig(runDoctor().pipe(Effect.provide(ProvidersLive)))
    for (const result of results) {
      yield* Console.log(`${result.ok ? "✓" : "✗"} ${result.name.padEnd(16)} ${result.detail}`)
    }
    if (results.some((result) => !result.ok)) {
      yield* Console.log("\nSome checks failed. Fix them before starting the daemon.")
    }
  }),
).pipe(Command.withDescription("Check claude, codex, tailscale and the agent home"))

const init = Command.make(
  "init",
  {},
  Effect.fn(function* () {
    const created = yield* withConfig(initHome())
    yield* Console.log(
      created.length === 0 ? "Home already initialized." : `Created: ${created.join(", ")}`,
    )
  }),
).pipe(Command.withDescription("Seed the agent home (constitution, skills, git)"))

const askCommand = Command.make(
  "ask",
  {
    prompt: Argument.String("prompt").pipe(Argument.withDescription("What to ask")),
    model: Flag.String("model").pipe(
      Flag.withAlias("m"),
      Flag.withDescription("provider:model, e.g. claude:claude-opus-5-5 or codex:default"),
      Flag.withDefault(DEFAULT_MAIN_MODEL.key),
    ),
    cwd: Flag.String("cwd").pipe(Flag.withDescription("Working directory"), Flag.optional),
    resume: Flag.String("resume").pipe(Flag.withDescription("Provider session id"), Flag.optional),
    utility: Flag.String("utility").pipe(
      Flag.withDescription("Run as a single tool-less turn with these instructions"),
      Flag.optional,
    ),
    record: Flag.String("record").pipe(
      Flag.withDescription("Write AgentEvents as a JSONL fixture"),
      Flag.optional,
    ),
  },
  Effect.fn(function* (options) {
    yield* withConfig(ask(options).pipe(Effect.provide(ProvidersLive)))
  }),
).pipe(Command.withDescription("One-shot run against any Claude or Codex model"))

/** Config with the access token settled: `DOMO_TOKEN=off` disables it, unset uses `<home>/token`. */
const resolvedConfig = Effect.gen(function* () {
  const config = yield* withConfig(
    Effect.gen(function* () {
      return yield* DomoConfig
    }),
  )
  const token =
    config.token === "off" ? undefined : (config.token ?? (yield* loadToken(config.home)))
  const trustedLogins = config.trustOwner
    ? [
        ...config.trustedLogins,
        ...(yield* tailnetOwner.pipe(
          Effect.map((login) => [login]),
          Effect.catch((why) =>
            Effect.logWarning(
              `couldn't read this Mac's Tailscale login: ${why}. Run scripts/install-launchd.sh again, or set DOMO_TAILSCALE_USERS.`,
            ).pipe(Effect.as([])),
          ),
        )),
      ]
    : config.trustedLogins
  return { ...config, token, trustedLogins }
})

const pair = Command.make(
  "pair",
  {},
  Effect.fn(function* () {
    const config = yield* resolvedConfig
    if (config.token === undefined)
      return yield* Console.log("The access token is off (DOMO_TOKEN=off).")
    const host = yield* tailnetHost
    yield* Console.log(`On this Mac:  http://127.0.0.1:${config.port}/?token=${config.token}`)
    yield* Console.log(
      Option.match(host, {
        onNone: () => "Phone: run scripts/remote.sh to expose Domo on your tailnet first.",
        onSome: (h) => `Phone:        https://${h}/?token=${config.token}`,
      }),
    )
    yield* Console.log(`Code (if the installed app asks): ${config.token}`)
    if (config.trustedLogins.length > 0)
      yield* Console.log(
        `Devices signed in to Tailscale as ${config.trustedLogins.join(", ")} need none of this: they just open Domo.`,
      )
  }),
).pipe(Command.withDescription("Print the links that unlock Domo on this Mac and your phone"))

/** The checkout this command runs from (the wrapper and launchd both point here). */
const REPO_ROOT = join(import.meta.dirname, "../../../..")

const updateCommand = Command.make(
  "update",
  {
    check: Flag.Boolean("check").pipe(Flag.withDescription("Only show what's new; change nothing")),
  },
  Effect.fn(function* ({ check }) {
    const config = yield* withConfig(
      Effect.gen(function* () {
        return yield* DomoConfig
      }),
    )
    const restart = yield* launchdRestart(config.port)
    yield* Console.log(check ? "Checking GitHub for changes…" : "Updating Domo…")
    const outcome = yield* update({
      repo: REPO_ROOT,
      checkOnly: check,
      steps: [
        { name: "install", command: "bun", args: ["install", "--frozen-lockfile"] },
        { name: "build", command: "bun", args: ["run", "build:web"] },
      ],
      restart,
    }).pipe(
      Effect.catchTag("UpdateFailed", (failure) =>
        Console.log(`✗ Update stopped at "${failure.step}".\n${failure.detail}`).pipe(
          Effect.andThen(Effect.sync(() => (process.exitCode = 1))),
          Effect.as(undefined),
        ),
      ),
    )
    if (outcome === undefined) return
    const list = (changes: ReadonlyArray<string>) => changes.map((c) => `  • ${c}`).join("\n")
    switch (outcome._tag) {
      case "UpToDate":
        return yield* Console.log("Domo is up to date.")
      case "Available":
        return yield* Console.log(
          `${outcome.changes.length} change(s) waiting:\n${list(outcome.changes)}\nRun domo update to apply them.`,
        )
      case "Updated":
        yield* Console.log(`✓ Updated ${outcome.from} → ${outcome.to}:\n${list(outcome.changes)}`)
        return yield* Console.log(
          outcome.restarted
            ? "Domo restarted and is healthy. Reload the app on your devices to get the new version."
            : "Restart domo serve to run the new version.",
        )
    }
  }),
).pipe(
  Command.withDescription(
    "Update this checkout from GitHub, rebuild, and restart Domo (rolls back if anything fails)",
  ),
)

const serve = Command.make(
  "serve",
  {},
  Effect.fn(function* () {
    const config = yield* resolvedConfig
    yield* Layer.launch(DaemonLive.pipe(Layer.provide(DomoConfig.layerFrom(config))))
  }),
).pipe(Command.withDescription("Run the daemon: chat API and web app on localhost"))

domo.pipe(
  Command.withSubcommands([doctor, init, askCommand, pair, updateCommand, serve]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
