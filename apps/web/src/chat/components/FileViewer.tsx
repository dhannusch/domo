import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { accessToken } from "../../remote/token.ts"

const GFM = [remarkGfm]
const IMAGE = /\.(png|jpe?g|gif|webp)$/i

export const fileUrl = (runId: string, index: number) =>
  `/files/${encodeURIComponent(runId)}/${index}${
    accessToken === null ? "" : `?token=${encodeURIComponent(accessToken)}`
  }`

type Loaded = { readonly kind: "text"; readonly text: string } | { readonly kind: "missing" }

/** Reads a file Domo changed, in a sheet over the chat: Markdown rendered, other text as is. */
export function FileViewer({
  name,
  url,
  onClose,
}: {
  name: string
  url: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const image = IMAGE.test(name)
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined)
  useEffect(() => {
    dialog.current?.showModal()
    if (image) return
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
  }, [url, image])

  return (
    <dialog ref={dialog} className="file-viewer" data-testid="file-viewer" onClose={onClose}>
      <div className="file-viewer-head">
        <h2>{name}</h2>
        <button type="button" className="quiet-action" onClick={() => dialog.current?.close()}>
          Done
        </button>
      </div>
      {image ? (
        <img src={url} alt={name} />
      ) : loaded === undefined ? (
        <p className="setting-note">Opening…</p>
      ) : loaded.kind === "missing" ? (
        <p className="setting-note">This file has moved or is no longer there.</p>
      ) : /\.md$/i.test(name) ? (
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
