import type { Message, SourceTag } from "@domo/domain"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { notQuiteAtom, sourceMessagesAtom } from "./atoms.ts"
import { addReply, previewOf, replyAtom } from "./reply.ts"

function Sources({ source }: { source: SourceTag }) {
  const result = useAtomValue(sourceMessagesAtom(source.messageIds.join(",")))
  return AsyncResult.match(result, {
    onInitial: () => <p className="source-detail">Opening…</p>,
    onFailure: () => <p className="source-detail">Couldn't open the original messages.</p>,
    onSuccess: ({ value }) => (
      <ul className="source-detail" data-testid="source-detail">
        {value.map((m) => (
          <li key={m.id}>
            <span className="source-role">{m.role === "user" ? "You" : "Domo"}:</span>{" "}
            {previewOf(m.text, 220)}
          </li>
        ))}
      </ul>
    ),
  })
}

/**
 * Checkable memory: a restatement shows where it came from ("From Nov 4"),
 * "view" opens the original messages, and "Not quite" corrects it in one tap.
 */
export function SourceTagView({ message, source }: { message: Message; source: SourceTag }) {
  const [open, setOpen] = useState(false)
  const notQuite = useAtomSet(notQuiteAtom)
  const setReply = useAtomSet(replyAtom)
  return (
    <span className="source-tag" data-testid="source-tag">
      <span>From {source.label}</span>
      <button
        type="button"
        className="quiet-action"
        data-testid="source-view"
        data-concept="view"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "hide" : "view"}
      </button>
      <button
        type="button"
        className="quiet-action"
        data-testid="not-quite"
        onClick={() => {
          notQuite({ payload: { messageId: message.id } })
          setReply((drafts) =>
            addReply(drafts, { messageId: message.id, preview: "what did I get wrong?" }),
          )
          document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]")?.focus()
        }}
      >
        Not quite
      </button>
      {open ? <Sources source={source} /> : null}
    </span>
  )
}
