# Domo UI research — fresh review, November 21, 2026

This review preserves the pre-existing `docs/design-research.md` and `docs/design-audit.md`. Scope: exploration only; no application implementation. Sources were checked live. Older foundational guidance remains relevant; visual references are design precedents, not proof of usability superiority. Recommendations below are Domo-specific design judgments unless explicitly attributed.

## Research synthesis

### 1. Calm is an attention hierarchy, not low contrast

[Calm Technology](https://calmtech.com/) argues for minimal attention demands and peripheral awareness. Domo should keep ordinary work quiet and elevate decisions requiring a person. Quiet must mean fewer competing elements, never faint text. One conversation, one compose surface, one clear indication of outstanding input. No dashboards, tabs, thread navigation, automatic tidying or decorative motion. These constraints already align with the product.

[NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports keeping frequent actions visible while exposing secondary complexity on request. Apply to tool traces, memory contents, advanced settings and file metadata. Do not hide Reply exclusively behind hover or long press: phone users need a discoverable, keyboard-accessible action. Do not auto-collapse existing content while a person reads.

### 2. Typography and spatial rhythm

[Baymard's line-length research](https://baymard.com/research-articles/line-length-readability) recommends roughly 50–75 characters for desktop text. This is a useful starting range, not a mobile mandate or proof of an ideal pixel width. Retain a bounded reading measure, test actual Literata paragraphs, use available phone width with 20–24px gutters.

[Apple typography guidance](https://developer.apple.com/design/human-interface-guidelines/typography.md) favors legibility, hierarchy and adaptable text. Retain Literata for Domo and Instrument Sans for the person and UI. Proposed four-role scale: 13px metadata, 15px controls, 17–18px prose, 21–24px headings; inputs at least 16px. At 375px use a 28px prose line, on desktop 30px. These dimensions are proposals, not standards. Set spacing as fractions/multiples of `--line`; use proximity to group content. Full ink for user messages; position or a tonal surface identifies the speaker. Serif differentiation alone is insufficient for assistive technology: label message roles semantically.

### 3. Agent interaction: visible control without an operations console

[Microsoft HAX guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) synthesize human-AI research around appropriate expectations, control and recovery. [NN/g progress guidance](https://www.nngroup.com/articles/progress-indicators/) supports feedback during waiting. Domo application: distinguish queued, working, writing, stopped, failed and completed with plain words; never invent percentages for unbounded agent work. Keep Stop, queue and Steer unambiguous. A work receipt summarizes results, with View revealing detail. Errors explain recovery and retain drafts. Citations must open original messages; a quiet source tag is still visibly actionable.

Streaming should append without pulling a reader away from earlier content. Avoid automatic collapse, animation of message height, reordering or smooth auto-scroll while reading. Reveal controls in reserved space. Keyboard focus must remain visible above the composer. User-requested sheet opening and explicit detail expansion are separate from autonomous changes to the feed.

### 4. Generative UI belongs to the conversation

[Google's A2UI announcement](https://developers.googleblog.com/en/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) demonstrates client-rendered agent UI from a component catalog. Borrow the consistent host styling, not its architecture. Domo already has the appropriate six-component catalog. Use prose for reasoning; components for a concrete decision, structured answer, comparison, progress, visual or receipt. Do not turn each paragraph into a card.

- Choice: question in full-size type, consequences underneath, explicit recommended label plus sage boundary. Make commitment semantics clear; current options submit immediately. Mockups must preserve that unless explicitly flagged.
- Questions: persistent labels, bounded input surfaces, optional markers, one submit action. Preserve incomplete drafts.
- Comparison: align attributes on desktop; reflow into labeled candidate blocks on phone, preserving the same attributes and recommendation.
- Checklist: readable labels and explicit done/total state; no color-only status.
- Visual: named figure, theme integration, responsive content and a reserved initial footprint. Keep real sandbox protections; mock charts are illustrative only.
- WorkReceipt: short result line with View, expandable trace, file handoff. Running and failed states use text.
- FileViewer: compact attachment entry; explicit in-place viewer with stable close action and loading/failure affordances. Do not force a new tab or add a permanent inspector.

### 5. Accessibility acceptance criteria

[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for ordinary text, 3:1 for qualifying large text. [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 3:1 for cues required to identify controls/states. This does **not** require every decorative card outline to be 3:1.

[Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24×24 CSS px at AA, with exceptions; 44×44 is the enhanced target and our practical phone design goal. Do not call every smaller control a WCAG failure without examining spacing/exceptions.

[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): test 320 CSS px without page-wide horizontal scrolling, with exceptions for intrinsically two-dimensional content. Tables may scroll locally; cell text still wraps. Test 200% text and 400% browser zoom in implementation.

[Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): sticky chrome cannot entirely hide focused controls. Our goal is full visibility. [Modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): contain focus, label the dialog, Escape closes, return focus to the opener. [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): announce meaningful state changes without forcing focus. Avoid announcing each token. Respect reduced motion; test actual VoiceOver separately before claiming accessibility compliance.

### 6. Product precedents and limits

| Precedent | Observed principle / source | Domo adaptation | Do not copy |
|---|---|---|---|
| Linear | [Redesign case study](https://linear.app/now/how-we-redesigned-the-linear-ui): alignment, restrained chrome, hierarchy; prototypes stress-tested across environments | Consistent geometry, disciplined density, light/dark stress tests | Sidebar, tabs, issue-management density |
| iA Writer | [Focus documentation](https://ia.net/writer/how-to/write-with-focus): content-forward editor with optional statistics | Bounded measure, deliberate type, supporting controls recede | Fading other messages; Domo must preserve readable history |
| Apple native UI | Typography and modal-dialog guidance above | Legibility, large hit areas, coherent sheet controls | Platform-only assumptions, ornamental glass |
| Agent UI catalogs | A2UI above | One host-owned vocabulary shared by six components | Arbitrary generated navigation or a second app inside chat |

These are selected craft references; no comparative user study was performed and no logged-in private product UI was inspected. Prior notes' claims about current product behavior, forum requests, universal serif trends and automatic collapse should be treated as hypotheses until verified. This review does not depend on them.

## Brief for four distinct directions

All retain graphite/sage, cool paper grain without ruled texture, Literata/Instrument Sans, a date and settings header, one feed and the existing six components. Distinction must come from composition and interaction emphasis, not color swaps.

A. **Correspondence** — editorial reading surface, little containment, asymmetric speaker placement, generous rhythm. Best for long thoughtful exchanges; longer scroll.
B. **Quiet Utility** — crisp and compact, precise component architecture, operational clarity. Best for frequent decisions and active work; more utilitarian.
C. **Soft Focus** — tactile rounded interaction surfaces with spacious thumb-friendly inputs. Best for phone comfort; more visual containment.
D. **Folio** — document-like exchange grouping and typography; restrained angular cards, strong source/file integration. Best for durable outputs; can feel formal.

Every option must include a realistic chat plus all six components, settings and file viewer, reply/source/needs-you interactions, and state examples. Compare identical copy at 375px and desktop in light/dark. Each designer critiques the other directions and revises their own before the decision gallery is delivered. Prototypes are isolated static HTML, not production changes or backend implementations.
