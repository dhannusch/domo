import { Effect, Option, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const Status = Schema.fromJsonString(
  Schema.Struct({ Self: Schema.Struct({ DNSName: Schema.String }) }),
)

/** This Mac's tailnet name (e.g. `mac.tail1234.ts.net`), if Tailscale is installed and up. */
export const tailnetHost = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const out = yield* spawner.string(ChildProcess.make("tailscale", ["status", "--json"]))
  const status = yield* Schema.decodeUnknownEffect(Status)(out)
  return Option.some(status.Self.DNSName.replace(/\.$/, ""))
}).pipe(Effect.orElseSucceed(() => Option.none<string>()))
