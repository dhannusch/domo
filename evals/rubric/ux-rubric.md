# UX rubric (human-owned)

Each item can be checked by a machine through Playwright DOM assertions, telemetry, or the vision judge. Item IDs are stable, and the Lab reports scores per item. A change may not regress any item.

| ID | Check | How it's measured |
|---|---|---|
| UX-01 | At most 4 distinct interaction concepts are visible at once (messages, reply-to, needs-you marker, view) | DOM: count of `data-concept` kinds in viewport ≤ 4 |
| UX-02 | No layout shift while the user is active | Playwright: CLS = 0 during scripted active session; no fold events while `active` |
| UX-03 | At most one component per agent message | DOM |
| UX-04 | The answer leads: the first sentence answers the question | Vision/text judge, pairwise |
| UX-05 | Density caps hold: Choice ≤ 4 options, Comparison ≤ 4×4, no nested scroll or tabs | Schema + DOM |
| UX-06 | Every restatement or recall carries a source tag that opens its sources | DOM: `[data-testid=source-tag]` present and resolvable |
| UX-07 | The needs-you marker is shown only when its count is above zero, and lists every unanswered Choice | DOM + store |
| UX-08 | Folding happens only for topics that are resolved, read past, and not the last one touched | Store invariant test |
| UX-09 | Every action works without hover at 375px width | Playwright mobile project |
| UX-10 | Every component degrades to readable plain text | Render with components disabled, then judge |
| UX-11 | Push notifications only for decisions that block the user | Notifier log assertion |
| UX-12 | Accessibility: no axe-core serious or critical violations | axe-core |
| UX-13 | A Visual runs sandboxed (scripts only, opaque origin, no network) and sizes to its content, with no inner scroll | Playwright: iframe `sandbox`, CSP and height |
