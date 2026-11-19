import { useAtom, useAtomSet } from "@effect/atom-react"
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { sendAtom } from "./atoms.ts"
import { ConnectionStatus } from "./ConnectionStatus.tsx"
import { NeedsYou } from "./NeedsYou.tsx"
import { replyAtom } from "./reply.ts"

export function Composer() {
  const send = useAtomSet(sendAtom, { mode: "promise" })
  const [text, setText] = useState("")
  const [reply, setReply] = useAtom(replyAtom)
  const area = useRef<HTMLTextAreaElement>(null)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    const replyTo =
      reply === undefined
        ? undefined
        : reply.quote === undefined
          ? { messageId: reply.messageId }
          : { messageId: reply.messageId, quote: reply.quote }
    setText("")
    setReply(undefined)
    // If the send fails (e.g. offline), put the message (and its reply target) back rather than losing it.
    send({ payload: replyTo === undefined ? { text: trimmed } : { text: trimmed, replyTo } }).catch(
      () => {
        setText((current) => (current.length === 0 ? trimmed : current))
        setReply((current) => current ?? reply)
      },
    )
    if (area.current !== null) area.current.style.height = "auto"
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
    if (event.key === "Escape" && reply !== undefined) setReply(undefined)
  }

  return (
    <div className="composer">
      <ConnectionStatus />
      <NeedsYou />
      {reply !== undefined ? (
        <div className="reply-chip" data-testid="reply-chip">
          <span>
            Replying to {reply.quote === undefined ? "" : "“"}
            {reply.preview}
            {reply.quote === undefined ? "" : "”"}
          </span>
          <button
            type="button"
            aria-label="Cancel reply"
            data-testid="reply-cancel"
            onClick={() => setReply(undefined)}
          >
            ×
          </button>
        </div>
      ) : null}
      <form onSubmit={submit}>
        <textarea
          ref={area}
          data-testid="composer-input"
          aria-label="Message Domo"
          placeholder="Message Domo…"
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            event.target.style.height = "auto"
            event.target.style.height = `${event.target.scrollHeight}px`
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" data-testid="composer-send" disabled={text.trim().length === 0}>
          Send
        </button>
      </form>
    </div>
  )
}
