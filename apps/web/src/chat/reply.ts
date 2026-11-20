import type { MessageId, ReplyTo, TextQuote } from "@domo/domain"
import { Atom } from "effect/reactivity"

/** What the composer is replying to; the one precision tool (UX: reply-to). */
export interface ReplyDraft {
  readonly messageId: MessageId
  readonly quote?: TextQuote
  /** Short text shown in the composer chip. */
  readonly preview: string
}

/** Everything the next message replies to: one message, or several highlighted fragments. */
export const replyAtom = Atom.make<ReadonlyArray<ReplyDraft>>([])

const MAX_QUOTES = 6
const sameTarget = (a: ReplyDraft, b: ReplyDraft) =>
  a.messageId === b.messageId && a.quote?.exact === b.quote?.exact

/** Adds a target to the reply (picking the same one again changes nothing). */
export const addReply = (drafts: ReadonlyArray<ReplyDraft>, draft: ReplyDraft) =>
  drafts.some((d) => sameTarget(d, draft)) ? drafts : [...drafts, draft].slice(-MAX_QUOTES)

const target = (d: ReplyDraft) =>
  d.quote === undefined ? { messageId: d.messageId } : { messageId: d.messageId, quote: d.quote }

/** The wire shape: the first target places the reply, the rest ride along as `also`. */
export const toReplyTo = (drafts: ReadonlyArray<ReplyDraft>): ReplyTo | undefined => {
  const [first, ...rest] = drafts
  if (first === undefined) return undefined
  return rest.length === 0 ? target(first) : { ...target(first), also: rest.map(target) }
}

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
