/** Light, dark, or follow the system: a per-device choice, kept in this browser. */
export type ThemeChoice = "system" | "light" | "dark"

const KEY = "domo.theme"
/** The status-bar colors, matching --paper in each theme. */
const BAR = { light: "#f5f5f5", dark: "#1c1c1c" }

export const readTheme = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    return "system"
  }
}

/** Sets `data-theme` (the tokens in styles.css follow it) and the browser's status-bar color. */
export const applyTheme = (choice: ThemeChoice) => {
  const root = document.documentElement
  if (choice === "system") delete root.dataset.theme
  else root.dataset.theme = choice
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const dark = meta.media.includes("dark")
    meta.content = choice === "system" ? BAR[dark ? "dark" : "light"] : BAR[choice]
  }
}

export const saveTheme = (choice: ThemeChoice) => {
  try {
    if (choice === "system") localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Without storage the choice lasts for this page only.
  }
  applyTheme(choice)
}
