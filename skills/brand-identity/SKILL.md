---
name: brand-identity
description: Create or refine a visual identity in code (wordmark, mark, type, color, layouts, templates, kit) through staged, user-approved steps. Use for logos, visual identity and brand applications; not for ordinary UI styling or a one-off image unrelated to a brand.
---

# Brand identity

Good identity work is mostly taste and editing, and the user owns the taste. Your job is to explore
widely, edit hard, show only work that has passed your own checks, and stop for the user at every
decision. Everything is made in code: SVG for marks, HTML/CSS for layouts, specimens and decks.

## The one rule: stages end your turn

Work in the stages below. **Each stage ends your turn** with what you made and one decision for the
user (a `render_choice`, `render_questions` or `render_comparison`). Never start the next stage in
the same turn, never skip a stage because you think you know the answer, and never treat something
as approved because you wrote it down. Approval is the user saying so in chat; record it with the
date in `brand-pack/decisions.md`.

If the user asks to go faster, you may merge stages 2 and 3, but still stop before drawing marks.

## Stages

**0. Brief.** If there's no approved foundation (`brand-pack/foundation.md` plus an approval in
`decisions.md`), use `brand-foundation` first. Then ask, in one `render_questions` card, only what
the foundation doesn't answer: how readers should feel, two or three brands or publications they
admire (and why), anything they dislike, and fixed constraints (name, colors, existing assets).

**1. Landscape.** Look at 6–10 real peers in the category (web search). Make a one-slide board:
for each peer, the name set in a similar typeface, its colors as swatches, and three words for its
tone. Name 2–3 open territories nobody owns. Ask which territory feels right.

**2. Directions.** For the chosen territory (or the two strongest), make **three style tiles**, not
logos: the name set large in 2–3 candidate typefaces, a type specimen (headline, body, small text
at real sizes), a palette with roles (ground, ink, accent, support) and contrast ratios, one graphic
element, and one real application (a newsletter cover at its real size). Directions must differ on
at least two axes (e.g. editorial/technical, quiet/loud), not be recolors. Present them as a deck
(see Presenting) and ask for one, or a mix.

**3. Marks.** In the chosen direction, sketch **12–20 wordmark and mark options quickly**, then edit
down. Most strong publication brands are wordmarks; only add a symbol if it earns its place. Put all
of them on a contact sheet (`../brand-foundation/scripts/make-contact-sheet.mjs`), cut to the best
4–6 against the craft checks, and show those large plus the full sheet. Ask the user to pick up to
two.

**4. Refine.** At most three rounds per pick: render, list specific defects (spacing between
particular letters, stroke weight at 16px, balance), fix them, and show before/after. Ask whether
it's done.

**5. Deliver.** The kit: SVG masters (color, one-color, reversed), favicon and avatar set, tokens,
2–3 templates as HTML (newsletter cover, social card, profile banner) with their PNG renders, and a
short brand book. Validate with `../brand-foundation/scripts/validate-brand-pack.mjs`.

## Before showing anything

No first drafts. Every image you show has passed these:

- you rendered it with `snapshot_html` and looked at the PNG yourself;
- marks: contact sheet at 16, 24, 32, 64, 128 and 256px on light and dark, plus solid black;
- text set in real, licensed fonts (Google Fonts by default; record each license);
- WCAG contrast measured for every text/ground pair;
- checked against [references/generic-tells.md](references/generic-tells.md), and anything that
  matches is redone, not explained away;
- the craft checks in [references/craft.md](references/craft.md).

## Presenting

Present each stage as a deck: one idea per slide at 1920×1080, large, with one sentence of
rationale and the honest risk. Start from
[../brand-foundation/templates/deck.html](../brand-foundation/templates/deck.html), save it in
`brand-pack/presentations/`, `attach_file` it (it opens live in Domo's viewer) and `export_pdf` it.
In the chat itself, show only the single most important slide with `snapshot_html`, then the
decision. Never cram several directions into one small board.

Write your explanation as prose in the reply; a picture never replaces the words or the decision.

## Using other models

Use `council` to critique a shortlist, not to generate directions in words: show the candidates
(as files or descriptions of what's on screen) and ask each model which is strongest, which is
weakest, and one specific fix. Consensus is advice, not approval. If a council member fails, say so.

## References

- [references/craft.md](references/craft.md): how to make good marks, wordmarks, type and color in code.
- [references/generic-tells.md](references/generic-tells.md): looks that read as generated.
- [references/visual-system.md](references/visual-system.md), [references/asset-routing.md](references/asset-routing.md),
  [references/provenance.md](references/provenance.md): system, formats and licensing records.
