---
name: brand-identity
description: Create or refine a visual brand system, logo, wordmark, typography, color, graphic language, applications, and editable asset kit from an approved foundation. Use for branding and visual identity work; do not use for ordinary UI styling or a one-off image unrelated to a brand system.
---

# Brand identity

Read the approved topic-local `brand-pack/foundation.md`, `voice.md`, and `graphic-language.md`
before drawing. If they do not exist, ask the user whether to establish the foundation first and use
`brand-foundation` rather than inventing strategic assumptions silently.

Read [references/visual-system.md](references/visual-system.md), then read only the asset-routing or
provenance reference needed for the current request. Use the shared pack templates under
`../brand-foundation/templates/brand-pack/` when initializing a new pack.

## Route the asset before choosing a tool

- Logo, symbol, wordmark, favicon, or icon: SVG source first.
- Social card, cover, one-pager, or composed layout: HTML/CSS or SVG source.
- Photography, texture, or illustration: optional connected image backend, only when available and
  appropriate; record its model and license.

Do not use diffusion output as the canonical logo or wordmark. Preserve editable source and attach a
PNG preview when Domo's chat cannot display SVG directly.

## Direction workflow

1. Extract one visual mechanism from the approved foundation.
2. Generate 3 genuinely different directions, not recolors of one idea.
3. For each direction record the mechanism, mark idea, type, palette roles, application, distinction,
   and one honest risk.
4. Build a static board or contact sheet with `snapshot_html`, and show it with `attach_image`.
5. Present a compact `Comparison` and wait for the user's choice or revision.
6. Refine only the chosen direction, at most two rounds unless a measurable gate fails.
7. Export source SVG/HTML, colorways, monochrome/reversed versions, small-size previews, tokens,
   applications, and provenance.

Use Domo's `council` for the initial visual directions and blind critique when the decision is open-
ended. Use a focused delegate for production or a single critique. Consensus is not approval.

## Quality gates

Before calling the work finished:

- render at 16, 24, 32, 64, 128, and 256px when applicable;
- test light, dark, monochrome, and reversed grounds;
- check SVG `viewBox`, clipping, external references, and accidental rasterization;
- check WCAG contrast for text and supporting graphics;
- use licensed fonts and record them;
- do not copy or trace a recognizable existing mark;
- include the one-sentence rationale and the worst remaining risk;
- keep the source files beside the previews in the topic-local brand pack.

Use [scripts/init-brand-pack.mjs](../brand-foundation/scripts/init-brand-pack.mjs),
[scripts/validate-brand-pack.mjs](../brand-foundation/scripts/validate-brand-pack.mjs), and
[scripts/make-contact-sheet.mjs](../brand-foundation/scripts/make-contact-sheet.mjs) through the
paths in the sibling skill. Use [references/asset-routing.md](references/asset-routing.md) and
[references/provenance.md](references/provenance.md) for details.

## Delivery

Keep the explanation in normal prose outside the image. A visual must never replace the answer or
make the user's decision disappear. Name the generated files and leave the editable source available.
Do not call a name or mark legally cleared; use the advisory process in `brand-foundation`'s claims
reference.
