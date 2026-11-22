import { formatAnswers, type Message, type Questions } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useState } from "react"
import { answerAtom } from "../atoms.ts"

/**
 * A few short questions answered inline. They go back together as one message from the user,
 * so nothing new to learn: blank answers count as skipped.
 */
export function QuestionsView({ message, questions }: { message: Message; questions: Questions }) {
  const answer = useAtomSet(answerAtom, { mode: "promise" })
  const [answers, setAnswers] = useState<ReadonlyArray<string>>(() =>
    questions.questions.map(() => ""),
  )
  const [sending, setSending] = useState(false)
  const [empty, setEmpty] = useState(false)

  if (message.resolution?.skipped === true)
    return (
      <p className="choice-receipt" data-testid="questions-receipt">
        You moved on without answering
      </p>
    )

  if (message.resolution !== undefined) {
    const skipped = message.resolution.label.split("\n\n").filter((b) => b.endsWith("\n(skipped)"))
    const total = questions.questions.length
    return (
      <p className="choice-receipt" data-testid="questions-receipt">
        Answered {total - skipped.length} of {total}
      </p>
    )
  }

  const send = () => {
    if (answers.every((a) => a.trim().length === 0)) return setEmpty(true)
    setSending(true)
    answer({
      payload: {
        messageId: message.id,
        value: formatAnswers(questions, answers),
        freeText: true,
      },
    }).catch(() => setSending(false))
  }

  return (
    <fieldset className="questions" data-testid="questions" data-concept="needs-you">
      <legend className="visually-hidden">Questions from Domo</legend>
      {questions.questions.map((q, i) => (
        <label key={q.question} className="questions-item">
          <span>{q.question}</span>
          <textarea
            rows={1}
            data-testid="questions-answer"
            placeholder={q.placeholder ?? "Type here, or skip"}
            value={answers[i] ?? ""}
            disabled={sending}
            onChange={(event) => {
              const value = event.target.value
              setEmpty(false)
              setAnswers((all) => all.map((a, j) => (j === i ? value : a)))
              event.target.style.height = "auto"
              event.target.style.height = `${event.target.scrollHeight}px`
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send()
            }}
          />
        </label>
      ))}
      <div className="questions-actions">
        {empty ? <span className="choice-note">Answer at least one first.</span> : null}
        <button
          type="button"
          className="instructions-save"
          data-testid="questions-send"
          disabled={sending}
          onClick={send}
        >
          {sending ? "Sending…" : "Send answers"}
        </button>
      </div>
    </fieldset>
  )
}
