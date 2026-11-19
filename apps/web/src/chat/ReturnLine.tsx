import { useAtom, useAtomRefresh, useAtomSet } from "@effect/atom-react"
import { captureAnchor } from "./anchor.ts"
import { anchorAtom, chatAtom, returnAtom, trackAtom, undoTidyAtom } from "./atoms.ts"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "While you were away: 2 done, 1 needs you, moved 3 to Earlier (undo)" — one line, never pinned. */
export function ReturnLine() {
  const [state, setState] = useAtom(returnAtom)
  const undo = useAtomSet(undoTidyAtom, { mode: "promise" })
  const track = useAtomSet(trackAtom)
  const setAnchor = useAtomSet(anchorAtom)
  const refreshChat = useAtomRefresh(chatAtom)
  if (state === undefined) return null
  const { done, needsYou, tidied } = state.summary
  const parts = [
    done > 0 ? `${done} done` : undefined,
    needsYou > 0 ? `${needsYou} needs you` : undefined,
    tidied !== undefined
      ? `moved ${plural(tidied.topics, "topic", "topics")} to Earlier`
      : undefined,
  ].filter((part) => part !== undefined)
  if (parts.length === 0) return null

  return (
    <p className="return-line" data-testid="return-line">
      <span>While you were away: {parts.join(", ")}</span>
      {tidied !== undefined ? (
        <button
          type="button"
          className="quiet-action"
          data-testid="return-undo"
          onClick={() => {
            undo({ payload: { id: tidied.id } }).then(() => {
              track({ payload: { event: { _tag: "TidyUndone", topicIds: [] } } })
              setState({ ...state, summary: { done, needsYou } })
              setAnchor(captureAnchor())
              refreshChat()
            })
          }}
        >
          undo
        </button>
      ) : null}
    </p>
  )
}
