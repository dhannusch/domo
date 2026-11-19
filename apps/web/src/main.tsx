import "@fontsource-variable/literata"
import "@fontsource-variable/literata/wght-italic.css"
import "@fontsource-variable/instrument-sans"
import "./styles.css"
import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { applyTheme, readTheme } from "./remote/theme.ts"
import { accessToken, checkAccess } from "./remote/token.ts"
import { Unlock } from "./remote/Unlock.tsx"

applyTheme(readTheme())

if ("serviceWorker" in navigator && window.isSecureContext) {
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined)
}

const root = document.getElementById("root")
if (root !== null) {
  const render = (unlocked: boolean) =>
    createRoot(root).render(
      <StrictMode>
        {unlocked ? (
          <RegistryProvider>
            <App />
          </RegistryProvider>
        ) : (
          <Unlock />
        )}
      </StrictMode>,
    )
  void checkAccess(accessToken).then(render)
}
