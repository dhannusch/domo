import type { TopicId } from "@domo/domain"
import type { TidyCandidate } from "../chat/ChatStore.ts"

/** Unresolved topics untouched this long fold anyway (still marked unresolved, never deleted). */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Which topics a tidy folds into "Earlier". A topic folds only if all hold:
 * - it's resolved (or stale: untouched for 7 days),
 * - the user has read past its newest message,
 * - it isn't the topic they touched last,
 * - no Choice in it is still waiting for an answer.
 */
export const selectFolds = (
  candidates: ReadonlyArray<TidyCandidate>,
  options: { readonly readSeq: number; readonly nowMs: number },
): ReadonlyArray<TopicId> => {
  const lastTouched = candidates.reduce<TidyCandidate | undefined>(
    (latest, c) => (latest === undefined || c.lastActivityAt > latest.lastActivityAt ? c : latest),
    undefined,
  )
  return candidates
    .filter(
      (c) =>
        c.id !== lastTouched?.id &&
        c.openChoices === 0 &&
        c.lastSeq > 0 &&
        c.lastSeq <= options.readSeq &&
        (c.resolved || options.nowMs - Date.parse(c.lastActivityAt) > STALE_AFTER_MS),
    )
    .map((c) => c.id)
}
