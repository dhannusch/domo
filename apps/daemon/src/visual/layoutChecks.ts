/**
 * Runs inside the rendered visual (as a string, so the daemon needs no DOM
 * types) and returns plain-language layout problems: content wider than the
 * frame, text too small to read, and labels that overlap each other.
 */
export const LAYOUT_CHECKS = `(() => {
  const problems = []
  const doc = document.documentElement
  // The frame hides overflow, so measure how far elements reach instead of scrollWidth.
  let right = 0
  const all = document.body.querySelectorAll("*")
  for (let i = 0; i < all.length && i < 2000; i++) {
    const el = all[i]
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue
    right = Math.max(right, el.getBoundingClientRect().right)
  }
  if (right > doc.clientWidth + 2)
    problems.push("Content is " + Math.round(right - doc.clientWidth) + "px wider than the frame, so it is cut off.")
  const texts = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode() && texts.length < 300) {
    const node = walker.currentNode
    const text = (node.textContent || "").trim()
    const el = node.parentElement
    if (!text || !el || el.closest("script,style")) continue
    const style = getComputedStyle(el)
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue
      texts.push({ text: text.slice(0, 40), r, el })
      if (r.right > doc.clientWidth + 2 || r.left < -2)
        problems.push('"' + text.slice(0, 40) + '" runs off the edge.')
    }
  }
  for (const t of texts) if (t.r.height < 11) problems.push('"' + t.text + '" is only ' + Math.round(t.r.height) + "px tall, too small to read.")
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j]
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (w <= 0 || h <= 0) continue
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height)
      if (w * h > smaller * 0.2) problems.push('"' + a.text + '" overlaps "' + b.text + '".')
    }
  return [...new Set(problems)].slice(0, 8)
})()`
