import { useLayoutEffect, useRef } from "react"

/** Leave room for quotes, attachments and a growing draft without hiding the last message. */
export function useComposerSize() {
  const shell = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = shell.current
    if (element === null) return
    const measure = () => {
      document.documentElement.style.setProperty(
        "--composer-height",
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--composer-height")
    }
  }, [])
  return shell
}
