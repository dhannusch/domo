import { DEFAULT_MAIN_MODEL, type DomoSettings, ModelRef, SettingsPatch } from "@domo/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DomoConfig } from "../config/DomoConfig.ts"
import { resolveModel } from "../models/registry.ts"

const BACKGROUND_DEFAULT = new ModelRef({ provider: "claude", id: "claude-haiku-5-5" })

const Overrides = Schema.fromJsonString(SettingsPatch)
const decodeOverrides = Schema.decodeUnknownOption(Overrides)
const encodeOverrides = Schema.encodeSync(Overrides)

/**
 * The user's settings. Only what they changed is stored (in `meta`), so the
 * defaults keep coming from DomoConfig and shadow instances stay injectable.
 */
export class Settings extends Context.Service<
  Settings,
  {
    readonly current: Effect.Effect<DomoSettings>
    update(patch: SettingsPatch): Effect.Effect<DomoSettings>
    /** The away clock in milliseconds. */
    readonly awayMs: Effect.Effect<number>
    /** The model that answers unless a topic is pinned to another. */
    readonly mainModel: Effect.Effect<ModelRef>
    /** The cheap model for background work (filing, topic summaries). */
    readonly backgroundModel: Effect.Effect<ModelRef>
  }
>()("domo/settings/Settings") {
  static readonly layer = Layer.effect(
    Settings,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* DomoConfig
      const defaults: DomoSettings = {
        notifications: "all",
        awaySeconds: config.awaySeconds,
        lab: true,
        model: "opus",
        backgroundModel: "haiku",
      }
      const overrides = sql<{ value: string }>`SELECT value FROM meta WHERE key = 'settings'`.pipe(
        Effect.map((rows) => Option.getOrElse(decodeOverrides(rows[0]?.value ?? "{}"), () => ({}))),
        Effect.orDie,
      )
      const current = Effect.map(overrides, (o): DomoSettings => ({ ...defaults, ...o }))
      const update = Effect.fn("Settings.update")(function* (patch: SettingsPatch) {
        const next = { ...(yield* overrides), ...patch }
        yield* sql`INSERT INTO meta (key, value) VALUES ('settings', ${encodeOverrides(next)})
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`.pipe(Effect.orDie)
        return yield* current
      })
      const awayMs = Effect.map(current, (s) => s.awaySeconds * 1000)
      const mainModel = Effect.map(current, (s) => resolveModel(s.model) ?? DEFAULT_MAIN_MODEL)
      const backgroundModel = Effect.map(
        current,
        (s) => resolveModel(s.backgroundModel) ?? BACKGROUND_DEFAULT,
      )
      return Settings.of({ current, update, awayMs, mainModel, backgroundModel })
    }),
  )
}
