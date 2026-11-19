import { useAtomValue } from "@effect/atom-react"
import { useEffect, useState } from "react"
import { connectionAtom } from "./atoms.ts"

/** After this long without a connection, add a hint about starting the daemon. */
const HINT_AFTER_MS = 10_000
/** Don't flash a status for connections that succeed almost instantly. */
const SHOW_AFTER_MS = 1_000

export function ConnectionStatus() {
  const connection = useAtomValue(connectionAtom)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (connection === "live") {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 500)
    return () => window.clearInterval(timer)
  }, [connection])

  if (connection === "live" || elapsed < SHOW_AFTER_MS) return null
  const verb = connection === "connecting" ? "Connecting to Domo…" : "Reconnecting to Domo…"
  return (
    <p className="connection" role="status" data-testid="connection-status">
      {verb}
      {elapsed >= HINT_AFTER_MS ? " Make sure it's running on this computer." : null}
    </p>
  )
}
