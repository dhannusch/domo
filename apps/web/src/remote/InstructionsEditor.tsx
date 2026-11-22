import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useState } from "react"
import { instructionsAtom, saveInstructionsAtom, trackAtom } from "../chat/atoms.ts"

/** Settings' editor for domo.md: the user's own words on how Domo should be. */
export function InstructionsEditor() {
  const result = useAtomValue(instructionsAtom)
  const refresh = useAtomRefresh(instructionsAtom)
  const save = useAtomSet(saveInstructionsAtom, { mode: "promise" })
  const track = useAtomSet(trackAtom)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  // Opening waits for a fresh read: Domo may have changed the file since, and an editor that
  // opened empty could overwrite the user's instructions with nothing.
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    if (opening && AsyncResult.isSuccess(result) && !result.waiting) {
      setDraft(result.value)
      setOpening(false)
    }
  }, [opening, result])

  if (draft === undefined)
    return (
      <>
        <button
          type="button"
          className="quiet-action"
          data-testid="instructions-edit"
          disabled={opening}
          onClick={() => {
            refresh()
            setSaved(false)
            setOpening(true)
          }}
        >
          {opening ? "Opening…" : "Edit domo.md"}
        </button>
        {saved ? (
          <p className="setting-note" data-testid="instructions-saved">
            Saved. Domo follows it from your next message.
          </p>
        ) : null}
      </>
    )

  return (
    <div className="instructions">
      <textarea
        data-testid="instructions-text"
        aria-label="Your instructions for Domo"
        value={draft}
        spellCheck
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="instructions-actions">
        <button
          type="button"
          className="quiet-action"
          data-testid="instructions-cancel"
          onClick={() => setDraft(undefined)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="instructions-save"
          data-testid="instructions-save"
          onClick={() =>
            void save({ payload: { text: draft }, reactivityKeys: ["instructions"] }).then(() => {
              track({ payload: { event: { _tag: "SettingChanged", key: "instructions" } } })
              setDraft(undefined)
              setSaved(true)
            })
          }
        >
          Save
        </button>
      </div>
    </div>
  )
}
