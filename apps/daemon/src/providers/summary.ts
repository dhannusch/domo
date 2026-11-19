/** One-line, length-capped summary for tool results shown behind "view". */
export const summarize = (text: string, max = 160): string => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}
