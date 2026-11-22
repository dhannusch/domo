# Shared exploration contract

Only edit your assigned `options/<letter>-<name>/` folder. Do not touch app, existing design files, other options, constitution or rubric. Read research.md and audit.md first. Use frontend skill. Prototype is static standalone HTML/CSS/JS, not app implementation. Keep individual files near/below 300 lines. Local fonts: ../assets/literata.woff2 (family Literata); ../assets/instrument.woff2 (Instrument Sans). Use two fonts, graphite + sage, cool paper grain only, no blue/navy. `--line` is the spacing/leading unit. All interactive controls stable data-testid, semantic HTML, 44px targets, visible focus, reduced-motion, no hover-only features.

Every direction needs `index.html`, `style.css`, `script.js`, `rationale.md`. URL parameters: `?screen=chat|components|settings|file|states&theme=light|dark`. Screen is a prototype viewing mode, NOT product navigation. Default chat. Expose settings via gear and file via attachment; real native dialog overlays for those actions preferred. `screen=settings/file` may render the sheet already open. No persistent sidebar, panel, tabs or thread navigation. Theme respects explicit query param then system. Keep main chat stable, no animated layout shifting.

Identical hero chat copy for fair comparison:
- Date: Saturday, November 21. Small Domo identity allowed, settings gear.
- User: “Help me make room for the newsletter this week.”
- Domo: “You have two quiet evenings. I’d protect Tuesday for the first draft and keep Thursday for editing.”
- Source action: “From Wednesday” + View opens original “I have about five hours a week, and I want to keep weekends free.” Not quite can create reply context.
- Choice: “Where should we start?” Options: “Protect Tuesday” / “Two hours for a first draft” (Recommended), “Keep it flexible” / “I’ll find a gap during the week”. Choosing immediately records choice visibly without removing/reordering existing content. Quiet “Something else”.
- Visible quiet Reply. On click shows quoted reply above composer, cancellable.
- Bottom “1 needs you” opens a small list referencing the choice; clicking jumps on explicit user action.
- Composer “Message Domo…”; attach image, Send, clear labels. Static mock send may append text but label prototype behavior in rationale.

`screen=components` renders all six in order plus file card, separated by quiet sample headings if needed (this is a specimen, not product chrome):
1 Choice above; answered/skipped examples can be in states.
2 Questions: “A little context” / “How much time feels realistic?” (placeholder “About five hours a week”), “What should stay off limits?” (placeholder “Weekends, for example”, optional); submit “Send answers”.
3 Comparison: “A rhythm for the week”; Tuesday + Thursday / Focus “Draft, then edit” / Time “4 hours” / Recommended; Flexible / Focus “Write when there’s a gap” / Time “2–5 hours”. Desktop aligned table, phone reflow labels.
4 Checklist: “Ready for the first issue” / “Choose the theme” checked, “Outline three sections”, “Write the opening”; count “1 of 3 done”. Native accessible checkboxes.
5 Visual: “Your week, with room to breathe” illustrative weekly allocation, text labels + summary “Four hours across Tuesday and Thursday. The weekend stays free.” Use theme and responsive geometry; no external network.
6 WorkReceipt: “Draft outline saved” / “2 tools · 1 file” / View toggles trace “Read your notes”, “Saved newsletter-outline.md”, file action.
File card: “Newsletter outline” / “Markdown · 2 KB” opens in-place viewer.

`screen=settings`: notifications (Replies and decisions / Only when I’m needed / Off), tidy after (30 minutes / 2 hours / 8 hours), default model (Claude Opus 5.5 / Claude Sonnet 5.5 / Codex), background model (Haiku / Luna), instructions textarea, appearance (System / Light / Dark), What Domo knows expandable with one note + archive action, Lab on/off + sample change undo, Devices. Use simple scrollable sheet, sticky Done, no tabs. Mock controls visibly respond; no backend claim.

`screen=file`: viewer headed “Newsletter outline”, Done, readable outline with “A quieter way to plan” heading and 3 sections; optional download if real local content provided. Loading and error states in states.

`screen=states`: empty greeting; working + Stop; queued; failed with retained draft; stopped; answered/skipped Choice; reply quote; @ model suggestions; image tray + remove; file loading/unavailable; long prose/table stress sample. These are renderable examples, no need backend simulation. No new semantic agent component.

Differences must be compositional, not token swaps. A Correspondence: reading-first, asymmetric speakers, open editorial rhythm. B Quiet Utility: compact, crisp shared component geometry, operational clarity. C Soft Focus: rounded tactile interaction surfaces, phone comfort. D Folio: angular document-like exchange grouping, source and output emphasis.

After initial authoring tell parent ready for screenshots. Then critique the other directions with specific issues and tradeoffs; revise yours after receiving feedback. Parent will render all at 375px and 1440px light/dark and create gallery. Your rationale must say visual/content/interaction thesis, tradeoffs, mock limitations and changes after critique.
