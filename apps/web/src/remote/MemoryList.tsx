import type { MemoryItem } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useState } from "react"
import { forgetMemoryAtom, trackAtom } from "../chat/atoms.ts"

const readable = (name: string) => name.replace(/-/g, " ")

/** Every note Domo keeps about the user, each removable (archived, never deleted). */
export function MemoryList({ memories }: { memories: ReadonlyArray<MemoryItem> }) {
  const forget = useAtomSet(forgetMemoryAtom, { mode: "promise" })
  const track = useAtomSet(trackAtom)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  if (memories.length === 0) return <p className="setting-note">No notes yet.</p>
  return (
    <ul className="memory-list" data-testid="memory-list">
      {memories.map((memory) => (
        <li key={memory.name} className="memory-item" data-testid="memory-item">
          <div className="memory-text">
            <span className="memory-name">{readable(memory.name)}</span>
            <span className="memory-body">{memory.body}</span>
          </div>
          <button
            type="button"
            className="quiet-action"
            data-testid="memory-forget"
            aria-label={`Remove the note "${readable(memory.name)}"`}
            disabled={removing === memory.name}
            onClick={() => {
              setRemoving(memory.name)
              forget({ payload: { name: memory.name }, reactivityKeys: ["settings"] })
                .then(() =>
                  track({ payload: { event: { _tag: "SettingChanged", key: "memory" } } }),
                )
                .finally(() => setRemoving(undefined))
            }}
          >
            {removing === memory.name ? "Removing…" : "Remove"}
          </button>
        </li>
      ))}
    </ul>
  )
}
