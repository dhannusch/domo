import type { Message } from "@domo/domain"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { DateTime } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useLayoutEffect, useRef } from "react"
import { restoreAnchor } from "./anchor.ts"
import { anchorAtom, chatAtom, readThroughAtom, returnAtom } from "./atoms.ts"
import { Earlier } from "./Earlier.tsx"
import { MessageItem } from "./MessageItem.tsx"
import { ReturnLine } from "./ReturnLine.tsx"
import { SelectionReply } from "./SelectionReply.tsx"
import type { ChatView } from "./view.ts"

const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
})
const dayKey = (date: Date) => date.toLocaleDateString("en-CA")
const dayOf = (message: Message) => dayKey(DateTime.toDateUtc(message.createdAt))
const today = () => dayKey(new Date())

const nearBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160

/**
 * Opens at the newest message, like any chat. Late layout (fonts, visuals sizing themselves)
 * keeps it pinned to the end until the reader touches the page or it settles.
 */
function useOpenAtEnd(ready: boolean) {
  const opened = useRef(false)
  useLayoutEffect(() => {
    if (!ready || opened.current) return
    opened.current = true
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    const toEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight })
    toEnd()
    const observer = new ResizeObserver(toEnd)
    observer.observe(document.body)
    const release = () => {
      observer.disconnect()
      for (const name of RELEASE_ON) window.removeEventListener(name, release)
    }
    for (const name of RELEASE_ON) window.addEventListener(name, release, { passive: true })
    const timer = setTimeout(release, 4000)
    return () => {
      clearTimeout(timer)
      release()
    }
  }, [ready])
}
const RELEASE_ON = ["wheel", "touchstart", "pointerdown", "keydown"] as const

/** Tracks the furthest message row that has been on screen (the read cursor). */
function useReadCursor(view: ChatView) {
  const setReadThrough = useAtomSet(readThroughAtom)
  const furthest = useRef(-1)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Seen: mostly on screen, or (for tall messages) its end has scrolled into view.
          const seen =
            entry.isIntersecting &&
            (entry.intersectionRatio >= 0.6 ||
              entry.boundingClientRect.bottom <= window.innerHeight)
          if (!seen || !(entry.target instanceof HTMLElement)) continue
          const id = entry.target.dataset.rowId
          const index = id === undefined ? -1 : view.order.findIndex((m) => m === id)
          if (index > furthest.current) {
            furthest.current = index
            const message = view.order[index]
            if (message !== undefined) setReadThrough(message)
          }
        }
      },
      { threshold: [0.1, 0.6, 1] },
    )
    for (const row of document.querySelectorAll("[data-row-id]")) observer.observe(row)
    return () => observer.disconnect()
  }, [view.order, setReadThrough])
}

function Messages({ view }: { view: ChatView }) {
  const [anchor, setAnchor] = useAtom(anchorAtom)
  const returned = useAtomValue(returnAtom)
  useReadCursor(view)
  useOpenAtEnd(view.order.length > 0)

  // After a rebuild (coming back, or undoing a tidy), put the reader back where they were.
  // biome-ignore lint/correctness/useExhaustiveDependencies: must re-run when a rebuilt view renders
  useLayoutEffect(() => {
    if (anchor === undefined) return
    restoreAnchor(anchor)
    setAnchor(undefined)
  }, [view, anchor, setAnchor])

  const lastLength = useRef(0)
  const total = view.order.length + [...view.drafts.values()].reduce((n, d) => n + d.length, 0)

  // Follow new writing only if the reader is already at the end; never yank them back.
  useEffect(() => {
    if (total > lastLength.current && nearBottom())
      window.scrollTo({ top: document.documentElement.scrollHeight })
    lastLength.current = total
  }, [total])

  const returnAfter =
    returned?.afterId !== undefined && view.messages.has(returned.afterId)
      ? returned.afterId
      : undefined
  if (view.order.length === 0 && view.earlierCount === 0) {
    return (
      <p className="empty" data-testid="chat-empty">
        Ask a question or hand over a task to get started.
      </p>
    )
  }
  return (
    <>
      <Earlier count={view.earlierCount} />
      {returned !== undefined && returnAfter === undefined ? <ReturnLine /> : null}
      {view.order.map((id, index) => {
        const message = view.messages.get(id)
        if (message === undefined) return null
        const previous = index > 0 ? view.messages.get(view.order[index - 1] ?? id) : undefined
        const item = (
          <MessageItem
            key={id}
            message={message}
            draft={view.drafts.get(id)}
            question={previous?.role === "user" ? previous.text : ""}
            refiledTo={view.refiled.get(id)}
            progress={view.progress.get(id)}
          />
        )
        const divider =
          dayOf(message) !== (previous === undefined ? today() : dayOf(previous)) ? (
            <p key={`day-${id}`} className="day-divider" data-testid="day-divider">
              {dayLabel.format(DateTime.toDateUtc(message.createdAt))}
            </p>
          ) : null
        const row = divider === null ? item : [divider, item]
        return id === returnAfter ? [row, <ReturnLine key="return-line" />] : row
      })}
      <SelectionReply />
    </>
  )
}

export function Chat() {
  const result = useAtomValue(chatAtom)
  return AsyncResult.match(result, {
    onInitial: () => null,
    onFailure: () => (
      <p className="empty" data-testid="chat-offline">
        Can't reach Domo on this computer. Start it with `domo serve`, then reload.
      </p>
    ),
    onSuccess: ({ value }) => <Messages view={value} />,
  })
}
