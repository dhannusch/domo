import { DeviceId } from "@domo/domain"
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useEffect, useRef } from "react"
import { captureAnchor } from "./anchor.ts"
import { anchorAtom, chatAtom, presenceAtom, readThroughAtom, returnAtom } from "./atoms.ts"

const DEVICE_KEY = "domo.device"
/** Report activity at most this often; the away clock is measured in hours, not seconds. */
const THROTTLE_MS = 15_000
/** How long the read cursor must settle before it's reported. */
const READ_REPORT_DELAY_MS = 2_000
/** Reading only counts as presence if the user also interacted this recently (an open, idle tab isn't reading). */
const READING_WINDOW_MS = 2 * 60_000
/** A pause this long between interactions means the next one may be a return. */
const IDLE_GAP_MS = 2_000

export const deviceId = (): DeviceId => {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY)
    if (existing !== null) return DeviceId.make(existing)
    const fresh = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_KEY, fresh)
    return DeviceId.make(fresh)
  } catch {
    return DeviceId.make(crypto.randomUUID())
  }
}

/**
 * Tells Domo the user is here whenever they interact. On the first interaction
 * after an absence the daemon answers with the return line; the page then
 * rebuilds (tidied topics leave for "Earlier") while keeping the user's place.
 */
export function usePresence() {
  const touch = useAtomSet(presenceAtom, { mode: "promise" })
  const refreshChat = useAtomRefresh(chatAtom)
  const setReturn = useAtomSet(returnAtom)
  const setAnchor = useAtomSet(anchorAtom)
  const readThrough = useAtomValue(readThroughAtom)
  const latestRead = useRef(readThrough)
  latestRead.current = readThrough
  const readNow = useRef<() => void>(() => {})
  const lastInteraction = useRef(0)

  // Reading is presence too: report the read cursor shortly after it moves, so a
  // topic the user finished reading before leaving can be tidied.
  useEffect(() => {
    if (readThrough === undefined) return
    const timer = window.setTimeout(() => readNow.current(), READ_REPORT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [readThrough])

  useEffect(() => {
    const device = deviceId()
    let last = 0
    const report = () => {
      const now = Date.now()
      if (now - last < THROTTLE_MS) return
      last = now
      const leftOffAt = latestRead.current
      touch({
        payload:
          leftOffAt === undefined
            ? { deviceId: device }
            : { deviceId: device, readThrough: leftOffAt },
      })
        .then((summary) => {
          if (summary === null) return
          setReturn({ summary, afterId: leftOffAt })
          setAnchor(captureAnchor())
          refreshChat()
        })
        .catch(() => {
          last = 0 // retry on the next interaction
        })
    }
    const interact = () => {
      const now = Date.now()
      // The throttle only collapses continuous activity: the first interaction after
      // any idle gap reports right away (that's how coming back is noticed).
      if (now - lastInteraction.current > IDLE_GAP_MS) last = 0
      lastInteraction.current = now
      report()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") interact()
    }
    readNow.current = () => {
      if (Date.now() - lastInteraction.current > READING_WINDOW_MS) return
      last = 0
      report()
    }
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const
    for (const event of events) window.addEventListener(event, interact, { passive: true })
    document.addEventListener("visibilitychange", onVisible)
    // Opening the app counts as being here.
    interact()
    return () => {
      for (const event of events) window.removeEventListener(event, interact)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [touch, refreshChat, setReturn, setAnchor])
}
