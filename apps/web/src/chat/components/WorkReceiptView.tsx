import type { WorkReceipt } from "@domo/domain"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { runAtom, trackAtom } from "../atoms.ts"
import { modelLabel } from "../modelLabel.ts"
import { FileViewer, fileUrl } from "./FileViewer.tsx"

/** Summaries are previews, so drop markdown syntax rather than render it. */
const plain = (text: string) =>
  text
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()

/** "~/.domo/topics/x" rather than "/Users/name/.domo/topics/x". */
const shortPath = (path: string) => path.replace(/^\/(Users|home)\/[^/]+/, "~")
const fileName = (path: string) => path.split("/").at(-1) ?? path
const folderOf = (path: string) => path.split("/").slice(0, -1).join("/")

/** The changed files by name, with their folder once when they share one. */
function FilesLine({ runId, files }: { runId: string; files: ReadonlyArray<string> }) {
  const folders = new Set(files.map(folderOf))
  const [only] = folders
  const [open, setOpen] = useState<number | undefined>(undefined)
  const opened = open === undefined ? undefined : files[open]
  return (
    <div className="run-files" data-testid="run-files">
      <span className="run-label">Changed </span>
      {files.map((file, i) => (
        <span key={file}>
          {i > 0 ? ", " : ""}
          <button
            type="button"
            className="run-file"
            title={`Open ${shortPath(file)}`}
            data-testid="run-file"
            onClick={() => setOpen(i)}
          >
            {folders.size === 1 ? fileName(file) : shortPath(file)}
          </button>
        </span>
      ))}
      {open !== undefined && opened !== undefined ? (
        <FileViewer
          name={fileName(opened)}
          url={fileUrl(runId, open)}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
      {folders.size === 1 && only !== undefined && only.length > 0 ? (
        <span className="run-where"> in {shortPath(only)}</span>
      ) : null}
    </div>
  )
}

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
          <ol className="run-steps">
            {value.tools.map((tool, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a run's tool calls are an immutable, ordered log
                key={`${i}-${tool.name}`}
                className="run-step"
                data-ok={tool.ok}
              >
                <span className="run-action">
                  {tool.action ?? tool.name}
                  {tool.ok ? "" : " (failed)"}
                </span>
                {tool.detail !== undefined ? <code className="run-what">{tool.detail}</code> : null}
                {/* Output is noise when it worked; it's the reason when it didn't. Older runs
                    have no action, so their output is all there is to show. */}
                {(!tool.ok || tool.action === undefined) && tool.summary.length > 0 ? (
                  <span className="run-output">{plain(tool.summary)}</span>
                ) : null}
              </li>
            ))}
            {(value.delegations ?? []).map((d, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a run's delegations are an immutable, ordered log
                key={`d${i}-${d.model}`}
                className="run-step"
                data-ok={d.ok}
                data-testid="run-delegation"
              >
                <span className="run-action">
                  {d.kind === "council"
                    ? `Asked ${modelLabel(d.model)}: ${d.task}`
                    : `Handed to ${modelLabel(d.model)}`}
                  {d.ok ? "" : " (failed)"}
                </span>
                <span className="run-output">{plain(d.summary)}</span>
              </li>
            ))}
          </ol>
          {value.files.length > 0 ? <FilesLine runId={value.id} files={value.files} /> : null}
          <p className="run-usage">
            {modelLabel(value.model)}
            {value.usage !== undefined
              ? `, ${value.usage.inputTokens.toLocaleString()} tokens in, ${value.usage.outputTokens.toLocaleString()} out`
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
