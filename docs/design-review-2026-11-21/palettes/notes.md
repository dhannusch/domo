# Soft Focus — neutral refinement

## Accepted direction and new feedback

The user selected Soft Focus, requested a neutral palette, and said the current UI felt too AI-generated. The revised study responds by removing conspicuous pill shapes, tinted recommendation surfaces, repeated containers and excess badge styling. Comfortable spacing and the one-chat model remain. This is still a prototype: no app source changes.

All three neutral candidates use the **same revised geometry**. Compared with original Soft Focus: 8–10px corners on inputs/options/composer, a rectangular charcoal send control, transparent option surfaces, smaller sans-serif decision headings, one compact source action, quieter Reply, no composer shadow, less grain, and neutral selected states. The recommendation still has a label and a stronger border. Source provenance remains checkable. The current C prototype is preserved for comparison.

## Candidates

| Palette | Character | Tradeoff |
|---|---|---|
| Chalk | Achromatic white, gray and charcoal | Cleanest and most neutral; slightly austere |
| Stone | Soft mineral gray with a little warmth | Balanced and understated; less bright |
| Linen | Warm off-white, taupe and brown charcoal | Most paper-like; a subtle cream cast |

These are design judgments rather than universal color-psychology claims. All three intentionally propose replacing the existing sage palette; selection should be reflected in AGENTS.md alongside any later implementation. No blue/navy is introduced. The earlier chromatic study is superseded by this neutral study; its artifacts are retained but are not shown in the decision gallery.

## Measured contrast

Computed token pairs use the WCAG relative-luminance formula. Text target 4.5:1; necessary input boundary target 3:1. Light send labels use the paper/accent pair in reverse. Decorative hairlines are excluded from the boundary claim.

| Palette | Theme | Main text | Muted | Muted on user surface | Accent | Accent on selected surface | Input boundary |
|---|---|---:|---:|---:|---:|---:|---:|
| chalk | light | 13.34 | 5.59 | 4.98 | 7.40 | 6.17 | 3.30 |
| chalk | dark | 14.30 | 8.69 | 6.44 | 11.05 | 7.04 | 5.69 |
| stone | light | 11.43 | 5.50 | 4.93 | 6.05 | 5.13 | 3.13 |
| stone | dark | 12.99 | 8.21 | 6.26 | 9.95 | 6.37 | 5.48 |
| linen | light | 12.17 | 5.43 | 4.83 | 6.12 | 5.15 | 3.23 |
| linen | dark | 13.18 | 8.21 | 6.22 | 9.74 | 6.49 | 5.47 |

48 captures: three palettes × two themes × two viewports × four screens (conversation, all components, settings, viewer). Phone 375×812; desktop 1440×1000. No page-wide horizontal overflow or unhandled script errors during capture. Gallery theme/mode controls and screenshot zoom were exercised. Core Soft Focus interaction handlers are reused unchanged; this study does not implement backend state or persistence. Full accessibility conformance is not claimed.

[Open gallery](index.html) · [Light comparison](neutral-light.png) · [Dark comparison](neutral-dark.png)

Stone secondary text was darkened slightly after the token check found 4.45:1 on its selected surface. Final checked text pairs all meet 4.5:1; input boundaries all meet 3:1.

## Decision

The user selected Chalk. The refined Soft Focus/Chalk design is now implemented in the app; see ../implementation.md for changes and validation. The studies above are retained as the decision record.
