import { Schema } from "effect"
import { DeviceId } from "./ids.ts"

/** What the user can tweak from the settings sheet (or by asking Domo). */
export const DomoSettings = Schema.Struct({
  /** Push notifications: only for decisions that block on the user, or never. */
  notifications: Schema.Literals(["needed", "off"]),
  /** Idle time on every device before Domo tidies and runs background work. */
  awaySeconds: Schema.Number.pipe(
    Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 86_400 })),
  ),
  /** Whether the Lab runs its nightly experiments. */
  lab: Schema.Boolean,
  /** The model that answers unless a topic was pinned to another (`@alias`): an alias such as "opus". */
  model: Schema.NonEmptyString,
  /** The cheap model for background work (filing and topic summaries): an alias such as "haiku". */
  backgroundModel: Schema.NonEmptyString,
})
export type DomoSettings = typeof DomoSettings.Type

export const SettingsPatch = Schema.Struct({
  notifications: Schema.optionalKey(DomoSettings.fields.notifications),
  awaySeconds: Schema.optionalKey(DomoSettings.fields.awaySeconds),
  lab: Schema.optionalKey(Schema.Boolean),
  model: Schema.optionalKey(Schema.NonEmptyString),
  backgroundModel: Schema.optionalKey(Schema.NonEmptyString),
})
export type SettingsPatch = typeof SettingsPatch.Type

/** One change the Lab promoted, as the settings sheet lists it. */
export const LabChange = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  skill: Schema.String,
  hypothesis: Schema.String,
  status: Schema.Literals(["watching", "kept", "undone"]),
})
export type LabChange = typeof LabChange.Type

/** Everything the settings sheet shows, in one read. */
export const SettingsView = Schema.Struct({
  settings: DomoSettings,
  profile: Schema.String,
  notes: Schema.Int,
  labChanges: Schema.Array(LabChange),
  devices: Schema.Array(Schema.Struct({ id: DeviceId, lastSeen: Schema.String })),
})
export type SettingsView = typeof SettingsView.Type
