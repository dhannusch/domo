# Cross-direction review

Each subagent designed its own direction, read the other implementations and inspected parent-rendered screenshots. Their reviews are preserved in each option's `critique.md`. The parent built D and reviewed all four phone and desktop screenshots. Findings are design judgments, not user-test results.

| Direction | Strongest contribution | Main critique from peers/parent | Revision |
|---|---|---|---|
| A Correspondence | Reading rhythm; unboxed prose; source correction and Reply directly accessible | Source action cluster can crowd small phones; arrows imply external navigation; grain too large | Fine tiled grain, action-wrap scrutiny, clearer local-action icons; open rhythm retained |
| B Quiet Utility | Coherent compact surfaces and predictable actions | Repeated speaker/decision labels plus footer slogan; Reply initially near composer; too much chrome for the most compact option | Removed redundant visible labels and tagline; tightened chat grouping; retained semantic speaker labels and 44px targets |
| C Soft Focus | Clearest complete phone composition; strong tactile controls | Prose initially too heavy; source opens another sheet; instructions lacked explicit save | Declared variable font weight range, regular prose, source dialog semantics, explicit Save instructions; source sheet remains a deliberate tradeoff |
| D Folio | Durable document/file emphasis; distinct angular geometry | Repeated Today/01/eyebrow pushed second phone option down; small attach target and day labels; desktop line too wide | Removed phone orientation repetitions, tightened Choice, 44px attach and 12px chart labels, bounded prose to 62ch; decorative margin number remains aria-hidden on desktop |

## Principles retained during revision

Do not shrink type or hit targets to win the first-screen fit. Do not hide Reply behind gestures. No automatic collapse or reordering. No production source files were edited. Screenshots compare the same prompt and decision; option details differ deliberately in grouping and controls. Static previews do not validate real agent transitions or the app's scroll invariants.
