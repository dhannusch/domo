import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { earlierAtom } from "./atoms.ts"
import { MessageItem } from "./MessageItem.tsx"

function EarlierMessages() {
  const result = useAtomValue(earlierAtom)
  return AsyncResult.match(result, {
    onInitial: () => <p className="earlier-note">Opening…</p>,
    onFailure: () => <p className="earlier-note">Couldn't open Earlier. Try again in a moment.</p>,
    onSuccess: ({ value }) => (
      <div className="earlier" data-testid="earlier-messages">
        {value.map((message, index) => {
          const previous = index > 0 ? value[index - 1] : undefined
          return (
            <MessageItem
              key={message.id}
              message={message}
              draft={undefined}
              question={previous?.role === "user" ? previous.text : ""}
              refiledTo={undefined}
              progress={undefined}
            />
          )
        })}
      </div>
    ),
  })
}

/** One quiet line for everything tidied away; it opens like a normal chat, oldest first. */
export function Earlier({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div className="earlier-fold">
      <button
        type="button"
        className="quiet-action earlier-toggle"
        data-testid="earlier"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide earlier" : `Earlier: ${count} finished ${count === 1 ? "topic" : "topics"}`}
      </button>
      {open ? <EarlierMessages /> : null}
    </div>
  )
}
