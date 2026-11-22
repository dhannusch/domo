# Current UI audit — November 21, 2026

Audited the current **working tree**, including pre-existing uncommitted changes. Built with `bun run build:web` (passed, bundle-size advisory only). Ran a fresh scratch home on a free local port with the echo provider, token off, visual check off. No live models or real personal data. Screenshots: `../../output/playwright/design-review-2026-11-21/baseline-*`. Sizes: 375×812 and 1440×1000, system light/dark. This updates evidence without replacing the earlier audit.

## Findings grounded in fresh screenshots and source

| Priority | Finding | Evidence | Design response |
|---|---|---|---|
| High | User messages read as muted annotations, at 15.2px in `--pencil`; Domo's response has much stronger presence | phone-light-top / desktop-dark-top, `.user-message` | Full-contrast user text; distinguish with position or tone |
| High | Important touch controls are undersized for our 44px phone goal | DOM measurement: Reply 52.4×21.5, Settings 36×36, attach 22×31.6, textarea height 36, Send 39×32.8; receipt View ~48×22.6 | 44px hit areas, 16px input text, visible focus. These measurements alone do not establish WCAG failure because spacing exceptions exist |
| High | Light theme small sage text has insufficient contrast | Tokens: accent #5c7a62 on #ecede8 ≈4.04:1; pencil #6a6d70 on paper ≈4.42:1; pencil on #e1e3dc ≈4.02:1 | Darker light-theme accent/secondary ink; test each actual foreground/background combination |
| High | Composer has only an underline boundary and competes with content behind its fade | phone-light-top, `.composer form` | Clearly bounded composing surface, opaque base, sufficient content clearance |
| Medium | Repeated model label + Reply creates a second visual rhythm below every answer | both top screenshots, MessageItem.tsx | Retain discoverable Reply, make metadata quieter and coordinated. Model display is a convention/product decision: model names are not necessarily aliases |
| Medium | Components lack a common hierarchy | baseline-choice, questions, comparison, checklist, receipt-expanded | Shared type/spacing/actions. Preserve six semantic kinds rather than forcing every result into the same heavy box |
| Medium | Choice's question is smaller than surrounding prose; recommendation mixes consequence and “my pick” | baseline-choice | Full-size prompt, consistent recommendation label. Preserve immediate-submit behavior and reversibility warnings |
| Medium | Questions inputs look like blank lines rather than editable fields | baseline-questions | Persistent labels, bounded fields, one clear submit; optional answers remain optional |
| Medium | Mobile comparison loses a clear grouping and puts “Recommended” in tiny text | baseline-phone-comparison | Compact grouped candidates, aligned labels, explicit recommendation |
| Medium | Receipt uses a surrounding box and a small nested View button for little content | baseline-receipt-expanded | One quiet summary row, expandable details with files and outcome |
| Medium | Settings is a narrow centered scrolling modal with a wrapping, uneven model grid | phone-light-settings and dark equivalent | Phone sheet with stable heading/Done, coherent grouped choices, less explanatory copy. No new persistent panel |
| Medium | FileViewer header actions crowd its title on phone | phone-fileviewer | Stable close, wrapping-safe title/actions; explicit loading/failure view |
| Medium | Tiny 2×2 test image expands to full column width | phone-light-choice (attachment visible), `.message-images.large img` | Bound displayed image height; inspect real image ratios during implementation |
| Low | Many near-identical font sizes and separate spacing rules create inconsistency | styles.css | Four core type roles; `--line` rhythm and shared control geometry |

## Corrections to earlier conclusions

- The Visual screenshot is 397px tall, but **the echo fixture deliberately includes a 240px spacer** (`EchoProvider.ts`, `[[visual]]`). This is not evidence of a broken height reporter or autonomous layout movement. A screenshot cannot prove page movement. Test height reporting with non-spacer content before filing a bug.
- A left border on a message is a component boundary, not necessarily forbidden ruled-paper texture. No need to invent a product violation to justify improving speaker distinction.
- Not every pale card border must achieve 3:1. WCAG non-text contrast applies where a cue is required to identify the control/state. Evaluate function and alternative cues.
- Auto-collapsing an answered card may move existing content. Preserve current feed invariants; any future transition needs explicit scroll-anchor and active-reader verification.
- The model byline uses display names; calling all model names “aliases” would overstate the current convention.

## What already works

A bounded 608px desktop reading measure; serif/sans differentiation; restrained sage and night paper; real native dialogs; local table scrolling; reduced-motion handling for caret; queued and working text; explicit file opening; existing stable test IDs. Keep the one-chat model and source traceability.

## Coverage and limitations

Exercised `[[choice]]`, `[[questions]]`, `[[comparison]]`, `[[checklist]]`, `[[visual]]`, `[[table]]`, `[[long]]`, `[[slow]]`, `[[work]]`, `[[attach]]`, `[[deck]]`. Captured open Choice and Questions, expanded receipt, needs-you, queued/working, settings and file viewer. Later messages intentionally close earlier questions under the app's current behavior, so component captures supplement full-feed screenshots.

No page-wide horizontal overflow measured at 375px (375px scroll width). This is not a full accessibility audit: no physical iPhone keyboard test, VoiceOver session, automated axe run, or proof of focus restoration across every modal. Production implementation will need those plus reflow, contrast, touch and UX rubric tests. Static direction prototypes cannot validate daemon behavior, telemetry or secure sandboxing.
