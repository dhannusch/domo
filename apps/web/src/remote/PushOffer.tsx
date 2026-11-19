import type { PushSubscriptionJson } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useState } from "react"
import { pushKeyAtom, subscribeAtom } from "../chat/atoms.ts"

const DISMISSED = "domo.push-offer"

const fromBase64Url = (value: string) => {
  const base64 = (value + "===".slice((value.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && navigator.standalone === true)

const offerable = () => {
  try {
    return (
      installed() &&
      "PushManager" in window &&
      "Notification" in window &&
      Notification.permission === "default" &&
      localStorage.getItem(DISMISSED) === null
    )
  } catch {
    return false
  }
}

type GetKey = (input: { payload: undefined }) => Promise<string>
type Subscribe = (input: { payload: { subscription: PushSubscriptionJson } }) => Promise<void>

export const pushSupported = () => "PushManager" in window && "Notification" in window

/** Asks for permission (needs a tap on iOS) and registers this device for notifications. */
export const enablePush = async (getKey: GetKey, subscribe: Subscribe): Promise<boolean> => {
  if ((await Notification.requestPermission()) !== "granted") return false
  const registration = await navigator.serviceWorker.ready
  const key = await getKey({ payload: undefined })
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(key),
  })
  const json = subscription.toJSON()
  if (
    json.endpoint === undefined ||
    json.keys?.p256dh === undefined ||
    json.keys.auth === undefined
  )
    return false
  await subscribe({
    payload: {
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    },
  })
  return true
}

/**
 * One quiet line in the installed app, once: notifications are only for
 * decisions that block on the user. iOS needs the tap to ask for permission.
 */
export function PushOffer() {
  const [visible, setVisible] = useState(offerable)
  const getKey = useAtomSet(pushKeyAtom, { mode: "promise" })
  const subscribe = useAtomSet(subscribeAtom, { mode: "promise" })
  if (!visible) return null
  const close = () => {
    try {
      localStorage.setItem(DISMISSED, "1")
    } catch {
      // Without storage the offer simply returns next visit.
    }
    setVisible(false)
  }
  const turnOn = async () => {
    close()
    await enablePush(getKey, subscribe)
  }
  return (
    <p className="push-offer" data-testid="push-offer">
      <span>Want a notification when I need your decision?</span>
      <button
        type="button"
        className="quiet-action"
        data-testid="push-on"
        onClick={() => void turnOn()}
      >
        Turn on
      </button>
      <button type="button" className="quiet-action" data-testid="push-later" onClick={close}>
        Not now
      </button>
    </p>
  )
}
