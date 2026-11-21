import type { FileRef } from "@domo/domain"
import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { accessToken } from "../../remote/token.ts"

const GFM = [remarkGfm]

const withToken = (path: string) =>
  accessToken === null ? path : `${path}?token=${encodeURIComponent(accessToken)}`

export const fileUrl = (runId: string, index: number) =>
  withToken(`/files/${encodeURIComponent(runId)}/${index}`)

export const attachmentUrl = (file: FileRef) => withToken(`/attachments/${file.id}`)

/** How a file is shown: pictures as pictures, pages and decks live, text read. */
export type ViewKind = "image" | "page" | "pdf" | "markdown" | "text"

export const kindOf = (name: string, mediaType?: string): ViewKind => {
  const type = mediaType ?? ""
  if (type === "text/html" || /\.html?$/i.test(name)) return "page"
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf"
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image"
  if (type === "text/markdown" || /\.md$/i.test(name)) return "markdown"
  return "text"
}

/** A short word for the card: "Deck", "PDF". */
export const kindLabel = (kind: ViewKind, name: string) =>
  kind === "page"
    ? "Page"
    : kind === "pdf"
      ? "PDF"
      : kind === "image"
        ? /\.svg$/i.test(name)
          ? "SVG"
          : "Image"
        : kind === "markdown"
          ? "Document"
          : "Text"

type Loaded = { readonly kind: "text"; readonly text: string } | { readonly kind: "missing" }

/**
 * Domo's one viewer, in a sheet over the chat: images, live pages and decks (sandboxed), PDFs,
 * Markdown rendered and other text as is. Nothing opens a new window unless you ask it to.
 */
export function FileViewer({
  name,
  url,
  kind,
  onClose,
}: {
  name: string
  url: string
  kind: ViewKind
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined)
  const reads = kind === "markdown" || kind === "text"
  useEffect(() => {
    dialog.current?.showModal()
    if (!reads) return
    let live = true
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(
        (text) => live && setLoaded({ kind: "text", text }),
        () => live && setLoaded({ kind: "missing" }),
      )
    return () => {
      live = false
    }
  }, [url, reads])

  const wide = kind === "page" || kind === "pdf"
  return (
    <dialog
      ref={dialog}
      className={`file-viewer${wide ? " wide" : ""}`}
      data-testid="file-viewer"
      onClose={onClose}
    >
      <div className="file-viewer-head">
        <h2>{name}</h2>
        <div className="file-viewer-actions">
          {wide ? (
            <a className="quiet-action" href={url} target="_blank" rel="noreferrer">
              Open in a tab
            </a>
          ) : null}
          <button type="button" className="quiet-action" onClick={() => dialog.current?.close()}>
            Done
          </button>
        </div>
      </div>
      {kind === "image" ? (
        <img src={url} alt={name} />
      ) : kind === "page" ? (
        <iframe
          className="file-frame"
          title={name}
          src={url}
          sandbox="allow-scripts"
          data-testid="file-frame"
        />
      ) : kind === "pdf" ? (
        <iframe className="file-frame" title={name} src={url} data-testid="file-frame" />
      ) : loaded === undefined ? (
        <p className="setting-note">Opening…</p>
      ) : loaded.kind === "missing" ? (
        <p className="setting-note">This file has moved or is no longer there.</p>
      ) : kind === "markdown" ? (
        <div className="prose" data-testid="file-text">
          <Markdown remarkPlugins={GFM}>{loaded.text}</Markdown>
        </div>
      ) : (
        <pre className="file-plain" data-testid="file-text">
          {loaded.text}
        </pre>
      )}
    </dialog>
  )
}
