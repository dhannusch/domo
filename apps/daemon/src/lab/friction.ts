/**
 * How much the user had to work around Domo: weighted friction signals per
 * user message. Lower is better; the Lab promotes changes that don't raise it.
 */
const WEIGHTS: Readonly<Record<string, number>> = {
  RestatementRejected: 3,
  Rephrased: 2,
  TidyUndone: 2,
  RouteOverridden: 2,
  WorkAbandoned: 2,
  MoreExpanded: 1,
  ModelOverridden: 1,
  ProjectOverridden: 1,
  ToolErrored: 1,
}

export const frictionScore = (
  counts: ReadonlyMap<string, number>,
  userMessages: number,
): number => {
  let total = 0
  for (const [tag, n] of counts) total += (WEIGHTS[tag] ?? 0) * n
  return userMessages === 0 ? 0 : total / userMessages
}

/** Rolled back when friction after a change is more than 10% above its baseline (constitution). */
export const regressed = (baseline: number, after: number) => after > baseline * 1.1 + 0.01

export const describeFriction = (counts: ReadonlyMap<string, number>) =>
  [...counts.entries()]
    .filter(([tag]) => WEIGHTS[tag] !== undefined)
    .sort((a, b) => (WEIGHTS[b[0]] ?? 0) * b[1] - (WEIGHTS[a[0]] ?? 0) * a[1])
    .map(([tag, n]) => `${tag}: ${n}`)
    .join(", ")
