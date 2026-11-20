import { type Message, replyTargets } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useState } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { trackAtom } from "./atoms.ts"
import { ChecklistView } from "./components/ChecklistView.tsx"
import { ChoiceView } from "./components/ChoiceView.tsx"
import { ComparisonView } from "./components/ComparisonView.tsx"
import { QuestionsView } from "./components/QuestionsView.tsx"
import { VisualView } from "./components/VisualView.tsx"
import { WorkReceiptView } from "./components/WorkReceiptView.tsx"
import { leadOf, shouldFold } from "./fold.ts"
import { modelLabel } from "./modelLabel.ts"
import { addReply, previewOf, replyAtom } from "./reply.ts"
import { SourceTagView } from "./SourceTagView.tsx"

/** Tables, strikethrough and task lists, as the models write them. */
const GFM = [remarkGfm]
const PROSE: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
}

interface Props {
  readonly message: Message
  readonly draft: string | undefined
  /** The user message this agent message answers, for the "asked for detail" check. */
  readonly question: string
  readonly refiledTo: string | undefined
  readonly progress: { readonly tools: number; readonly current: string } | undefined
}

function ComponentView({ message }: { message: Message }) {
  const component = message.component
  switch (component?._tag) {
    case "Choice":
      return <ChoiceView message={message} choice={component} />
    case "Questions":
      return <QuestionsView message={message} questions={component} />
    case "Comparison":
      return <ComparisonView comparison={component} />
    case "Checklist":
      return <ChecklistView message={message} checklist={component} />
    case "Visual":
      return <VisualView visual={component} />
    case undefined:
      return null
  }
}

/** Plain-language tool names for the live progress line. */
const activity = (tool: string) => {
  const name = tool.replace(/^mcp__[^_]+__|^[a-z0-9-]+\./, "")
  if (/^(bash|shell)$/i.test(name)) return "running a command"
  if (/^(edit|write|multiedit)$/i.test(name)) return "editing files"
  if (/^(read|grep|glob)$/i.test(name)) return "reading files"
  if (/search|fetch/i.test(name)) return "searching the web"
  if (name === "council") return "asking several models"
  if (name === "delegate") return "handing off part of the work"
  if (name === "read_skill") return "checking how to do this well"
  return `using ${name}`
}

function ReplyButton({ message }: { message: Message }) {
  const setReply = useAtomSet(replyAtom)
  return (
    <button
      type="button"
      className="quiet-action"
      data-testid="reply"
      onClick={() => {
        setReply((drafts) =>
          addReply(drafts, { messageId: message.id, preview: previewOf(message.text) }),
        )
        document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]")?.focus()
      }}
    >
      Reply
    </button>
  )
}

function UserMessage({ message }: { message: Message }) {
  const quotes =
    message.replyTo === undefined
      ? []
      : replyTargets(message.replyTo).flatMap((t) => (t.quote === undefined ? [] : [t.quote.exact]))
  return (
    <div
      className="user-message"
      data-testid="message-user"
      data-message-id={message.id}
      data-row-id={message.id}
      data-concept="message"
    >
      {quotes.map((quote) => (
        <p key={quote} className="quote" data-testid="message-quote">
          “{previewOf(quote, 160)}”
        </p>
      ))}
      <p className="user-text">{message.text}</p>
    </div>
  )
}

export function MessageItem({ message, draft, question, refiledTo, progress }: Props) {
  const track = useAtomSet(trackAtom)
  const [expanded, setExpanded] = useState(false)
  if (message.role === "user") return <UserMessage message={message} />

  const streaming = message.status === "streaming"
  const full = streaming ? (draft ?? "") : message.text
  const folded = !streaming && !expanded && shouldFold(full, question)
  const text = folded ? leadOf(full) : full

  return (
    <article
      data-testid="message-agent"
      data-status={message.status}
      data-row-id={message.id}
      data-concept="message"
    >
      <div
        data-message-id={message.id}
        className={`prose${streaming ? " caret" : ""}${message.status === "failed" ? " failed" : ""}`}
      >
        {text.length > 0 ? (
          <Markdown remarkPlugins={GFM} components={PROSE}>
            {text}
          </Markdown>
        ) : null}
      </div>
      {streaming && message.work?.status === "running" ? (
        <p className="work-progress" data-testid="task-running">
          Working on this in the background: {message.work.summary}
          {progress !== undefined ? `, ${activity(progress.current)}` : ""}
        </p>
      ) : streaming && progress !== undefined ? (
        <p className="work-progress" data-testid="work-progress">
          Working: {activity(progress.current)}
        </p>
      ) : null}
      <ComponentView message={message} />
      {folded ? (
        <button
          type="button"
          className="more"
          data-testid="more"
          onClick={() => {
            setExpanded(true)
            track({ payload: { event: { _tag: "MoreExpanded", messageId: message.id } } })
          }}
        >
          More
        </button>
      ) : null}
      {!streaming ? (
        <div className="meta">
          {message.work !== undefined ? <WorkReceiptView receipt={message.work} /> : null}
          <div className="byline">
            {message.model !== undefined ? (
              <span data-testid="message-model">
                {message.status === "failed"
                  ? `${modelLabel(message.model)} couldn't finish`
                  : modelLabel(message.model)}
              </span>
            ) : null}
            {message.sources?.[0] !== undefined ? (
              <SourceTagView message={message} source={message.sources[0]} />
            ) : null}
            {refiledTo !== undefined ? (
              <span data-testid="refiled">Filed under {refiledTo}</span>
            ) : null}
            {message.status === "done" ? <ReplyButton message={message} /> : null}
          </div>
        </div>
      ) : null}
    </article>
  )
}
