# Chalk implementation

Chosen by the user: Soft Focus, refined toward flatter controls and a neutral Chalk palette. Original direction and palette prototypes stay available in this review folder.

Visual thesis: clean neutral paper, graphite text and charcoal controls, comfortable spacing with quiet 6–10px corners, no colored selection surfaces or decorative shadow.

Content plan: one dated chat with a small Domo wordmark, fully legible user turns, Literata agent prose, existing six components, quiet sources/receipts, anchored composer, and native settings/file sheets.

Interaction thesis: retain current sending, steering, approvals, source, file and settings flows; keep actions discoverable without hover. Only color feedback and existing reduced-motion-aware state indicators; no entrance choreography, automatic collapsing or feed reordering added.

Implementation preserves unrelated working-tree changes, including ZoomImage. Production CSS is separated into small topic files with central tokens in styles.css. Changes to color conventions and the seed using-domo guide accompany the implementation.

## Delivered

Chalk is implemented across the production app: tokens and six small CSS files; neutral theme/status-bar/manifest/icon colors; full-contrast user messages; flatter Choice controls; bounded Questions fields; responsive Comparison; Checklist counts; theme-aware sandboxed Visuals; quiet WorkReceipt detail; settings and file sheets. The existing ZoomImage implementation is preserved and thumbnail rules are scoped to keep viewer zoom independent. A measured composer clearance keeps multiline drafts, quotes and attachments from covering the last message.

Validation: web build and `bun run check` pass (136 unit tests passed, 5 skipped). Full browser suite: 102 passed, 2 intentionally skipped. After scoping thumbnail selectors, the 20 image/Chalk browser checks passed again. Existing queue assertions now check the accessible name of the arrow Send control. New checks cover 44px targets, neutral light/dark tokens, live Visual theme changes, phone/dialog overflow, focus restoration and multiline composer clearance (UX-09).

The review prototypes and Playwright capture artifacts are excluded from the production Biome scan; production code remains fully checked. An existing Presence.ts formatting issue was normalized without changing its in-progress behavior. Unrelated daemon/domain edits remain intact. Constitution and UX rubric were not changed. Existing README screenshots were refreshed using fictional demo data.

Implemented-app screenshots: `output/playwright/chalk-app/` from the repo root. Local scratch echo demo: http://127.0.0.1:57715/ (not the user's real agent home). No deployment, host restart or commit was performed.

File-viewer QA note: the echo `[[deck]]` fixture declares a fixed 1920×1080 canvas. Its heading is outside the initial 331px phone frame viewport, which explains the blank-looking first screenshot; it is not a loading or Chalk styling failure. The existing sandboxed HTML viewer does not automatically scale fixed-width documents. Responsive HTML and Markdown fit normally. This pre-existing limitation was not changed by the styling work.
