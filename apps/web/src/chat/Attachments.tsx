import type { ImageRef } from "@domo/domain"
import { MAX_IMAGES } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useEffect, useRef, useState } from "react"
import { trackAtom } from "./atoms.ts"
import { uploadImage } from "./images.ts"

export interface Attachment {
  readonly key: string
  /** A local preview, shown while it uploads and until the message is sent. */
  readonly preview: string
  readonly status: "uploading" | "ready" | "failed"
  readonly ref?: ImageRef
}

type Via = "button" | "paste" | "drop"

const imagesIn = (files: Iterable<File>) => [...files].filter((f) => f.type.startsWith("image/"))

/** Images attached to the next message: each uploads as soon as it's added. */
export function useAttachments() {
  const [items, setItems] = useState<ReadonlyArray<Attachment>>([])
  const track = useAtomSet(trackAtom)
  const latest = useRef(items)
  latest.current = items
  // Free the local previews when the composer goes away.
  useEffect(
    () => () => {
      for (const a of latest.current) URL.revokeObjectURL(a.preview)
    },
    [],
  )

  const update = (key: string, change: Partial<Attachment>) =>
    setItems((all) => all.map((a) => (a.key === key ? { ...a, ...change } : a)))

  const add = (files: Iterable<File>, via: Via) => {
    const room = MAX_IMAGES - latest.current.length
    const picked = imagesIn(files).slice(0, Math.max(0, room))
    for (const file of picked) {
      const key = `${Date.now()}-${Math.random()}`
      setItems((all) => [...all, { key, preview: URL.createObjectURL(file), status: "uploading" }])
      track({ payload: { event: { _tag: "ImageAttached", via } } })
      uploadImage(file).then(
        (ref) => update(key, { status: "ready", ref }),
        () => update(key, { status: "failed" }),
      )
    }
    return picked.length
  }

  const remove = (key: string) =>
    setItems((all) => {
      const gone = all.find((a) => a.key === key)
      if (gone !== undefined) URL.revokeObjectURL(gone.preview)
      return all.filter((a) => a.key !== key)
    })

  const refs = items.flatMap((a) => (a.ref === undefined ? [] : [a.ref]))
  const busy = items.some((a) => a.status === "uploading")
  return { items, add, remove, clear: () => setItems([]), restore: setItems, refs, busy }
}

/** Thumbnails above the composer, each with a remove button. */
export function AttachmentTray({
  items,
  onRemove,
}: {
  items: ReadonlyArray<Attachment>
  onRemove: (key: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="attachment-tray" data-testid="attachments">
      {items.map((a) => (
        <div key={a.key} className="attachment" data-status={a.status} data-testid="attachment">
          <img src={a.preview} alt="" />
          {a.status === "uploading" ? <span className="attachment-note">Uploading…</span> : null}
          {a.status === "failed" ? <span className="attachment-note">Didn't upload</span> : null}
          <button
            type="button"
            aria-label="Remove this image"
            data-testid="attachment-remove"
            onClick={() => onRemove(a.key)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** A small picture icon for the attach button. */
export function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="9" cy="10" r="1.7" fill="currentColor" />
      <path
        d="M5 17.5l4.5-4.5 3 3 2.5-2.5 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
