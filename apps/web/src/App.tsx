import { useState } from "react"
import { Chat } from "./chat/Chat.tsx"
import { Composer } from "./chat/Composer.tsx"
import { usePresence } from "./chat/usePresence.ts"
import { GearIcon } from "./remote/GearIcon.tsx"
import { PushOffer } from "./remote/PushOffer.tsx"
import { SettingsSheet } from "./remote/SettingsSheet.tsx"

const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" })

export function App() {
  usePresence()
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <>
      <main className="page">
        <div className="masthead-row">
          <div className="masthead-identity">
            <span className="wordmark">domo</span>
            <p className="masthead">{today.format(new Date())}</p>
          </div>
          <button
            type="button"
            className="settings-button"
            data-testid="settings-open"
            aria-haspopup="dialog"
            aria-label="Settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </button>
        </div>
        <Chat />
        <PushOffer />
      </main>
      <Composer />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
