const KEY = "domo.token"

const stored = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Remembers the access token on this device (an installed iPhone app keeps its own storage). */
export const saveToken = (token: string) => {
  try {
    localStorage.setItem(KEY, token.trim())
  } catch {
    // Private mode: the token lasts for this page only.
  }
}

/**
 * The access token from a pairing link (`?token=`, then removed from the
 * address bar) or from an earlier visit. Read once, before the socket opens.
 */
const fromPage = (): string | null => {
  const url = new URL(window.location.href)
  const token = url.searchParams.get("token")
  if (token === null) return stored()
  saveToken(token)
  url.searchParams.delete("token")
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  return token
}

export const accessToken = fromPage()

/** Whether the daemon accepts this device's token (always true when the daemon has none). */
export const checkAccess = (token: string | null) =>
  fetch("/auth", token === null ? {} : { headers: { authorization: `Bearer ${token}` } }).then(
    (response) => response.ok,
    () => true, // Offline or restarting: let the chat show its own reconnecting state.
  )
