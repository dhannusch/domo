import type { MessageId, TextQuote } from "@domo/domain"
import { Atom } from "effect/reactivity"

/** What the composer is replying to; the one precision tool (UX: reply-to). */
export interface ReplyDraft {
  readonly messageId: MessageId
  readonly quote?: TextQuote
  /** Short text shown in the composer chip. */
  readonly preview: string
}

export const replyAtom = Atom.make<ReplyDraft | undefined>(undefined)

const CONTEXT = 32

/**
 * Builds a W3C-style text-quote selector for the selection inside a message,
 * so the reply stays anchored to the fragment even if offsets change later.
 */
export const quoteFromSelection = (container: Element, range: Range): TextQuote | undefined => {
  const exact = range.toString().trim()
  if (exact.length < 2) return undefined
  const before = document.createRange()
  before.selectNodeContents(container)
  before.setEnd(range.startContainer, range.startOffset)
  const full = container.textContent ?? ""
  const start = before.toString().length
  const end = start + range.toString().length
  return {
    exact,
    prefix: full.slice(Math.max(0, start - CONTEXT), start),
    suffix: full.slice(end, end + CONTEXT),
  }
}

export const previewOf = (text: string, max = 80): string => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}
