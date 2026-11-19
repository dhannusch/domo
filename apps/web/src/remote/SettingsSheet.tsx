import type { DomoSettings, LabChange, SettingsView } from "@domo/domain"
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useRef, useState } from "react"
import {
  modelsAtom,
  pushKeyAtom,
  settingsAtom,
  subscribeAtom,
  trackAtom,
  undoLabChangeAtom,
  updateSettingsAtom,
} from "../chat/atoms.ts"
import { deviceId } from "../chat/usePresence.ts"
import { InstructionsEditor } from "./InstructionsEditor.tsx"
import { enablePush, pushSupported } from "./PushOffer.tsx"
import { readTheme, saveTheme, type ThemeChoice } from "./theme.ts"

/** Cheap, quick models suited to background work. */
const BACKGROUND_CHOICES = ["haiku", "luna", "sonnet"]

const AWAY_CHOICES = [
  { seconds: 30 * 60, label: "30 minutes" },
  { seconds: 2 * 60 * 60, label: "2 hours" },
  { seconds: 8 * 60 * 60, label: "8 hours" },
] as const

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 2) return "active now"
  if (minutes < 60) return `${minutes} minutes ago`
  if (minutes < 90) return "an hour ago"
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours ago`
  return day.format(new Date(iso))
}

/** A row of index cards, one picked: the settings' only kind of control. */
function Cards<T extends string | number | boolean>({
  name,
  value,
  options,
  onPick,
}: {
  name: string
  value: T
  options: ReadonlyArray<{ readonly value: T; readonly label: string }>
  onPick: (value: T) => void
}) {
  return (
    <div className="setting-cards">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          className={`setting-card${option.value === value ? " picked" : ""}`}
          data-testid={`setting-${name}-${String(option.value)}`}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function LabChanges({ changes }: { changes: ReadonlyArray<LabChange> }) {
  const undo = useAtomSet(undoLabChangeAtom, { mode: "promise" })
  if (changes.length === 0) return <p className="setting-note">No changes yet.</p>
  return (
    <ul className="setting-list" data-testid="lab-changes">
      {changes.map((change) => (
        <li key={change.id}>
          <span>
            {change.hypothesis}{" "}
            <span className="setting-note">
              ({change.skill}, {day.format(new Date(change.at))})
            </span>
          </span>
          {change.status === "undone" ? (
            <span className="setting-note">undone</span>
          ) : (
            <button
              type="button"
              className="quiet-action"
              onClick={() =>
                void undo({ payload: { id: change.id }, reactivityKeys: ["settings"] })
              }
            >
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function SettingsBody({ view }: { view: SettingsView }) {
  const update = useAtomSet(updateSettingsAtom, { mode: "promise" })
  const track = useAtomSet(trackAtom)
  const getKey = useAtomSet(pushKeyAtom, { mode: "promise" })
  const subscribe = useAtomSet(subscribeAtom, { mode: "promise" })
  const [pushHere, setPushHere] = useState(
    () => pushSupported() && Notification.permission === "granted",
  )
  const set = (patch: Partial<DomoSettings>, key: string) => {
    track({ payload: { event: { _tag: "SettingChanged", key } } })
    void update({ payload: { patch }, reactivityKeys: ["settings"] })
  }
  const { settings } = view
  const here = deviceId()
  const models = useAtomValue(modelsAtom)
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  return (
    <>
      <section className="setting">
        <h3>Notifications</h3>
        <Cards
          name="notifications"
          value={settings.notifications}
          options={[
            { value: "needed", label: "When I’m needed" },
            { value: "off", label: "Off" },
          ]}
          onPick={(notifications) => set({ notifications }, "notifications")}
        />
        {settings.notifications === "needed" && pushSupported() && !pushHere ? (
          <button
            type="button"
            className="quiet-action"
            data-testid="push-here"
            onClick={() => void enablePush(getKey, subscribe).then(setPushHere)}
          >
            Turn on for this device
          </button>
        ) : null}
      </section>

      <section className="setting">
        <h3>Tidy up after you’ve been away</h3>
        <Cards
          name="away"
          value={settings.awaySeconds}
          options={
            AWAY_CHOICES.some((c) => c.seconds === settings.awaySeconds)
              ? AWAY_CHOICES.map((c) => ({ value: c.seconds, label: c.label }))
              : [
                  { value: settings.awaySeconds, label: `${settings.awaySeconds} seconds` },
                  ...AWAY_CHOICES.map((c) => ({ value: c.seconds, label: c.label })),
                ]
          }
          onPick={(awaySeconds) => set({ awaySeconds }, "awaySeconds")}
        />
      </section>

      <section className="setting">
        <h3>Default model</h3>
        {AsyncResult.match(models, {
          onInitial: () => null,
          onFailure: () => null,
          onSuccess: ({ value }) => (
            <Cards
              name="model"
              value={settings.model}
              options={value.map((m) => ({ value: m.key, label: m.label }))}
              onPick={(model) => set({ model }, "model")}
            />
          ),
        })}
        <p className="setting-note">
          It answers your messages and leads councils. Domo still hands coding and reviews to other
          models when they fit, and a conversation you pointed at a specific model stays with it.
        </p>
      </section>

      <section className="setting">
        <h3>Background model</h3>
        {AsyncResult.match(models, {
          onInitial: () => null,
          onFailure: () => null,
          onSuccess: ({ value }) => (
            <Cards
              name="background"
              value={settings.backgroundModel}
              options={value
                .filter((m) => BACKGROUND_CHOICES.includes(m.key))
                .map((m) => ({ value: m.key, label: m.label }))}
              onPick={(backgroundModel) => set({ backgroundModel }, "backgroundModel")}
            />
          ),
        })}
        <p className="setting-note">
          Files each exchange into a topic and keeps its summary, in the background. The cheapest
          option is fine here: Haiku uses your Claude plan, Luna your ChatGPT plan.
        </p>
      </section>

      <section className="setting">
        <h3>Your instructions for Domo</h3>
        <p className="setting-note">
          How Domo should talk and behave, in your own words. Domo reads them before every reply,
          and only saves a change it suggests if you say yes.
        </p>
        <InstructionsEditor />
      </section>

      <section className="setting">
        <h3>Appearance</h3>
        <Cards
          name="theme"
          value={theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onPick={(choice) => {
            setTheme(choice)
            saveTheme(choice)
            track({ payload: { event: { _tag: "SettingChanged", key: "theme" } } })
          }}
        />
        <p className="setting-note">Just for this device.</p>
      </section>

      <section className="setting">
        <h3>What Domo knows</h3>
        <details>
          <summary data-testid="profile-open">
            Your profile and {view.notes} {view.notes === 1 ? "note" : "notes"}
          </summary>
          <p className="setting-profile">{view.profile.trim() || "Nothing yet."}</p>
        </details>
        <p className="setting-note">To change or remove something, tell Domo.</p>
      </section>

      <section className="setting">
        <h3>Self-improvement</h3>
        <Cards
          name="lab"
          value={settings.lab}
          options={[
            { value: true, label: "On" },
            { value: false, label: "Off" },
          ]}
          onPick={(lab) => set({ lab }, "lab")}
        />
        <LabChanges changes={view.labChanges} />
      </section>

      <section className="setting">
        <h3>Devices</h3>
        <ul className="setting-list">
          {view.devices.map((d) => (
            <li key={d.id}>
              <span>{d.id === here ? "This device" : "Another device"}</span>
              <span className="setting-note">{ago(d.lastSeen)}</span>
            </li>
          ))}
        </ul>
        <p className="setting-note">To add one, run domo pair on the computer Domo runs on.</p>
      </section>
    </>
  )
}

/** Settings, one tap behind the date: the main page stays just the conversation. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const result = useAtomValue(settingsAtom)
  const refresh = useAtomRefresh(settingsAtom)
  useEffect(() => {
    const el = dialog.current
    if (el === null) return
    if (open && !el.open) {
      refresh()
      el.showModal()
    }
    if (!open && el.open) el.close()
  }, [open, refresh])
  return (
    <dialog ref={dialog} className="settings" data-testid="settings" onClose={onClose}>
      <div className="settings-head">
        <h2>Settings</h2>
        <button
          type="button"
          className="quiet-action"
          data-testid="settings-done"
          onClick={onClose}
        >
          Done
        </button>
      </div>
      {open
        ? AsyncResult.match(result, {
            onInitial: () => <p className="setting-note">Loading…</p>,
            onFailure: () => (
              <p className="setting-note">Couldn’t load your settings. Try again in a moment.</p>
            ),
            onSuccess: ({ value }) => <SettingsBody view={value} />,
          })
        : null}
    </dialog>
  )
}
