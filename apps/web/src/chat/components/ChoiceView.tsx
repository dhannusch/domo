import type { Choice, Message } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useState } from "react"
import { answerAtom, undoAnswerAtom } from "../atoms.ts"
import { previewOf, replyAtom } from "../reply.ts"

/**
 * A decision the user can make in one tap, or answer in their own words.
 * The recommended option is preselected only when the choice can be undone;
 * irreversible options state their consequence before the tap.
 */
export function ChoiceView({ message, choice }: { message: Message; choice: Choice }) {
  const answer = useAtomSet(answerAtom, { mode: "promise" })
  const setReply = useAtomSet(replyAtom)
  const undoAnswer = useAtomSet(undoAnswerAtom, { mode: "promise" })
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [undoFailed, setUndoFailed] = useState(false)

  if (message.resolution !== undefined) {
    const { label, freeText } = message.resolution
    return (
      <p className="choice-receipt" data-testid="choice-receipt">
        <span>{freeText ? `You answered: “${previewOf(label, 120)}”` : `Chose ${label}`}</span>
        {choice.reversible && !undoFailed ? (
          <button
            type="button"
            className="quiet-action"
            data-testid="choice-undo"
            onClick={() => {
              setPending(undefined)
              undoAnswer({ payload: { messageId: message.id } }).catch(() => setUndoFailed(true))
            }}
          >
            undo
          </button>
        ) : null}
        {undoFailed ? <span>This was settled before the last tidy.</span> : null}
      </p>
    )
  }

  const preselected = choice.reversible ? choice.recommended : undefined
  return (
    <fieldset className="choice" data-testid="choice" data-concept="needs-you">
      <legend>{choice.question}</legend>
      <div className="choice-options">
        {choice.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice-option${option.value === preselected ? " recommended" : ""}`}
            data-testid="choice-option"
            disabled={pending !== undefined}
            onClick={() => {
              setPending(option.value)
              answer({
                payload: { messageId: message.id, value: option.value, freeText: false },
              }).catch(() => setPending(undefined))
            }}
          >
            <span className="choice-label">{option.label}</span>
            {option.consequence !== undefined || option.value === preselected ? (
              <span className="choice-consequence">
                {[option.consequence, option.value === preselected ? "my pick" : undefined]
                  .filter((part) => part !== undefined)
                  .join(" · ")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="quiet-action"
        data-testid="choice-other"
        onClick={() => {
          setReply({ messageId: message.id, preview: choice.question })
          document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]")?.focus()
        }}
      >
        Something else
      </button>
      {!choice.reversible ? <p className="choice-note">This can't be undone.</p> : null}
    </fieldset>
  )
}
