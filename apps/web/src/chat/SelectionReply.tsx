import { MessageId } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useEffect, useState } from "react"
import { previewOf, quoteFromSelection, replyAtom } from "./reply.ts"

interface Pending {
  readonly messageId: MessageId
  readonly container: Element
  readonly range: Range
  readonly top: number
  readonly left: number
}

/** Selecting text inside a message offers "Reply with quote" (desktop select, phone long-press). */
export function SelectionReply() {
  const setReply = useAtomSet(replyAtom)
  const [pending, setPending] = useState<Pending | undefined>(undefined)

  useEffect(() => {
    const onChange = () => {
      const selection = document.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
        setPending(undefined)
        return
      }
      const range = selection.getRangeAt(0)
      const anchor = range.commonAncestorContainer
      const element = anchor instanceof Element ? anchor : anchor.parentElement
      const container = element?.closest("[data-message-id]")
      const messageId = container?.getAttribute("data-message-id")
      if (container == null || messageId == null || range.toString().trim().length < 2) {
        setPending(undefined)
        return
      }
      const rect = range.getBoundingClientRect()
      setPending({
        messageId: MessageId.make(messageId),
        container,
        range: range.cloneRange(),
        top: rect.bottom + window.scrollY + 8,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 170),
      })
    }
    document.addEventListener("selectionchange", onChange)
    return () => document.removeEventListener("selectionchange", onChange)
  }, [])

  if (pending === undefined) return null
  return (
    <button
      type="button"
      className="selection-reply"
      data-testid="reply-with-quote"
      style={{ top: pending.top, left: pending.left }}
      // Keep the selection alive while pressing the button.
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        const quote = quoteFromSelection(pending.container, pending.range)
        if (quote === undefined) return
        setReply({ messageId: pending.messageId, quote, preview: previewOf(quote.exact) })
        document.getSelection()?.removeAllRanges()
        setPending(undefined)
        document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]")?.focus()
      }}
    >
      Reply with quote
    </button>
  )
}
