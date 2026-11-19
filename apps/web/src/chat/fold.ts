/**
 * Answers lead with the answer. An unrequested long tail folds behind "More",
 * but code, steps, tables, numbers-heavy text and anything the user asked to see
 * in detail are never folded.
 */
const FOLD_AFTER_WORDS = 180
const LEAD_WORDS = 60
const ASKED_FOR_DETAIL =
  /\b(detail|details|detailed|explain|full|step[- ]by[- ]step|everything|thorough|in depth|walk me through)\b/i

const words = (text: string) => text.split(/\s+/).filter((w) => w.length > 0).length

export const shouldFold = (answer: string, question: string): boolean =>
  words(answer) > FOLD_AFTER_WORDS &&
  !ASKED_FOR_DETAIL.test(question) &&
  !answer.includes("```") &&
  !/^\s*\d+[.)]\s/m.test(answer) &&
  !/^\s*\|.*\|\s*$/m.test(answer)

/** Whole leading paragraphs until the lead is long enough to stand on its own. */
export const leadOf = (answer: string): string => {
  const paragraphs = answer.split(/\n{2,}/)
  const lead: Array<string> = []
  let count = 0
  for (const paragraph of paragraphs) {
    lead.push(paragraph)
    count += words(paragraph)
    if (count >= LEAD_WORDS) break
  }
  return lead.join("\n\n")
}
