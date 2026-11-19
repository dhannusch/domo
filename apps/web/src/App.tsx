import { useState } from "react"
import { Chat } from "./chat/Chat.tsx"
import { Composer } from "./chat/Composer.tsx"
import { usePresence } from "./chat/usePresence.ts"
import { PushOffer } from "./remote/PushOffer.tsx"
import { SettingsSheet } from "./remote/SettingsSheet.tsx"

const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" })

export function App() {
  usePresence()
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <>
      <main className="page">
        <button
          type="button"
          className="masthead"
          data-testid="settings-open"
          aria-haspopup="dialog"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          {today.format(new Date())}
        </button>
        <Chat />
        <PushOffer />
      </main>
      <Composer />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
