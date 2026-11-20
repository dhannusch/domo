import { MessageId, type TextQuote } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useEffect, useRef, useState } from "react"
import { trackAtom } from "./atoms.ts"
import { addReply, previewOf, quoteFromSelection, replyAtom } from "./reply.ts"

interface Selected {
  readonly messageId: MessageId
  readonly container: Element
  readonly range: Range
  readonly top: number
  readonly left: number
}

interface Composing {
  readonly messageId: MessageId
  readonly quote: TextQuote
  readonly range: Range
  readonly top: number
  readonly left: number
}

const HIGHLIGHT = "domo-comment"

/** Keeps the fragment marked while its comment is written (the selection itself goes away). */
const markRange = (range: Range | undefined) => {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return
  if (range === undefined) CSS.highlights.delete(HIGHLIGHT)
  else CSS.highlights.set(HIGHLIGHT, new Highlight(range))
}

/** Where the comment box sits: under the highlight, kept inside the screen. */
const placeUnder = (range: Range) => {
  const rect = range.getBoundingClientRect()
  const width = Math.min(352, window.innerWidth - 32)
  return {
    top: rect.bottom + window.scrollY + 8,
    left: Math.max(16, Math.min(rect.left + window.scrollX, window.innerWidth - width - 16)),
  }
}

/**
 * Comments on a highlight, like comments in a document: select text in a reply, tap "Comment",
 * and write right there. Each comment joins the next message, quote and all; any number can
 * collect before Send.
 */
export function SelectionReply() {
  const setReply = useAtomSet(replyAtom)
  const track = useAtomSet(trackAtom)
  const [selected, setSelected] = useState<Selected | undefined>(undefined)
  const [composing, setComposing] = useState<Composing | undefined>(undefined)
  const [comment, setComment] = useState("")
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const onChange = () => {
      const selection = document.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
        setSelected(undefined)
        return
      }
      const range = selection.getRangeAt(0)
      const anchor = range.commonAncestorContainer
      const element = anchor instanceof Element ? anchor : anchor.parentElement
      const container = element?.closest("[data-message-id]")
      const messageId = container?.getAttribute("data-message-id")
      if (container == null || messageId == null || range.toString().trim().length < 2) {
        setSelected(undefined)
        return
      }
      setSelected({
        messageId: MessageId.make(messageId),
        container,
        range: range.cloneRange(),
        ...placeUnder(range),
      })
    }
    document.addEventListener("selectionchange", onChange)
    return () => document.removeEventListener("selectionchange", onChange)
  }, [])

  useEffect(() => {
    markRange(composing?.range)
    if (composing !== undefined) box.current?.focus()
    return () => markRange(undefined)
  }, [composing])

  const close = () => {
    setComposing(undefined)
    setComment("")
  }

  const add = () => {
    if (composing === undefined) return
    const text = comment.trim()
    setReply((drafts) =>
      addReply(drafts, {
        messageId: composing.messageId,
        quote: composing.quote,
        preview: previewOf(composing.quote.exact),
        ...(text.length === 0 ? {} : { comment: text }),
      }),
    )
    track({ payload: { event: { _tag: "HighlightCommented", withComment: text.length > 0 } } })
    close()
  }

  if (composing !== undefined)
    return (
      <div
        className="highlight-comment"
        data-testid="highlight-comment"
        style={{ top: composing.top, left: composing.left }}
      >
        <textarea
          ref={box}
          rows={2}
          aria-label="Your comment on the highlighted text"
          placeholder="Your comment"
          data-testid="highlight-comment-text"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              add()
            }
            if (event.key === "Escape") close()
          }}
        />
        <div className="highlight-comment-actions">
          <button type="button" className="quiet-action" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="instructions-save"
            data-testid="highlight-comment-add"
            onClick={add}
          >
            Add comment
          </button>
        </div>
      </div>
    )

  if (selected === undefined) return null
  return (
    <button
      type="button"
      className="selection-reply"
      data-testid="reply-with-quote"
      style={{ top: selected.top, left: selected.left }}
      // Keep the selection alive while pressing the button.
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        const quote = quoteFromSelection(selected.container, selected.range)
        if (quote === undefined) return
        setComposing({
          messageId: selected.messageId,
          quote,
          range: selected.range,
          top: selected.top,
          left: selected.left,
        })
        document.getSelection()?.removeAllRanges()
        setSelected(undefined)
      }}
    >
      Comment
    </button>
  )
}
