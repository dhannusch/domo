import { useState } from "react"
import { checkAccess, saveToken } from "./token.ts"

/** Shown when this device has no valid token: one field for the code from `domo pair`. */
export function Unlock() {
  const [code, setCode] = useState("")
  const [wrong, setWrong] = useState(false)
  return (
    <main className="page unlock" data-testid="unlock">
      <p className="unlock-lede">This Domo is private.</p>
      <p>
        On your Mac, run <code>domo pair</code> and open the link it prints, or paste its code here.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void checkAccess(code.trim()).then((ok) => {
            if (!ok) return setWrong(true)
            saveToken(code)
            window.location.reload()
          })
        }}
      >
        <input
          data-testid="unlock-code"
          aria-label="Pairing code"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setWrong(false)
          }}
        />
        <button
          type="submit"
          className="unlock-submit"
          data-testid="unlock-submit"
          disabled={code.trim().length === 0}
        >
          Unlock
        </button>
      </form>
      {wrong ? (
        <p className="unlock-wrong">
          That code didn't work. Run domo pair again for the current one.
        </p>
      ) : null}
    </main>
  )
}
