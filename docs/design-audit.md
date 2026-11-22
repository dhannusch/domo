# Domo web UI audit (November 2026)

The current UI (`apps/web/src`), run with the echo provider at 375px and 1280px in light and dark, checked against `docs/design-research.md`. Screenshots are in `design/audit/`: `phone-*`, `desktop-*`, and `c-*` for single components.

Overall, the bones are right. The single column, the serif and sans split, the paper and the restraint all match what the research says calm chat UIs should do. What's missing is a *system*. Sizes, borders and greys were picked one component at a time, so the page reads as faint and flat. The user's own words are the weakest thing on it, controls blur into the paper, and the components don't share a frame.

## What works (keep)

- One centered reading column, Literata for Domo's prose at 17px on a 28px line. Long answers read like a book (`phone-light-full`).
- Paper grain and the "night paper" dark theme. Ink on paper is 12.9:1 in light and 12.6:1 in dark, never pure black or white.
- The sage accent is used sparingly. The "my pick" 2px border on Choice is a clear, calm signal (`c-choice`).
- Answered and skipped cards collapse to one line ("You moved on without choosing"), as the research recommends.
- Sticky date-and-gear masthead, and no chrome otherwise.

## Problems, by severity

### 1. Contrast and affordance (accessibility)

| Pair | Ratio | Verdict |
|---|---|---|
| `--margin-rule` borders on paper (light) | **1.95:1** | Fails WCAG 1.4.11 (3:1) for every control boundary: cards, buttons, Choice options, the composer line |
| `--margin-rule` on night paper | 2.74:1 | Fails |
| `--accent` sage text on paper (light) | 4.04:1 | Fails 4.5:1 for small text (links, "1 needs you", Send) |
| `--pencil` on paper | 4.42:1 | Just under 4.5:1. Used for **the user's own messages**, bylines and all notes |
| `--pencil` on `--paper-deep` | 4.02:1 | Fails (needs-you list, code) |

- **The user's own messages are pencil grey at 15px with a 1.5px left rule** (`.user-message`). Your own words look like disabled text or a footnote. This inverts the hierarchy the research recommends, where the user's turn is distinct but fully legible. The left rule is also a "ruled line", which conflicts with the no-ruled-lines preference.
- **Tap targets are small.** "Reply" and "view" are about 22px tall, Send has 6px padding, and attach is about 30px. The research floor is 44px of hit area.
- `.settings-button:hover` and `.file-card:hover` give feedback on hover only. Acceptable, but there's no pressed state for touch.

### 2. Noise per message

- **Every reply ends with "Opus 5.5 · [Reply]"** (`phone-light-full`). Eleven replies make eleven identical button ladders. The model name contradicts "nothing else in the UI mentions aliases". A bordered Reply under every message is the loudest repeated element on the page, louder than the content.
- The `.meta` negative margin tucks the byline under the prose, but with the work receipt and files in between, spacing is uneven: 0.2rem, 0.5rem, 1.25rem and a full line in different places.

### 3. No shared component frame

The six components look like six different products:

- **Choice:** bordered cards with no frame around the set. The legend is serif at 16px, smaller than the prose, so the question reads as a caption. "Something else" is a third button shape.
- **Questions:** a bordered card with **underlined answer fields**, which are ruled lines. The answer fields look like separators, not inputs.
- **Comparison (phone):** no card. Rows are divided by rules, and cells read "Price: $18.4k", which looks like debug output. The recommendation is only a green name with "Recommended" in 12px grey (`c-comparison`).
- **Checklist:** native checkboxes, no frame and no count. It looks like a form fragment (`c-checklist`).
- **Visual:** a bare iframe with no frame and no title. In the audit it left **about 600px of empty space** under its content (`c-visual`, `phone-light-full` slice 3). Either the height reporting is off or the iframe holds its first estimate. The page then moves when it resizes, which breaks "the page never moves".
- **WorkReceipt:** a full-width bordered card whose only content is "Ran 2 tools, edited 1 file" plus a bordered lowercase "view" button. That's a box in a box, and it's heavier than the reply it belongs to (`c-receipt-open`).
- **File card:** "Brand proposal / Page" with no icon or preview. It's fine, but it isn't related to the other cards.

Type sizes in use: 0.7, 0.75, 0.78, 0.8, 0.85, 0.9, 0.92, 0.95, 1, 1.0625, 1.1, 1.35 and 1.4rem. That's **13 steps**. The research suggests four (13, 15, 17, 21).

### 4. Composer

- It's a single 1.5px sage underline, another ruled line, and the only boundary of the most important control on the page. The placeholder is pencil grey on paper. Send is grey text until you type.
- The textarea is 16px, so iOS won't zoom, which is good. But its hit area is only the 28px line.
- The fade gradient behind it (`linear-gradient` over `0.6 × --line`) is short, so prose shows through right above the input (`phone-light-bottom`).
- "1 needs you" floats right-aligned above the composer as a bare green label with no visible boundary in the screenshots. It doesn't read as tappable, and its list opens over the composer (`phone-needs-you-open`).

### 5. Sheets and viewers

- **Settings on phone** is a centered modal with margins on all four sides. The page and composer show around it, and the sheet clips at the bottom (`phone-settings`). The research says a bottom or full-height sheet, with Done reachable by thumb.
- The model picker is six wrapping cards of different widths. "Codex Luna" sits alone on its row. A long paragraph explains routing. For a calm app, the default model is one row plus a short list.
- **File viewer on phone:** "Open in a tab" wraps to two lines next to "Done", and the title wraps too (`phone-fileviewer`). The deck frame is a white rectangle that stays white in dark mode. In this run it was blank while loading, with no loading state.
- `.highlight-comment` and `.instructions textarea` use the same underline-as-input pattern.

### 6. Masthead and images

- The sticky masthead's gradient is short, so pictures and text smear through under the date (`phone-open-cards`, `desktop-dark-bottom`).
- Domo's own pictures run the full measure at any aspect ratio. On desktop a 2x2 PNG becomes a 1100px orange slab. They need a max height and a quiet frame.

### 7. Desktop

The 38rem column centered in 1280px is right (research: don't widen the column). But nothing changes with the extra room. User turns, bylines and components all sit flush left in the same column. On desktop the margin could carry quiet metadata (time, model, receipt) instead of stacking it under every reply.

### 8. Motion and states

- Streaming uses a blinking block caret, which is disabled under reduced motion (good). There's no "working" state distinct from "writing", and no spec for the live region. Per the research, `aria-live` must not sit on the streaming text.
- The `flash` highlight (1.6s fade) is the only transition. Cards appear with no settle, which is acceptable for calm.

## Summary for the redesign

1. Build a real token system: a 4-step type scale, 3 greys that pass contrast, borders of at least 3:1, and one sage ramp.
2. Give the user's words full ink. Tell them apart by typeface and placement or tone, not by fading them.
3. Move per-message chrome (model, Reply) out of the flow. Reveal it on tap or long-press, or put it in the margin on desktop.
4. One component frame for all six cards: a head line (what this is), a body, and one action row. One open card per turn.
5. Make the composer a real object, not a line.
6. Use real sheets on phone (bottom or full height) for settings and files.
7. Reserve height for visuals and images so nothing moves.
