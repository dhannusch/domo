import { Effect, Option, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const Status = Schema.fromJsonString(
  Schema.Struct({
    Self: Schema.Struct({ DNSName: Schema.String, UserID: Schema.Number }),
    User: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.Struct({ LoginName: Schema.String })),
    ),
  }),
)

/** On PATH (Homebrew, standalone) or inside the Mac app, where the App Store install keeps it. */
const CLI_CANDIDATES = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]

const tailscaleStatus = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const out = yield* Effect.firstSuccessOf(
    CLI_CANDIDATES.map((cli) => spawner.string(ChildProcess.make(cli, ["status", "--json"]))),
  )
  return yield* Schema.decodeUnknownEffect(Status)(out)
})

/** This Mac's tailnet name (e.g. `mac.tail1234.ts.net`), if Tailscale is installed and up. */
export const tailnetHost = tailscaleStatus.pipe(
  Effect.map((s) => Option.some(s.Self.DNSName.replace(/\.$/, ""))),
  Effect.orElseSucceed(() => Option.none<string>()),
)

/** The Tailscale login that owns this Mac (your own devices sign in as it), or why it couldn't be read. */
export const tailnetOwner = tailscaleStatus.pipe(
  Effect.mapError((error) => String(error).slice(0, 300)),
  Effect.flatMap((s) =>
    Option.match(Option.fromNullishOr(s.User?.[String(s.Self.UserID)]?.LoginName), {
      onNone: () => Effect.fail("Tailscale is running but no one is signed in"),
      onSome: Effect.succeed,
    }),
  ),
)
