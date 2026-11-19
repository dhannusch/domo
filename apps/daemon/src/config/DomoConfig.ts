import { homedir } from "node:os"
import { join } from "node:path"
import { Config, Context, Effect, Layer, Option } from "effect"
import type { AuthMode } from "../providers/auth.ts"

export interface DomoConfigShape {
  /** Agent home: memory, skills, db, ledger. Shadow instances use their own. */
  readonly home: string
  readonly port: number
  readonly dbPath: string
  /** How SDK subprocesses authenticate; subscription logins by default. */
  readonly auth: AuthMode
  /** "live" models, or the deterministic "echo" provider for end-to-end tests and shadow runs. */
  readonly provider: "live" | "echo"
  /** No activity on any device for this long means the user is away, and tidying may run. */
  readonly awaySeconds: number
  /** How often the Tidier checks whether the user is away. */
  readonly tidyTickSeconds: number
  /** Required on /rpc and /mcp (bearer or `?token=`); undefined leaves the daemon open (tests). */
  readonly token: string | undefined
  /** Render and review agent visuals before showing them (needs Chrome). */
  readonly visualCheck: boolean
  /** Tailscale logins let in without the token (lowercase); `serve` defaults it to this Mac's owner. */
  readonly trustedLogins: ReadonlyArray<string>
  /** No explicit list was given, so `serve` adds this Mac's Tailscale owner. */
  readonly trustOwner: boolean
}

export interface DomoConfigInput {
  readonly home: string
  readonly port: number
  readonly auth?: AuthMode
  readonly provider?: "live" | "echo"
  readonly awaySeconds?: number
  readonly tidyTickSeconds?: number
  readonly token?: string | undefined
  readonly visualCheck?: boolean
  readonly trustedLogins?: ReadonlyArray<string>
  readonly trustOwner?: boolean
}

/**
 * All environment-specific settings. Never read env vars or paths elsewhere —
 * shadow instances (the Lab) run side by side with different values.
 */
export class DomoConfig extends Context.Service<DomoConfig, DomoConfigShape>()(
  "domo/config/DomoConfig",
) {
  static readonly make = (options: DomoConfigInput): DomoConfigShape => ({
    home: options.home,
    port: options.port,
    dbPath: join(options.home, "domo.db"),
    auth: options.auth ?? "subscription",
    provider: options.provider ?? "live",
    awaySeconds: options.awaySeconds ?? 2 * 60 * 60,
    tidyTickSeconds: options.tidyTickSeconds ?? 60,
    token: options.token,
    visualCheck: options.visualCheck ?? false,
    trustedLogins: (options.trustedLogins ?? []).map((login) => login.toLowerCase()),
    trustOwner: options.trustOwner ?? false,
  })

  static readonly layerFrom = (options: DomoConfigInput) =>
    Layer.succeed(DomoConfig, DomoConfig.of(DomoConfig.make(options)))

  static readonly layer = Layer.effect(
    DomoConfig,
    Effect.gen(function* () {
      const home = yield* Config.String("DOMO_HOME").pipe(
        Config.withDefault(join(homedir(), ".domo")),
      )
      const port = yield* Config.Port("DOMO_PORT").pipe(Config.withDefault(7420))
      const auth = yield* Config.Literals(["subscription", "api-key"] as const, "DOMO_AUTH").pipe(
        Config.withDefault<AuthMode>("subscription"),
      )
      const provider = yield* Config.Literals(["live", "echo"] as const, "DOMO_PROVIDER").pipe(
        Config.withDefault<"live" | "echo">("live"),
      )
      const awaySeconds = yield* Config.Number("DOMO_AWAY_SECONDS").pipe(
        Config.withDefault(2 * 60 * 60),
      )
      const tidyTickSeconds = yield* Config.Number("DOMO_TIDY_TICK_SECONDS").pipe(
        Config.withDefault(60),
      )
      // "off" disables the token (end-to-end tests); unset means `serve` uses ~/.domo/token.
      const token = yield* Config.String("DOMO_TOKEN").pipe(Config.option)
      // Comma-separated Tailscale logins to let in, or "off"; unset trusts this Mac's owner.
      const tailscaleUsers = yield* Config.String("DOMO_TAILSCALE_USERS").pipe(Config.option)
      const visualCheck = yield* Config.Literals(["on", "off"] as const, "DOMO_VISUAL_CHECK").pipe(
        Config.withDefault<"on" | "off">("on"),
      )
      return DomoConfig.of(
        DomoConfig.make({
          home,
          port,
          auth,
          provider,
          awaySeconds,
          tidyTickSeconds,
          token: Option.getOrUndefined(token),
          visualCheck: visualCheck === "on",
          trustOwner: Option.isNone(tailscaleUsers),
          trustedLogins: Option.match(tailscaleUsers, {
            onNone: () => [],
            onSome: (list) =>
              list === "off"
                ? []
                : list
                    .split(",")
                    .map((login) => login.trim())
                    .filter((login) => login.length > 0),
          }),
        }),
      )
    }),
  )
}
