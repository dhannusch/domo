# B — Quiet Utility

**Visual thesis.** A precise, quietly capable instrument on cool paper: crisp alignment, compact rhythm, warm reading type, and sage reserved for useful decisions.

**Content plan.** The conversation is the entire workspace. A small brand/date masthead, a distinct full-ink human turn, reading-first agent prose, source actions, and a decision occupy one bounded column. There is no dashboard or persistent secondary panel. Component collection and state collection are review-only URL modes.

**Interaction thesis.** Clear boundaries make inputs and decisions easy to find. Trace and original-message details expand only on an explicit action. Sheets open without animating the feed; native dialogs handle focus containment and Escape. Touch and keyboard actions remain visible. A small working-state pulse is disabled with reduced motion; no scroll-linked ornament or auto-reordering.

## Distinction

This is the most compact and operational direction. Controls share small-radius geometry and aligned action rows. Source and reply controls remain discoverable rather than becoming gesture-only features. Desktop Choice uses two parallel candidates; phone changes to stacked full-width choices. Comparison follows the same vocabulary. Paper and prose keep it personal rather than turning it into a task dashboard.

## Tradeoffs

- Dense composition fits decisions into less space and makes repeat use efficient; it has less of Correspondence's spacious reading atmosphere.
- A tonal human turn and strong input boundaries create reliable orientation; semantic speaker labels remain available without repeating visible names.
- The one-column format intentionally leaves desktop margins empty. That protects reading measure and Domo's one-chat principle.
- Settings uses familiar bordered option controls; long model names can wrap but each choice remains independently tappable.

## Prototype coverage

`?screen=chat|components|settings|file|states&theme=light|dark`. All six components, file handoff and viewer, complete settings sections, and empty/working/queued/failed/stopped/answered/reply/model/image/file/long-content states. Main chat supports immediate Choice recording, source View, reply context, native settings/file dialogs, local settings selection, checklist counts and question submission. It retains existing geometry when a choice is answered. Mock composer appends locally and clearly says no model is connected. No backend persistence, upload, secure iframe behavior, telemetry, actual notifications, or agent execution is claimed.

## Review and revision

Parent screenshot critique found repeated speaker labels and a decision eyebrow made the phone view unnecessarily tall, with Reply partly behind the composer. Removed those repeated labels from everyday chat while retaining semantic speaker groups; removed the footer tagline; enlarged every quiet hit area to 44px; tightened grouping; and tiled grain at 180px to avoid oversized cloudy patches. Component specimens retain explanatory labels solely for design review. Peer review from A/C also identified diagonal arrows as misleading for immediate-submit choices and 11px labels as too small. Removed candidate arrows and raised recommendation/visual day labels to 12px. Cross-direction critique is in critique.md.

## Lightweight checks

`node --check` passed for script.js and templates.js. Token calculations: secondary ink on paper 5.57:1; accent on paper 5.94:1; secondary ink on the user surface 5.15:1. Darkened the light-theme control boundary after finding the original boundary achieved only 2.82:1 on paper. These token checks are not a complete accessibility audit.
