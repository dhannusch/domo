---
name: using-domo
description: How the Domo app works from the user's side (settings, models, domo.md, images, comments, cards, "needs you", Stop, files, reminders, memory, topics). Use whenever the user asks how to do something in Domo, or before telling them to do anything in the app.
---

# Using Domo

Answer "how do I…" questions about Domo from this page, in one or two sentences. Never invent a
button, screen or menu that isn't described here. If something isn't possible, say so plainly and
offer to do it yourself when one of your tools can.

## The page

- One chat, newest at the bottom. Older finished topics fold into **Earlier** at the top while the
  user is away; nothing is ever deleted. A line saying what happened while they were away appears
  when they come back, with undo.
- There are no threads, tabs or topic lists. Topics are yours to manage (`start_topic`,
  `rename_topic`); never ask the user to create or switch one.

## Writing to Domo

- **Message box:** "Message Domo…". Enter sends; Shift+Enter is a new line.
- **Models:** typing `@` at the start of a message suggests models (opus, sonnet, haiku, fable,
  codex, luna). Picking one pins this topic to that model until they pick another.
- **Images:** the picture icon at the left of the message box attaches up to 4; pasting or dragging
  a screenshot works too.
- **Reply:** every message has a Reply action. **Comment:** select text in one of your replies, tap
  Comment, and write a note right there; several comments go together with one Send.
- **Stop:** a reply that's still being written shows Stop; it keeps what was written so far.
- **Steer or queue:** while Domo is replying, the composer shows Queue and Steer instead of Send.
  Queue (Enter) answers the new message after the current reply, marked "Queued" meanwhile. Steer
  (⌘/Ctrl+Enter) stops the current reply, keeping what it wrote, and answers the new message now.

## Cards in your replies

- Choice (tap an option or "Something else"), Questions (answer in the boxes, Send answers),
  Comparison, Checklist (tap to tick), Visual (a drawing or small interactive page).
- Writing a new message instead of answering closes the open cards as "moved on".
- **"needs you"** above the message box counts open questions and running work; tapping it lists
  them and jumps to each.
- **view** on a work line shows the steps you took, the files you changed (tap one to read it) and
  the model used.

## Settings (the gear beside the date)

- **Notifications:** when the phone app may notify while you're away from Domo on every device:
  replies and decisions (the default), only when you're needed, or never. "Turn on for this
  device" asks permission; once on, "Send a test notification" checks it end to end.
- **Tidy timer:** how long they must be away before finished topics fold into Earlier.
- **Default model** for replies, and **background model** for filing (cheaper is fine).
- **Your instructions for Domo:** edit `domo.md`, the user's own words on how you should behave.
  You may only suggest changes with `propose_instructions_change`.
- **Appearance:** System, Light or Dark, per device. The Chalk interface uses neutral paper and charcoal, with flat controls and comfortable touch targets. Settings and files open in place, with Done kept at the top.
- **What Domo knows:** your nightly profile summary and every note you keep, each with a remove
  button. "Let Domo interview you" starts the getting-to-know-you interview.
- **Self-improvement:** the Lab on or off, with undo for each change it made.
- **Devices:** how other devices get in.

## Showing images

- Hand over files with `attach_file`: images show as pictures; decks and pages (HTML), PDFs, SVGs,
  Markdown, text and CSV show as cards that open in Domo's viewer (images open there too).
  `export_pdf` turns an HTML deck into a PDF. Show pictures you render with `snapshot_html`
  (write a page, get a PNG, e.g. a logo, cover or mockup with real web fonts). Prefer these to
  `render_visual` for design work; keep `render_visual` for interactive explainers.

## Brand work

- For brand strategy or copy, Domo can use the optional `brand-foundation` skill.
- For logos, visual identity, and brand applications, it can use `brand-identity`.
- Both keep an inspectable `brand-pack/` in the topic folder, so approved words, visuals, decisions,
  licenses, and source files stay together. Ask to show the brand book or contact sheet when you want
  to review the work later.

## Reminders

- `schedule` posts a note at a set time (with a phone notification), or runs a task then and posts
  the result. `list_scheduled` and `cancel_scheduled` manage them. Only promise a reminder or a
  follow-up after `schedule` has confirmed it.

## Memory

- `remember`, `recall` and `forget` keep and manage notes about the user. Everything is also
  visible to them in Settings › What Domo knows.
