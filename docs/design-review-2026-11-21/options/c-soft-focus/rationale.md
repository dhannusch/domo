# C · Soft Focus

Visual thesis: cool paper, rounded tactile controls and full-strength ink make Domo feel comfortable in the hand, while the agent's words stay unboxed.

Content plan: one dated conversation, a distinct but restrained user bubble, one readable response and a concrete choice. The source and reply controls sit in the reading flow; needs-you belongs with the composer. A separate specimen mode renders every component and state without introducing navigation to the product.

Interaction thesis: a contained composer anchors the page; option buttons respond to touch with a quiet surface change; native sheets fade in without moving the feed. No automatic resizing animations or scroll-linked motion. Reduced-motion removes the sheet fade.

## Why this direction

- The most phone-oriented option: full-width stacked choices, 44px actions, generous form fields, bottom-aligned sheets.
- Sage is used as an interaction surface, not decoration. Selected options have a textual recommendation plus a 2px boundary.
- User messages use a softly shaped bubble; Domo's prose stays on the page. Files have a single explicit entry point into an in-place viewer.
- Comparison and checklist use the same visual vocabulary without becoming the same component.
- Dark mode is green charcoal with soft sage rather than black or navy.

## Tradeoffs

The interaction surfaces are more visible than Correspondence, and roomy inputs lengthen component-heavy conversations. Rounded forms make this feel more personal and less document-like than Folio. Desktop gains a side-by-side choice layout but preserves the reading measure, so it does not make operational work as compact as Quiet Utility.

## Prototype limitations

The mock is isolated HTML/CSS/JS; it does not connect to Domo, emit telemetry, persist settings or apply real guardrails. Send appends an example user message; no agent is run. Attach adds a named example image chip without opening a picker. File content is authored sample Markdown rendered as HTML. The Visual is an illustrative figure, not a sandboxed agent iframe. State specimens are examples rather than a state machine. Source View opens the agreed original sample message. Choice submits immediately and disables options while retaining their height and content; no existing feed content is removed or reordered. Questions keep their fields and show a receipt line after submission.

The stylesheet uses tokens; source text is 13px or above except the explicit 12px recommendation/day labels. Full accessibility compliance is not claimed. Parent captures are needed to validate rendering, overflow and interaction sizes.

## Critique and revision

Initial version ready for the design council. Revisions will be documented here after peer review.

Peer review from Correspondence and parent screenshot inspection led to four revisions: added explicit Save instructions and a preview save receipt; marked source/file/settings actions as dialog openers; declared the local variable fonts' weight ranges and regular 18px desktop prose to remove unintended heaviness; tiled fine 160px grain at lower opacity. Kept the separate Reply row because the initial phone capture already fits the full Choice and action, and its generous target is central to this direction. Source correction remains inside its modal: it preserves reading position but costs an extra open/close compared with inline provenance. State coverage now includes connection recovery, Earlier/return, pairing, proposed instructions and notification offer.

Quiet Utility's review prompted two further changes: comparison candidates now use proper row-header semantics (`th scope="row"`), and the informational Checklist is unboxed. The latter reduces the impression of stacked miniature apps while keeping tactile containment for inputs and the Visual. Inline sources remain a valid alternative if the chosen direction favors desktop speed over the modal's context separation.
