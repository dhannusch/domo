import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { AttachmentTray, ImageIcon, useAttachments } from "./Attachments.tsx"
import { modelsAtom, sendAtom } from "./atoms.ts"
import { ConnectionStatus } from "./ConnectionStatus.tsx"
import { MentionMenu, mentionMatches, mentionQuery } from "./MentionMenu.tsx"
import { NeedsYou } from "./NeedsYou.tsx"
import { hasComments, replyAtom, toReplyTo } from "./reply.ts"

export function Composer() {
  const send = useAtomSet(sendAtom, { mode: "promise" })
  const [text, setText] = useState("")
  const [reply, setReply] = useAtom(replyAtom)
  const area = useRef<HTMLTextAreaElement>(null)
  const models = useAtomValue(modelsAtom)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const attachments = useAttachments()
  const picker = useRef<HTMLInputElement>(null)
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
    const images = attachments.refs
    if ((trimmed.length === 0 && images.length === 0 && !hasComments(reply)) || attachments.busy)
      return
    const replyTo = toReplyTo(reply)
    const attached = attachments.items
    setText("")
    setReply([])
    attachments.clear()
    // If the send fails (e.g. offline), put the message, its reply target and its images back.
    send({
      payload: {
        text: trimmed,
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(images.length === 0 ? {} : { images }),
      },
    }).catch(() => {
      setText((current) => (current.length === 0 ? trimmed : current))
      setReply((current) => (current.length === 0 ? reply : current))
      attachments.restore((current) => (current.length === 0 ? attached : current))
    })
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
    if (event.key === "Escape" && reply.length > 0) setReply([])
  }

  return (
    <div className="composer">
      <ConnectionStatus />
      <NeedsYou />
      {reply.map((draft, index) => (
        <div
          key={`${draft.messageId}-${draft.quote?.exact ?? ""}`}
          className="reply-chip"
          data-testid="reply-chip"
        >
          <span>
            {index === 0 ? "Replying to " : "and "}
            {draft.quote === undefined ? "" : "“"}
            {draft.preview}
            {draft.quote === undefined ? "" : "”"}
            {draft.comment === undefined ? null : (
              <span className="reply-chip-comment"> · {draft.comment}</span>
            )}
          </span>
          <button
            type="button"
            aria-label="Remove this quote"
            data-testid="reply-cancel"
            onClick={() => setReply((drafts) => drafts.filter((d) => d !== draft))}
          >
            ×
          </button>
        </div>
      ))}
      {suggestions.length > 0 ? (
        <MentionMenu
          options={suggestions}
          active={Math.min(active, suggestions.length - 1)}
          onPick={pick}
        />
      ) : null}
      <AttachmentTray items={attachments.items} onRemove={attachments.remove} />
      <form
        onSubmit={submit}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return
          event.preventDefault()
          attachments.add(event.dataTransfer.files, "drop")
        }}
      >
        <button
          type="button"
          className="composer-attach"
          aria-label="Attach an image"
          data-testid="composer-attach"
          onClick={() => picker.current?.click()}
        >
          <ImageIcon />
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="composer-file"
          onChange={(event) => {
            if (event.target.files !== null) attachments.add(event.target.files, "button")
            event.target.value = ""
          }}
        />
        <textarea
          ref={area}
          data-testid="composer-input"
          aria-label="Message Domo"
          placeholder={hasComments(reply) ? "Anything else? (optional)" : "Message Domo…"}
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
          onPaste={(event) => {
            // A pasted screenshot attaches; pasted text behaves as usual.
            if (attachments.add(event.clipboardData.files, "paste") > 0) event.preventDefault()
          }}
        />
        <button
          type="submit"
          data-testid="composer-send"
          disabled={
            (text.trim().length === 0 && attachments.refs.length === 0 && !hasComments(reply)) ||
            attachments.busy
          }
        >
          Send
        </button>
      </form>
    </div>
  )
}
