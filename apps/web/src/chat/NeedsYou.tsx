import type { Message } from "@domo/domain"
import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { chatAtom } from "./atoms.ts"
import { previewOf } from "./reply.ts"
import { needsYou } from "./view.ts"

const jumpTo = (message: Message) => {
  const element = document.querySelector(`[data-message-id="${message.id}"]`)?.closest("article")
  if (element == null) return
  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "center",
  })
  element.classList.add("flash")
  window.setTimeout(() => element.classList.remove("flash"), 1600)
}

/**
 * The single safety net: shown only while something waits on the user or work
 * is running, so a decision that scrolled away is never lost (UX-07).
 */
export function NeedsYou() {
  const result = useAtomValue(chatAtom)
  const [open, setOpen] = useState(false)
  const view = AsyncResult.isSuccess(result) ? result.value : undefined
  if (view === undefined) return null
  const { decisions, running } = needsYou(view)
  if (decisions.length === 0 && running.length === 0) return null

  const label = [
    decisions.length > 0 ? `${decisions.length} needs you` : undefined,
    running.length > 0 ? `${running.length} running` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(", ")

  return (
    <div className="needs-you">
      <button
        type="button"
        className="needs-you-marker"
        data-testid="needs-you"
        data-concept="needs-you"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open ? (
        <ul className="needs-you-list" data-testid="needs-you-list">
          {[...decisions, ...running].map((message) => (
            <li key={message.id}>
              <button
                type="button"
                data-testid={`needs-you-item-${message.id}`}
                onClick={() => {
                  setOpen(false)
                  jumpTo(message)
                }}
              >
                {message.component?._tag === "Choice"
                  ? previewOf(message.component.question, 70)
                  : message.component?._tag === "Questions"
                    ? previewOf(message.component.questions[0]?.question ?? "Questions", 70)
                    : (message.work?.summary ?? "Work in progress")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
