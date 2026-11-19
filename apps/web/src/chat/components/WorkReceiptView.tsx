import type { WorkReceipt } from "@domo/domain"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { runAtom, trackAtom } from "../atoms.ts"
import { modelLabel } from "../modelLabel.ts"

/** Summaries are previews, so drop markdown syntax rather than render it. */
const plain = (text: string) =>
  text
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()

function RunDetailView({ receipt }: { receipt: WorkReceipt }) {
  const result = useAtomValue(runAtom(receipt.runId))
  return AsyncResult.match(result, {
    onInitial: () => <p className="run-detail">Loading…</p>,
    onFailure: () => <p className="run-detail">Couldn't load the details for this work.</p>,
    onSuccess: ({ value }) =>
      value === null ? (
        <p className="run-detail">No details were kept for this work.</p>
      ) : (
        <div className="run-detail" data-testid="run-detail">
          <ul>
            {value.tools.map((tool, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a run's tool calls are an immutable, ordered log
                key={`${i}-${tool.name}`}
              >
                <span className={tool.ok ? undefined : "run-failed"}>
                  {tool.ok ? tool.name : `${tool.name} (failed)`}
                </span>
                {tool.summary.length > 0 ? (
                  <span className="run-summary">{plain(tool.summary)}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {value.delegations !== undefined && value.delegations.length > 0 ? (
            <ul data-testid="run-delegations">
              {value.delegations.map((d, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: a run's delegations are an immutable, ordered log
                  key={`${i}-${d.model}`}
                >
                  <span className={d.ok ? undefined : "run-failed"}>
                    {d.kind === "council"
                      ? `${modelLabel(d.model)} (${d.task})`
                      : `Handed to ${modelLabel(d.model)}`}
                  </span>
                  <span className="run-summary">{plain(d.summary)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {value.files.length > 0 ? <p>Files: {value.files.join(", ")}</p> : null}
          <p>
            {modelLabel(value.model)}
            {value.usage !== undefined
              ? `, ${value.usage.inputTokens.toLocaleString()} tokens in and ${value.usage.outputTokens.toLocaleString()} out`
              : ""}
          </p>
        </div>
      ),
  })
}

/** One line for any agent work; "view" shows the tools, files and usage behind it. */
export function WorkReceiptView({ receipt }: { receipt: WorkReceipt }) {
  const [open, setOpen] = useState(false)
  const track = useAtomSet(trackAtom)
  return (
    <div className="work-receipt" data-testid="work-receipt">
      <span>
        {receipt.project !== undefined
          ? `${receipt.summary} in ${receipt.project}`
          : receipt.summary}
      </span>
      <button
        type="button"
        className="quiet-action"
        data-testid="work-view"
        data-concept="view"
        aria-expanded={open}
        onClick={() => {
          if (!open) track({ payload: { event: { _tag: "ViewOpened", componentId: receipt.id } } })
          setOpen(!open)
        }}
      >
        {open ? "hide" : "view"}
      </button>
      {open ? <RunDetailView receipt={receipt} /> : null}
    </div>
  )
}
