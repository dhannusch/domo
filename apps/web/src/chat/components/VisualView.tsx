import { VISUAL_TOKENS, type Visual, visualDocument } from "@domo/domain"
import { useLayoutEffect, useMemo, useRef, useState } from "react"

/** Tallest a visual may grow; past this it is clipped, never scrolled inside. */
const MAX_HEIGHT = 2400

/** Domo's theme for the frame, read from the page so light and dark both match. */
const liveTheme = () => {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    VISUAL_TOKENS.map((name) => [name, style.getPropertyValue(name).trim()]),
  )
}

/**
 * An agent-drawn visual (diagram, explainer, chart). It runs in a sandboxed
 * frame with scripts but an opaque origin, so it can't reach Domo's storage,
 * token or network, and grows to fit its content instead of scrolling.
 */
export function VisualView({ visual }: { visual: Visual }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(160)
  const doc = useMemo(() => visualDocument(visual.html, liveTheme()), [visual.html])
  // Listen before the frame can load: a missed first report would leave it at the default height.
  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data
      if (typeof data !== "object" || data === null || !("domoVisualHeight" in data)) return
      const next = Number(data.domoVisualHeight)
      if (Number.isFinite(next) && next > 0) setHeight(Math.min(Math.ceil(next), MAX_HEIGHT))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])
  return (
    <figure className="visual" data-testid="visual">
      <iframe
        ref={frame}
        title={visual.title}
        sandbox="allow-scripts"
        srcDoc={doc}
        style={{ height }}
        onLoad={() => frame.current?.contentWindow?.postMessage("domo:measure", "*")}
        data-testid="visual-frame"
      />
      <figcaption className="visually-hidden">{visual.summary}</figcaption>
    </figure>
  )
}
