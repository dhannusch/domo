import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { modelsAtom, sendAtom } from "./atoms.ts"
import { ConnectionStatus } from "./ConnectionStatus.tsx"
import { MentionMenu, mentionMatches, mentionQuery } from "./MentionMenu.tsx"
import { NeedsYou } from "./NeedsYou.tsx"
import { replyAtom } from "./reply.ts"

export function Composer() {
  const send = useAtomSet(sendAtom, { mode: "promise" })
  const [text, setText] = useState("")
  const [reply, setReply] = useAtom(replyAtom)
  const area = useRef<HTMLTextAreaElement>(null)
  const models = useAtomValue(modelsAtom)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const query = dismissed ? undefined : mentionQuery(text)
  const suggestions =
    query === undefined || !AsyncResult.isSuccess(models) ? [] : mentionMatches(models.value, query)
  const pick = (key: string) => {
    setText(`@${key} `)
    setActive(0)
    area.current?.focus()
  }

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
    if (suggestions.length > 0) {
      const move = { ArrowDown: 1, ArrowUp: -1 }[event.key]
      if (move !== undefined) {
        event.preventDefault()
        return setActive((i) => (i + move + suggestions.length) % suggestions.length)
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        const chosen = suggestions[Math.min(active, suggestions.length - 1)]
        if (chosen !== undefined) pick(chosen.key)
        return
      }
      if (event.key === "Escape") return setDismissed(true)
    }
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
      {suggestions.length > 0 ? (
        <MentionMenu
          options={suggestions}
          active={Math.min(active, suggestions.length - 1)}
          onPick={pick}
        />
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
            setDismissed(false)
            setActive(0)
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
