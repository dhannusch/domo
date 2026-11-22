import type { PushSubscriptionJson } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useEffect, useState } from "react"
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

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (a === null || a.byteLength !== b.byteLength) return false
  const bytes = new Uint8Array(a)
  return bytes.every((byte, i) => byte === b[i])
}

/**
 * Registers this device with the daemon, reusing the browser's subscription when it was made
 * with the daemon's current key. Needs notification permission already granted.
 */
const register = async (getKey: GetKey, subscribe: Subscribe): Promise<boolean> => {
  const registration = await navigator.serviceWorker.ready
  const key = fromBase64Url(await getKey({ payload: undefined }))
  const existing = await registration.pushManager.getSubscription()
  if (existing !== null && !sameKey(existing.options.applicationServerKey, key))
    await existing.unsubscribe()
  const subscription =
    existing !== null && sameKey(existing.options.applicationServerKey, key)
      ? existing
      : await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
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

/** Asks for permission (needs a tap on iOS) and registers this device for notifications. */
export const enablePush = async (getKey: GetKey, subscribe: Subscribe): Promise<boolean> => {
  if ((await Notification.requestPermission()) !== "granted") return false
  return register(getKey, subscribe)
}

/**
 * Re-registers a device that already allowed notifications, every time the app opens, so a
 * daemon that lost or replaced its subscription (new keys, a new home, an expired endpoint)
 * still reaches it without the user doing anything.
 */
export const refreshPush = (getKey: GetKey, subscribe: Subscribe): Promise<boolean> =>
  pushSupported() && Notification.permission === "granted" && window.isSecureContext
    ? register(getKey, subscribe).catch(() => false)
    : Promise.resolve(false)

/**
 * One quiet line in the installed app, once: notifications are only for
 * decisions that block on the user. iOS needs the tap to ask for permission.
 */
export function PushOffer() {
  const [visible, setVisible] = useState(offerable)
  const getKey = useAtomSet(pushKeyAtom, { mode: "promise" })
  const subscribe = useAtomSet(subscribeAtom, { mode: "promise" })
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per app open
  useEffect(() => {
    void refreshPush(getKey, subscribe)
  }, [])
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
      <span>Want a notification when I reply or need your decision?</span>
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
