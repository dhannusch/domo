# Domo design research

Research notes, November 2026, on UI and UX practice for a calm, chat-first personal agent app. Phone at 375px comes first, then desktop. Each section summarizes the evidence. The last section turns it into rules for Domo.

Source quality varies. The primary sources here are OpenAI's Apps SDK guidelines, the MCP Apps spec, Google Research, Material, NN/g, Baymard and Smashing. Several of the other sources are practitioner blogs and forum threads, and the text flags those.

---

## 1. Typography for reading-heavy chat

**Measure.** Baymard puts optimal body text at [50–75 characters per line](https://baymard.com/blog/line-length-readability). The often-quoted 66 characters is convention, not a research finding. At 375px with 16px gutters, a 17px serif sets about 36–42 characters. That is short but acceptable on phones, and secondary guides suggest [40–50 cpl, line-height 1.3–1.45 on mobile](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/). On desktop, cap the prose column at about 34–38em, roughly 65–70 characters in Literata. Do not let the column widen with the window.

**Size.** 16px is the floor and browser default. For a serif with a modest x-height, 17–18px reads better on phones, and Literata's x-height is [deliberately lower than Droid Serif's](https://en.wikipedia.org/wiki/Literata). Use 17px on phones and 18px on desktop. iOS Safari zooms into any input under 16px, so the composer must be at least 16px.

**Line-height and rhythm.** Serif body copy needs more leading than UI sans. Use about 1.55–1.6 for agent prose and 1.4–1.45 for the user's sans messages and chrome. Set spacing on a 4px base grid, and make paragraph spacing roughly equal to one line (about 0.9–1em) so the rhythm reads as a book, not a form.

**Serif for agent prose.** Literata was commissioned by Google so readers could ["comfortably read a full novel on any screen and at any text size"](https://fonts.google.com/specimen/Literata/about). Literata 3 is variable, with weight and optical-size axes, so use `font-optical-sizing: auto` and let small sizes get the sturdier text cut. The serif-agent, sans-user split is now a recognizable genre convention. Claude.ai uses a custom `anthropicSerif` for replies and a sans for the user's prompt, and [AI brands broadly have moved to serifs](https://www.creativebloq.com/design/fonts-typography/why-ai-brands-are-obsessed-with-serif-fonts) for warmth. Domo's Literata/Instrument Sans pairing does the speaker-distinguishing work that bubbles usually do.

**Distinguishing speakers without bubbles.** Use three quiet signals at once:
- typeface (serif vs sans);
- alignment or indentation (user messages right-aligned or inset, with a narrower max width of about 80% of the column);
- a faint tonal plate or a slight ink shift on user turns.

Avoid avatars and names on every turn. For screen readers, give each turn a visually hidden heading ("You said", "Domo said"), as the [Smashing a11y article](https://smashingmagazine.com/2026/11/making-immersive-llm-chat-experiences-more-accessible/) recommends.

**Type scale.** Keep the scale small, as OpenAI tells app builders to [prefer body and body-small](https://developers.openai.com/apps-sdk/concepts/ui-guidelines):
- Chat content needs about four steps: caption 13, UI 15, body 17, heading 20–22.
- Markdown headings inside replies should be at most one or two steps above body, set in serif semibold, not display sizes.

## 2. Spacing, hierarchy, density, calm

- **Calm technology.** Weiser and Brown's [1995 idea](https://en.wikipedia.org/wiki/Calm_technology), formalized by Amber Case in [eight principles](https://calmtech.com/about), translates directly to an agent UI:
  - require the smallest possible amount of attention;
  - inform without demanding focus;
  - use the periphery;
  - use the minimum technology the task needs.

  For Domo, background work should live at the edge of attention (a single working line, receipts collapsed). It should never interrupt with modals or toasts.
- **Granola** is the clearest AI-native example. Co-founder Sam Stephenson describes ["calm AI for crazy days"](https://www.cognitiverevolution.ai/calm-ai-for-crazy-days-inside-granola-s-design-philosophy-with-co-founder-sam-stephenson/): a single notepad, AI mostly invisible, and AI additions shown in gray for review rather than in a split pane.
- **Shared craft traits** of iA Writer, Things, Bear, Craft, Readwise Reader, Linear and Arc:
  - one typographic voice for content;
  - hierarchy built from weight, size and space rather than lines and boxes;
  - chrome that recedes until summoned;
  - generous outer margins with tight inner grouping (proximity does the grouping, so dividers are unnecessary);
  - one accent used sparingly.

  Rams's "as little design as possible" applies here: every border, badge and icon must earn its place.
- **Density.** Chat is linear, so density comes from vertical rhythm. Use about 24–32px between turns, 12–16px between a turn's parts, and 8px inside clusters. Cards should feel like part of the text column (same width, quiet surface), not floating widgets.

## 3. Chat and agent patterns in leading apps

- **Streaming.** Every major app streams tokens into a single growing block with a subtle caret or pulse. Smashing's guide on [stable streaming interfaces](https://smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/) recommends:
  - extend one text node rather than rebuilding innerHTML;
  - flush buffered tokens once per `requestAnimationFrame`;
  - keep the caret as a persistent element.
- **Thinking and working state.** Claude, ChatGPT and Gemini show a single status line ("Thinking…", "Searching…") that expands to a trace on request. Coding agents (Cursor, Codex, Claude Code) show a live step list, then collapse it to a summary when done. The pattern is a collapsible trace, closed by default; see the [assistant-ui chain-of-thought](https://www.assistant-ui.com/docs/guides/chain-of-thought) and [Progress Steps](https://aiuxplayground.com/pattern/status-steps). The gptme team groups [three or more consecutive tool calls](https://timetobuildbob.github.io/blog/making-long-agent-conversations-scannable) into one summary bar. One or two stay inline.
- **Interrupt, steer, queue.** The pattern converging across tools is queue-by-default plus an explicit "send now / steer" and a stop control. Codex steers mid-run, Claude Code queues to the next step boundary and Esc interrupts, and Cursor's iOS users ask for ["Send now" and "Stop & send"](https://forum.cursor.com/t/cursor-for-ios-mid-run-steer-send-stop-send-parity-not-only-queue/171729). These sources are forum threads. Queued messages should be visible and editable above the composer. ChatGPT's lack of an editable queue is a [standing feature request](https://community.openai.com/t/feature-request-add-message-queue-to-chat-mode/1392884).
- **Citations.** Perplexity uses a [three-layer model](https://aiuxplayground.com/teardowns/perplexity/citations): inline markers, a sources row, then a detail view. Opinion is split between domain chips, which build trust faster, and superscript numerals, which keep the reading rhythm. For a serif reading column, small numerals or quiet underlined links preserve rhythm best.
- **Artifacts and canvas.** Claude Artifacts, ChatGPT Canvas and Gemini Canvas all move large outputs out of the stream into a side panel on desktop and a full-screen view on mobile. In the stream, a compact reference card remains.
- **Needs-your-input.** The Shape of AI's ["Governors"](https://shapeof.ai/pattern-types/governors) category covers patterns that keep users in control mid-run: pause, verification and draft modes. A blocking question should be visually distinct from ambient work, it should be the last thing in the stream, and the composer should reflect it (for example, a placeholder that names the question).
- **Reply-to-quote.** ChatGPT and Claude let users select text, then "Ask" or "Reply", which attaches the quote as a chip above the composer. This is cheap and very high value in long agent prose.
- **Attachments** appear as chips in the composer before sending, then as compact tiles in the user's turn.

## 4. Generative UI: components vs prose

- **The mechanism.** In the [Vercel AI SDK](https://ai-sdk.dev/v5/docs/advanced/rendering-ui-with-language-models), the model calling a tool is what produces a component, and text is the default. The experimental `streamUI`/RSC path is no longer the recommended one. Use typed tool parts mapped to components.
- **Declarative catalogs win.** Google's [A2UI](https://developers.googleblog.com/en/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) (now [1.0](https://developers.googleblog.com/en/a2ui-1-0-generative-ui)) has agents emit JSON that references only components from a catalog the client registers. User actions return as messages, and v0.9 [sends the surface's data model with each action](https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec). That is exactly Domo's six-card model, and the card's answered state should travel back to the agent the same way.
- **Free-form HTML is the escape hatch.** [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), a joint effort by Anthropic, OpenAI and MCP-UI, renders `ui://` HTML in a sandboxed iframe with JSON-RPC over postMessage. Google's [dynamic view](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/) codes a full custom UI per prompt but "can sometimes take a minute or more", so reserve it for responses that are truly visual. Domo's Visual card maps onto this model.
- **OpenAI's card rules** ([UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)) are the most concrete published density caps:
  - at most two actions per inline card (one primary, one secondary);
  - auto-fit height with no internal scrolling;
  - no tabs or drill-in navigation;
  - don't duplicate the composer;
  - 3–8 items per carousel;
  - at most two lines of metadata;
  - inherit system type and color, with brand color only on accents;
  - fullscreen for anything richer, with the composer still present.
- **When to render a card.** Render one when the reply's value is structured: discrete choices, parallel comparison, a list of states to tick, or a visual. Write prose when the value is reasoning, nuance or narrative. The test: if the user's next action is a tap, use a card. If it's reading or thinking, use prose. Always pair a card with a one-sentence prose lead-in so the stream still reads as conversation.
- **Answered cards should collapse** to a single line in the user's voice that records the decision (for example "Chose: Option B", or "Answered 3 questions" with a chevron to expand). The interactive controls disappear, which keeps scrollback calm and makes the log truthful. Collapse must not move content the user is looking at (see section 7).

## 5. Mobile ergonomics

- **Thumb reach.** Steven Hoober's observation of [1,300+ people](https://smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users) found touch is most accurate at screen center and worst in the corners. Grip also varies, so the thumb zone is a tendency, not a law. Put primary actions low-center: the composer, send, and stop (which replaces send in the same spot). Put rare actions (settings, file viewer) top-corner.
- **Targets.** Apple's HIG asks for 44×44pt, and WCAG 2.2's [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) sets 24×24 CSS px. Use 44px hit areas, even when the glyph is 20px.
- **Sticky composer and keyboard.** iOS shrinks the visual viewport, not the layout viewport, when the keyboard opens. Chrome on Android matched this in 2022 and added [`interactive-widget`](https://developer.chrome.com/blog/viewport-resize-behavior) (`resizes-content` opts back into a resized layout). Recommended stack:
  - `interactive-widget=resizes-content` in the viewport meta;
  - an `100dvh` app shell;
  - pin the composer with a `visualViewport` resize/scroll listener as a fallback.
- **Known iOS standalone-PWA bugs.** Developer reports describe the viewport staying shrunk after the first keyboard open ([write-up](https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d)), and on iOS 26 `visualViewport.offsetTop` can stay above 0 after the keyboard is dismissed ([Apple forums](https://developer.apple.com/forums/thread/800125?page=2)). A global `touch-action: manipulation` on `html` has also [blocked the keyboard](https://github.com/coder/mux/pull/372). Test the installed PWA on a real device, not just a Safari tab.
- **Safe areas.** Use `viewport-fit=cover`, pad the composer bottom with `env(safe-area-inset-bottom)`, and pad the top with `env(safe-area-inset-top)` in standalone mode.
- **Sheets.** NN/g notes that the [thumb-reach rationale for bottom sheets is "largely incorrect"](https://www.nngroup.com/articles/bottom-sheet/). Use sheets because they keep context visible, not for reach. Always support swipe-down, Back and a visible close. Material advises [against opening tall sheets full-screen](https://m2.material.io/components/sheets-bottom). Use a bottom sheet for settings, which are short and keep context, and a full-screen sheet for the file viewer and expanded Visual cards, which are immersive.

## 6. Accessibility

- **Contrast.** WCAG 2.2 AA requires 4.5:1 for body text and 3:1 for UI and large text. APCA, proposed for WCAG 3 and not yet normative, sets [Lc 75 minimum and Lc 90 preferred](https://github.com/Myndex/apca-introduction) for body columns. It is polarity-aware, which WCAG 2's math [handles poorly for dark mode](https://www.github.com/Myndex/SAPC-APCA/blob/master/documentation/WhyAPCA.md). Meet WCAG 2 AA as the legal floor, and use APCA to tune dark mode and the muted inks.
- **Focus.** WCAG 2.2 adds [2.4.11 Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), which bears directly on a sticky composer: a focused item must not be hidden behind it. Use `scroll-padding-bottom` equal to the composer height. Use a 2px sage `:focus-visible` ring with an offset, and never remove outlines.
- **Live regions for streaming** ([Smashing](https://smashingmagazine.com/2026/11/making-immersive-llm-chat-experiences-more-accessible/), [Tian Pan](https://tianpan.co/blog/2026-06-29-streaming-tokens-meet-the-screen-reader)):
  - never put `aria-live` on the streaming message;
  - avoid `aria-atomic="true"` on growing content, which re-reads the whole reply on every token;
  - use one polite live region, mounted at load and placed last in the DOM, and announce the full reply only once it completes;
  - announce "Working" after about 5 seconds of silent activity;
  - `aria-busy` support is uneven, so don't rely on it alone.
- **Structure.** Wrap each turn in `article` with a hidden speaker heading, and avoid the feed role. Provide skip links to the conversation and the composer. Summarize tables and code for screen readers.
- **No-hover operability.** Every hover affordance (copy, quote, expand trace) needs a tap path, such as a tap on the turn or a long-press menu. Assume no hover on touch.
- **Reduced motion.** Under `prefers-reduced-motion`, render replies in larger chunks or all at once, stop caret blinking ([a blinking caret counts as flashing content](https://smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/)), and drop slides in favor of opacity changes.
- **Dark mode done well.** [Material](https://m2.material.io/design/color/dark-theme) recommends:
  - dark gray (#121212-ish) rather than black;
  - off-white text;
  - desaturated accents;
  - elevation shown with lighter surfaces, not shadows.

  For Domo: graphite paper at about L 0.18–0.22 in OKLCH, ink at about L 0.90 rather than 1.0, and a slightly lighter, less chromatic sage.

## 7. Motion and layout stability

- **Motion should explain state changes.** A card arriving, a trace expanding, the stop control replacing send. It should not decorate. Use 120–200ms, ease-out for entrances, opacity plus at most a 4px translate.
- **Streaming reveal.** Let tokens appear as they arrive, batched per frame, with no per-word fade (that is costly and distracting). A soft caret at the end of the live paragraph is enough.
- **Stick-to-bottom only when pinned.** Follow output only while the user is within about [60px of the bottom](https://smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/). Detect real user intent from wheel, touch or keys, because content growth fires scroll events that [look like user scrolls](https://medium.com/@disgcfrguy/the-scroll-problem-nobody-talks-about-when-building-ai-chat-interface-987c223cafc0). When unpinned, show a quiet "New below ↓" pill ([MUI](https://mui.com/x/react-chat/behavior/scrolling/), [TanStack](https://tanstack.com/virtual/latest/docs/chat)). Browser `overflow-anchor` can fight manual logic, so test it with `overflow-anchor: none` on the scroller.
- **"The page never moves while the user is present."** Here that means:
  - reserve space for cards before they hydrate (skeletons with final height, iframes with a declared aspect or height);
  - collapse answered cards only when they are above the viewport or at the moment of the user's own tap, and compensate scrollTop by the height delta;
  - grow content downward only;
  - insert nothing above the reading position;
  - never let late-loading fonts reflow (`font-display: optional` or metric-matched fallbacks via `size-adjust`).

## 8. Color

- **One accent, restrained.** OpenAI's rule for apps: [system colors for text, icons and dividers, brand color only on accents and primary buttons, no gradients](https://developers.openai.com/apps-sdk/concepts/ui-guidelines). The calm reference apps (Things, Bear, iA, Linear) all live on neutral ramps with one hue.
- **OKLCH tokens.** Evil Martians make the case for [OKLCH over HSL](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl): lightness is perceptually uniform, so one formula generates a ramp and light and dark pairs predictably. Their [Harmony](https://github.com/evilmartians/harmony) palette uses OKLCH plus APCA for equal contrast within lightness groups. Structure the tokens in two layers: primitive ramps (graphite 0–1000, sage 0–1000), and semantic tokens (`--paper`, `--ink`, `--ink-muted`, `--accent`, `--surface-raised`). Dark mode redefines only the semantic layer.
- **Cool paper.** A tiny chroma (about 0.005–0.01) toward the sage hue on paper and ink makes the neutrals feel related to the accent without reading as tinted. Keep sage chroma low (about 0.05–0.08) for a calm accent, and confirm the accent on paper meets 3:1 for UI and 4.5:1 if used for link text.

---

## Implications for Domo

1. **Prose column**
   - Agent prose: Literata at 17px/1.6 on phones and 18px/1.6 on desktop, `font-optical-sizing: auto`, max width 36em (about 68 characters).
   - User turns: Instrument Sans 16px/1.45, max 80% of the column, right-inset.
   - The composer input is never below 16px.
2. **Type scale.** Four steps: 13 / 15 / 17 / 21. Markdown h1–h3 inside replies map to 21/19/17 semibold serif. No display sizes in the stream.
3. **Speakers.** Distinguish speakers by typeface, inset and a faint tonal plate on user turns. Avoid bubbles, avatars and per-turn names. Add hidden "You said / Domo said" headings for screen readers.
4. **Spacing.** Derive all spacing from `--line`: about 1.25× `--line` between turns, 0.5× within a turn, 0.25× within clusters (roughly 32/16/8px). Group by proximity instead of rules, borders or dividers.
5. **Prose is the default.** Render a card only when the user's next move is a tap or the content is structurally parallel. Every card gets a one-sentence prose lead-in.
6. **One card per turn.** A second card waits for the first to be answered. Choice: 2–5 options. Questions: 2–4. Comparison: at most 4 columns × 6 rows, then expand to full screen. Checklist: at most 8 visible, then "Show n more".
7. **Card body.** Cards auto-fit with no internal scroll and no tabs. They carry at most one primary and one secondary action, and the primary uses the only sage-filled control on screen.
8. **Answered cards collapse.** Each becomes one line in the user's voice ("Chose B", "Answered 3"). The line can expand read-only, and the answer data returns to the agent as a structured message, in the style of A2UI.
9. **Collapse without moving the page.** Collapse at the moment of the user's tap, anchored so the tapped line stays put. Collapse anything above the viewport with scrollTop compensation.
10. **Visual cards.**
    - Render in a sandboxed iframe with a declared height before load, inheriting Domo's tokens via CSS variables.
    - Expand to a full-screen sheet with the composer still present.
    - Never auto-run motion.
11. **WorkReceipt**
    - Rendered collapsed by default as a single muted line ("Read 4 files · edited 2 · 38s") with a chevron.
    - Three or more consecutive tool steps always group into one receipt.
12. **Working state**
    - One quiet line at the end of the stream (sans, muted ink, a slow 1.5s opacity pulse that stops under reduced motion).
    - Never a spinner overlay, toast or modal.
    - "Working" is announced to screen readers after 5s of silence.
13. **Send becomes stop.** While Domo works, the send button turns into stop in the same spot.
14. **Queue and steer.** Messages typed while Domo works queue as editable chips above the composer, each with a "Send now (steer)" option.
15. **Needs your input.** The question is the last item in the stream, carries the accent on its left edge, and the composer placeholder names it. A quiet sage dot on the app icon or badge is the only out-of-app signal.
16. **Reply-to-quote.** Select text, or long-press on touch, to show "Reply". The quote attaches as a removable chip above the composer.
17. **Citations** are small superscript numerals or quiet links in the serif column. They open a bottom sheet with sources, not a hover card.
18. **Scroll**
    - Follow streaming output only while within 60px of the bottom, judging user intent from wheel, touch and key events.
    - Otherwise show a "New below" pill. The page never scrolls on the user's behalf once they've scrolled up.
    - Nothing is inserted above the reading position.
19. **No reflow**
    - Self-host Literata and Instrument Sans with metric-matched fallbacks (`size-adjust`).
    - Reserve heights for every async block.
    - Use `font-display: optional` for the serif after first visit.
20. **Mobile shell**
    - `100dvh` shell, `viewport-fit=cover`, `interactive-widget=resizes-content`.
    - Composer padded with `env(safe-area-inset-bottom)` and pinned via a `visualViewport` fallback.
    - `scroll-padding-bottom` equal to composer height.
    - No global `touch-action` on `html`.
    - Test as an installed iOS PWA.
21. **Targets.** Minimum 44×44px hit areas. Primary actions low-center, rare actions (settings, files) top-corner icons. No hover-only affordances: every hover action has a tap or long-press path.
22. **Sheets.** Settings opens as a bottom sheet (swipe down, Back or ✕ to close). The file viewer and expanded Visual or Comparison cards open as full-screen sheets. Sheets never open at full height when their content is short.
23. **Color tokens**
    - Two layers: OKLCH primitives (graphite and sage ramps), then semantic tokens. Dark mode swaps only the semantic layer.
    - Light paper: L ≈ 0.975, C ≈ 0.006, sage hue.
    - Dark paper: L ≈ 0.20. Dark ink: L ≈ 0.90, never pure white.
    - Sage C ≤ 0.08, a touch lighter and less saturated in dark mode.
24. **Contrast**
    - Body ink: at least 7:1 (APCA Lc 90 target).
    - Muted ink: at least 4.5:1 (Lc 60+, and only for text 15px or larger).
    - UI borders and controls: at least 3:1.
    - Focus: a 2px sage `:focus-visible` ring with a 2px offset, never obscured by the composer.
25. **Motion**
    - 120–200ms, ease-out, opacity plus at most 4px translate, used only for state changes.
    - Tokens stream per animation frame with no per-word fade.
    - Under `prefers-reduced-motion`: no caret blink, no pulse, and chunked or instant reply reveal.
