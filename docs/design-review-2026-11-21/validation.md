# Validation and delivery

Completed November 21, 2026 (America/Chicago).

- Fresh echo daemon audit; successful web build. Current app changes pre-dated this review and were preserved.
- 80 final prototype captures: 4 directions × 5 screens × phone/desktop × light/dark. Phone 375×812; desktop 1440×1000. Components and state specimens have full-page captures.
- 120 browser checks: above, plus 320px. No page-wide overflow, no open-dialog horizontal overflow, no unhandled JavaScript errors. Every checked visible button, summary and text field measured at least 44px in both dimensions. Native checkboxes were excluded because their larger enclosing labels provide the tap area. This is a bounded automated check, not a conformance claim.
- All four verified: source View shows the agreed original message; Reply exposes a quote; settings opens and Escape closes; Choice submits and disables duplicate selection; checklist updates; Questions submit handler runs; receipt View expands; file opens in place.
- Gallery screenshot zoom, screen/theme/device controls and interactive iframe scaling were checked in Chrome.
- Raw responsive and interaction evidence is saved in `browser-validation.json`.
- JavaScript syntax checks passed for all prototype scripts and gallery. Soft Focus sheet screenshots were recaptured with finite animations completed, avoiding an opacity-zero transitional capture.
- Fine grain, source/action semantics, small controls and phone composition were revised after peer review. Full reviews are in each option's `critique.md`.
- No production code, seed skills, domain schemas, constitution, rubric or judge prompts were changed by this design exploration. No direction has been implemented in the app.

## Review

Open `index.html` through a local HTTP server. The active review server is `http://127.0.0.1:57713/`. If it has stopped:

```sh
python3 -m http.server 57713 --bind 127.0.0.1 --directory docs/design-review-2026-11-21
```

The gallery offers screenshots and interactive mockups side by side, with screen, viewport and theme controls. Those controls are for this review only. Direct files work for screenshots; use HTTP for every interactive direction, since B uses an ES module.

## Boundaries

No live providers, real private messages, push permissions, accounts, filesystem mutations from mock controls or persistent settings. Prototype controls act only in local page state. No backend behavior, telemetry, secure Visual iframe, real attachment uploads, actual queue/steer execution or memory archive is implemented here. State specimens show design coverage, not a connected state machine.

Manual physical-phone keyboard, VoiceOver, 200% text/400% zoom, full contrast coverage, focus-return checks for every dialog path and the repository's behavior/rubric tests remain implementation requirements after a direction is chosen. `bun run check` was not run because production code was not changed, no commit was made, and the checkout contains unrelated work in progress.

## Files

- `research.md`: checked sources and Domo-specific design principles.
- `audit.md`: current-working-tree audit, measurements and evidence corrections.
- `brief.md`: common content contract for a fair comparison.
- `critique.md`: consolidated design review and revisions.
- `options/`: standalone prototypes, local fonts and font licenses, rationales and individual critiques.
- `captures/`: final 80 screenshots.
- Baseline screenshots remain in `output/playwright/design-review-2026-11-21/baseline-*` from the repository root.
