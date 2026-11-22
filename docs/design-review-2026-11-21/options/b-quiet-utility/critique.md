# B designer's cross-direction critique

Code and composition review, before final screenshot validation. These are critiques of the actual rendered structures and CSS; visual findings should be confirmed in the shared screenshots.

## A — Correspondence

The clearest reading atmosphere: largely unboxed components, pronounced speaker placement, and large Literata create a confident correspondence-like experience. It is meaningfully different from B's small-radius operational surfaces.

- Desktop `.prose` reaches 23px/37px. That gives short answers presence but makes a long agent session very tall. Stress-test several consecutive long replies; consider 20–21px for ordinary prose and reserve 23px for a lead paragraph.
- Desktop main and masthead widths differ (680 vs 816px), deliberately giving the header room. Confirm the date/settings do not feel disconnected from the content on a wide screen.
- Choice includes consequence plus separate Recommended line, a reassuring explicit commitment cue. On phone this creates taller repeated items; ensure Reply and the immediate-submit consequence remain easy to discover below the composer.
- Contrast and native dialogs are materially stronger than the current app. Keep the explicit source/reply actions: they protect against the common editorial-design failure of hiding controls for visual purity.

## C — Soft Focus

The strongest phone comfort: large rounded options, visibly bounded fields, and an integrated composer make every tap feel approachable. It would be the most consumer-like direction.

- The Comparison's option names are in `td` rather than `th scope="row"`. Restore row headers so the same relation works for screen readers; CSS can keep the visual style.
- Repeated rounded surfaces on Questions, Checklist, Visual, choice candidates and file entries risk making a long feed feel like a stack of floating mini-apps. Consider leaving informational checklist content unboxed while retaining containment for actions.
- Source opens a separate native dialog. This is understandable on phone, but a single quoted message may feel expensive to inspect on desktop; compare inline expansion against the modal in user testing.
- The persistent circular up-arrow sends affordance is familiar, though icon-only semantics depend on the accessible label and the user learning the action. Retain the label and show a clear disabled state for an empty composer.

## D — Folio

The most distinctive document identity: angular surfaces, exchange numbering, and durable file handoff make agent work feel organized and tangible. A useful contrast to C's softness.

- The effective desktop content area is roughly 760px at 18px prose. Verify actual line length; long agent text may exceed the intended reading measure. Bound prose separately if the richer components need that width.
- A numbered folio mark adds a fifth piece of visible vocabulary alongside messages/reply/needs-you/view. Treat it as decorative and hide it from assistive technology, or remove it if users interpret it as a navigation control.
- Choice is a card containing a pair of bordered candidate cards. This supports document grouping but duplicates enclosure and increases vertical depth; compare dropping the outer border while keeping its paper surface.
- Primary files feel especially good here. Keep the file entry concise and avoid turning every exchange into an exported-document metaphor; casual conversation should still feel natural.

## B self-critique and response

The first B screenshot had too much repeated structure: speaker labels, decision eyebrow and footer tagline. Parent review correctly identified these as chrome. The revised everyday chat removes them, keeps semantic speaker labels, preserves full-contrast user text and explicit source controls, tiles the grain, and keeps 44px hit areas. B remains the least expressive and most utilitarian choice; that is a meaningful tradeoff rather than something to hide.
