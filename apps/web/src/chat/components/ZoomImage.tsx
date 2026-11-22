import { type PointerEvent, useEffect, useRef, useState } from "react"

const MAX_SCALE = 8
/** A tap or double click zooms to this (or back to fit). */
const TAP_SCALE = 2.5

const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(1, scale))

/**
 * A picture that fills the viewer and can be looked at closely: it starts fitted to the screen;
 * tap (or double click) zooms in at that spot and back, pinch or trackpad-pinch (or ctrl/⌘ +
 * scroll) zooms smoothly, and a zoomed picture pans by dragging or scrolling.
 */
export function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState<{ width: number; height: number }>()
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | undefined>(undefined)
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean }>(
    undefined,
  )

  /** Fitted size of the picture inside the frame, measured once it loads. */
  const measure = (image: HTMLImageElement) => {
    const box = frame.current
    if (box === null || image.naturalWidth === 0) return
    const ratio = Math.min(
      box.clientWidth / image.naturalWidth,
      box.clientHeight / image.naturalHeight,
      1,
    )
    setFit({ width: image.naturalWidth * ratio, height: image.naturalHeight * ratio })
  }

  /** Zooms to `next`, keeping the point under (x, y) in the frame where it was. */
  const zoomAt = (next: number, x: number, y: number) => {
    const box = frame.current
    if (box === null) return
    const target = clamp(next)
    const rect = box.getBoundingClientRect()
    const px = x - rect.left
    const py = y - rect.top
    const ratio = target / scale
    const left = (box.scrollLeft + px) * ratio - px
    const top = (box.scrollTop + py) * ratio - py
    setScale(target)
    requestAnimationFrame(() => {
      box.scrollLeft = left
      box.scrollTop = top
    })
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    const points = [...pointers.current.values()]
    if (points.length === 2 && points[0] !== undefined && points[1] !== undefined) {
      pinch.current = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale,
      }
      drag.current = undefined
    } else if (points.length === 1 && frame.current !== null) {
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        left: frame.current.scrollLeft,
        top: frame.current.scrollTop,
        moved: false,
      }
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    if (pinch.current !== undefined && points[0] !== undefined && points[1] !== undefined) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      zoomAt(
        (pinch.current.scale * distance) / pinch.current.distance,
        (points[0].x + points[1].x) / 2,
        (points[0].y + points[1].y) / 2,
      )
      return
    }
    const start = drag.current
    const box = frame.current
    if (start === undefined || box === null) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true
    box.scrollLeft = start.left - dx
    box.scrollTop = start.top - dy
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = undefined
    const start = drag.current
    drag.current = undefined
    // A tap (no drag, no pinch): zoom in at that spot, or back to fit.
    if (start !== undefined && !start.moved && pointers.current.size === 0)
      zoomAt(scale > 1 ? 1 : TAP_SCALE, event.clientX, event.clientY)
  }

  // Trackpad pinch arrives as ctrl + wheel; ⌘ + scroll zooms too; plain scroll pans. Native and
  // non-passive, so the browser doesn't zoom the whole page instead.
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  useEffect(() => {
    const box = frame.current
    if (box === null) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomRef.current(
        scaleRef.current * Math.exp(-event.deltaY / 150),
        event.clientX,
        event.clientY,
      )
    }
    box.addEventListener("wheel", onWheel, { passive: false })
    return () => box.removeEventListener("wheel", onWheel)
  }, [])

  /** The zoom buttons work around the middle of what's on screen. */
  const zoomCenter = (next: number) => {
    const rect = frame.current?.getBoundingClientRect()
    if (rect !== undefined) zoomAt(next, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  const zoomed = scale > 1
  return (
    <div className="zoom-image">
      <div className="zoom-tools">
        <button
          type="button"
          className="quiet-action"
          aria-label="Zoom out"
          data-testid="zoom-out"
          disabled={!zoomed}
          onClick={() => zoomCenter(scale / 1.5)}
        >
          −
        </button>
        <button
          type="button"
          className="quiet-action"
          data-testid="zoom-fit"
          disabled={!zoomed}
          onClick={() => zoomCenter(1)}
        >
          {zoomed ? `${Math.round(scale * 100)}%` : "Fit"}
        </button>
        <button
          type="button"
          className="quiet-action"
          aria-label="Zoom in"
          data-testid="zoom-in"
          disabled={scale >= MAX_SCALE}
          onClick={() => zoomCenter(scale * 1.5)}
        >
          +
        </button>
      </div>
      <div
        ref={frame}
        className={`zoom-frame${zoomed ? " zoomed" : ""}`}
        data-testid="zoom-frame"
        data-scale={scale.toFixed(2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => measure(event.currentTarget)}
          style={
            fit === undefined
              ? undefined
              : { width: fit.width * scale, height: fit.height * scale, maxWidth: "none" }
          }
        />
      </div>
    </div>
  )
}
