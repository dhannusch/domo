import type { MessageId, ReplyTo, TextQuote } from "@domo/domain"
import { Atom } from "effect/reactivity"

/** What the composer is replying to; the one precision tool (UX: reply-to). */
export interface ReplyDraft {
  readonly messageId: MessageId
  readonly quote?: TextQuote
  /** Short text shown in the composer chip. */
  readonly preview: string
  /** What the user said about this fragment. */
  readonly comment?: string
}

/** Everything the next message replies to: one message, or several highlighted fragments. */
export const replyAtom = Atom.make<ReadonlyArray<ReplyDraft>>([])

const MAX_QUOTES = 6
const sameTarget = (a: ReplyDraft, b: ReplyDraft) =>
  a.messageId === b.messageId && a.quote?.exact === b.quote?.exact

/** Adds a target to the reply; commenting on the same fragment again replaces that comment. */
export const addReply = (drafts: ReadonlyArray<ReplyDraft>, draft: ReplyDraft) =>
  drafts.some((d) => sameTarget(d, draft))
    ? drafts.map((d) => (sameTarget(d, draft) ? draft : d))
    : [...drafts, draft].slice(-MAX_QUOTES)

/** Whether the drafts say something on their own, so the message may be sent without text. */
export const hasComments = (drafts: ReadonlyArray<ReplyDraft>) =>
  drafts.some((d) => d.comment !== undefined)

const target = (d: ReplyDraft) => ({
  messageId: d.messageId,
  ...(d.quote === undefined ? {} : { quote: d.quote }),
  ...(d.comment === undefined ? {} : { comment: d.comment }),
})

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
