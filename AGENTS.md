# domo — agent and contributor guide

`domo` is a personal chief-of-staff agent. A Node 24 daemon on the Mac (Bun is only the package manager) drives the Claude Agent SDK and the Codex SDK (the user's own subscriptions). It serves one calm chat UI to the desktop and, over Tailscale, to the phone. These standards apply to every session, human or agent. Read this file before changing anything.

## Product principles (do not erode)

- **One chat.** No thread lists, tabs, sidebars or panels. The user learns four things: messages, reply-to, "needs you", "view". Anything else is the agent's job.
- **The page never moves while the user is present.** Tidying happens only while they are away. Nothing is ever deleted.
- **Checkable memory.** Every agent restatement carries a source tag that opens the original messages.
- **Prose first.** Intelligent UI uses exactly six components: Choice, Questions, Comparison, Checklist, Visual, WorkReceipt. Don't add another without changing `evals/rubric/` and asking the user.
- **High autonomy, hard guardrails.** The guarded actions in `constitution.md` always go through `ask_user`.

## Repository layout

```
packages/domain   Effect Schemas shared by daemon and web (ids, messages, ui components, events, telemetry)
apps/daemon       Node 24 + Effect services: Store, Providers, Conductor, DomoMcp, Memory, Lab, Http
apps/web          Vite + React 19 PWA (Phase 2+)
skills/           Seed SKILL.md files, copied to ~/.domo/skills on first run (agent-owned after that)
evals/rubric/     UX rubric and judge prompts — human-owned, the Lab may never edit
constitution.md   Guardrails template — human-owned, the Lab may never edit
```

One feature per folder (`providers/`, `store/`, `memory/`, `lab/`). Keep files under about 300 lines. Use named exports only (no default exports, except `*.config.ts`).

## Effect (v4, pinned exactly)

The installed `node_modules/effect/AGENTS.md` and `node_modules/effect/ai-docs/` are the source of truth for the API. Read them instead of relying on memory: v4 differs from v3. Pin every `effect` and `@effect/*` package to the same exact version, because `effect/unstable/*` can break in minor releases.

- **Services:** `class X extends Context.Service<X, {...}>()("domo/<folder>/X")`, with `static readonly layer` (live) and `layerTest` where useful. Build the implementation with `X.of({...})`. No module-level singletons and no global mutable state.
- **Functions:** use `Effect.fn("Service.method")` for traced service methods and `Effect.fnUntraced` for hot or internal helpers. Never write a function that only wraps `Effect.gen`. With `Effect.fn`, pass combinators as extra arguments, not `.pipe`.
- **Errors:** use `Schema.TaggedError`. Never `throw`. Inside generators, `return yield* new MyError(...)`. Recover with `Effect.catchTag` / `catchTags` at boundaries. Unexpected infra failures become defects (`Effect.orDie`) only where the caller can't act on them.
- **Data:** every I/O boundary is decoded with `Schema`: RPC, DB rows, MCP tool args, SDK events, config files and LLM output. Use `Predicate` helpers rather than hand-written type guards. Use `DateTime` and `Clock`, never `Date.now()`, so tests control time.
- **No hand-rolled state machines or reducers.** State is an append-only event log plus derived projections. Concurrency uses fibers, `Queue`, `PubSub`, `Deferred`, `FiberMap` and `Stream`. Retries, timeouts and cron jobs use `Schedule`.
- **`async`/`await`** is allowed only at SDK adapter edges, wrapped in `Effect.tryPromise` or `Stream.fromAsyncIterable`.

## Runtime

The daemon runs on **Node 24**, which supports type stripping natively, so run `node apps/daemon/src/bin/domo.ts`. Bun is used only for `bun install`. Both agent SDKs target Node, and SQLite uses `@effect/sql-sqlite-node` (the built-in `node:sqlite`). Don't import `bun:*` modules. Because of type stripping, avoid TS-only runtime syntax: no `enum`, no `namespace`, no parameter properties.

## TypeScript

The compiler runs with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Don't use `any`, non-null `!`, or `as` casts, except a documented cast at an SDK boundary. The Effect language service plugin is enabled, and its warnings count as errors.

## Web

- The client is `DomoClient` (`AtomRpc` over one WebSocket at `/rpc`). State lives in Effect Atom and is fed by the RPC stream: history once, then the live feed folded by `chat/view.ts`. Components are small and presentational.
- Styling is plain CSS with variables in `apps/web/src/styles.css` (no Tailwind). Use tokens only, with no ad-hoc colors. The paper grain (the only texture, with no ruled lines) and the "night paper" dark theme come from tokens. `--line` is the prose line-height and the spacing unit. Palette is graphite ink with a sage accent (`--accent`), on cool laid paper; no navy or blue. Agent prose is Literata, the user's messages are Instrument Sans.
- The composer says "Message Domo…". There is no per-message model picker: Domo routes, from the default model chosen in settings. Typing `@` at the start of a message suggests models (`chat/MentionMenu.tsx`). Picking one pins the current topic to that model; nothing else in the UI mentions aliases.
- A dropped connection fails the feed instead of silently reopening it, so `chatAtom` reconnects through fresh history and never misses what happened meanwhile (a reply finishing, a restart interrupting one). Don't turn on the RPC protocol's `retryTransientErrors`.
- Sending a new message closes the topic's open Choice and Questions cards as "moved on" (`skipOpenChoices`, `ChoiceSkipped`), so "needs you" only counts what still waits on the user. Cards in other topics stay open.
- Feed events may only append or complete messages. Never reorder or remove anything already on the page (UX-02).
- Phone width (375px) is the first layout target. Every action works without hover. Respect `prefers-reduced-motion`.
- Every interactive element has a stable `data-testid`.

## Built to be self-tested (non-negotiable)

The Lab improves domo without a human watching, so every change must be testable by a machine.

- **Coverage:** every feature ships with a test. Daemon logic gets a `@effect/vitest` test. UI behavior gets a Playwright flow plus at least one check that maps to a UX rubric item.
- **Browser tests run in parallel:** each Playwright worker starts its own daemon (echo provider, fresh temporary home, free port) in `apps/web/e2e/fixtures.ts`. Specs import `test` and `expect` from there, and a project sets extra daemon environment with `daemonEnv`. Tests on one worker still share its daemon, so use unique text.
- **No live models in tests.** Use `FakeProvider`, which replays fixture JSONL, and record new fixtures with the provider recorder.
- **Telemetry:** every user-facing behavior emits a typed `TelemetryEvent` from `packages/domain`. If friction can't be measured, the Lab can't improve it.
- **Injectable environment:** home directory, port, clock and providers all come from `DomoConfig` or layers. Nothing may assume it is the only running instance, because shadow instances run side by side.

## Agent-owned vs human-owned files

- **Agent-owned (live in `~/.domo`, never in this repo):** memory, profile, skills after seeding, lab ledger, golden conversations.
- **Human-owned:** `constitution.md`, `evals/rubric/**`, judge prompts, promotion thresholds. The Lab and any autonomous session must never modify them. A check rejects commits that do.

## DomoMcp (the agent's own tools)

- `apps/daemon/src/mcp/DomoMcp.ts` is one Streamable-HTTP MCP server at `/mcp`, given to every agent run of both providers. Each run sends an `x-domo-run` header so a tool call attaches to the right reply (registered on `ChatBus`).
- The UI tools are `render_choice`, `render_questions`, `render_comparison`, `render_checklist` and `render_visual`. A Questions card (2–4 short open questions) is answered through the same `Answer` RPC as a Choice: the answers go back as one free-text message from the user. A Visual is agent-written HTML. It runs in an `<iframe sandbox="allow-scripts">` (opaque origin, so no cookies, token or storage) under a CSP with no network, sizes itself to its content, and gets Domo's theme as CSS variables. Their schemas enforce the density caps, so a call that breaks a cap fails back to the model. Work receipts are built by the Conductor from tool activity, never by the agent. Before it is shown, `visual/VisualCheck.ts` renders it in headless Chrome at 360px (light) and 640px (dark), runs layout checks (overlap, overflow, text under 11px, script errors), and has Sonnet review the screenshots. Problems go back to the model up to twice; a visual that still has layout faults is never shown, and the model explains in prose instead. The check is best effort: without Chrome, or with `DOMO_VISUAL_CHECK=off`, visuals show unchecked.
- Codex blocks MCP calls under approval policy "never" unless the server sets `default_tools_approval_mode = "approve"`. Set it only for Domo's own server. Guarded actions still go through `ask_user`.
- The echo provider (`DOMO_PROVIDER=echo`) calls the real MCP endpoint for `[[choice]]`, `[[questions]]`, `[[comparison]]`, `[[checklist]]` and `[[visual]]`, so end-to-end tests cover the whole path.

## Turns and background tasks

- Every agent turn runs through `conductor/turn.ts` (`makeTurn`). It attaches Domo's MCP tools, streams the reply, checks approvals live and builds the receipt, so chat replies and background tasks behave the same. Don't add a second run path.
- `Tasks` runs `start_task` work outside the chat's one-at-a-time queue (at most 3 at once). Each task writes into its own reply, whose receipt is "running" until it finishes. Cancelling or a crash always ends the reply.
- At startup, replies still marked streaming (cut off by a restart) are marked as interrupted.

## Reminders

- `reminders/Reminders.ts` keeps scheduled notes and follow-ups (`reminders` table). The agent adds them with `schedule` (ISO time with offset; `task` makes it run as a background task at that time), and manages them with `list_scheduled` and `cancel_scheduled`. A loop delivers due ones every few seconds: each is marked done first (never twice), posted into its topic (unfolding it if it was in Earlier) and sent as a push notification. One that fires more than 10 minutes late says it was missed while Domo wasn't running.
- Every run's system prompt ends with the local date and time (`nowText`), last so the rest stays cacheable.

## Stop, files and memory

- Chat replies run in a `FiberMap` keyed by their message, so the `Stop` RPC interrupts one (or the background task writing it, via `Tasks.stopReply`). `finishStopped` keeps what streamed and adds "Stopped."
- `GET /files/:runId/:index` serves a file a run recorded changing, by its position in that run's list, so nothing else on the machine can be read through it. Text is always `text/plain` under a no-script CSP; the app renders Markdown itself (`FileViewer`).
- Settings › What Domo knows lists every memory note (`SettingsView.memories`), each removable with `ForgetMemory` (archived, never deleted).
- The date-and-gear header is sticky, so settings stay one tap away at any scroll position.
- The `using-domo` seed skill describes the app from the user's side. Update it whenever a user-visible feature changes.

## Images

- The composer attaches up to 4 images (button, paste or drop). The browser shrinks each to 2000px on its longest side (JPEG, or PNG for small screenshots) and uploads it to `POST /images` before sending. The message then carries `ImageRef`s (id plus media type).
- `images/Images.ts` keeps them in `<home>/images/<id>.<ext>`, served at `GET /images/:id`. Both paths are protected like `/rpc`, and the web app adds `?token=` to image URLs. Nothing is deleted.
- A run gets the images of the message it answers: Claude as base64 image blocks, Codex as `local_image` file paths. Only that message's images are sent; older ones stay in the chat for the user.
- Domo shows images in its own replies with `attach_image` (a file it made) or `snapshot_html` (HTML rendered to a 2x PNG in headless Chrome, `VisualCheck.snapshot`, where web fonts may load from Google Fonts and nothing else). They are saved like the user's images and listed on the message (up to 4).
- A message may be images alone. The echo provider reports "(saw N images)" so end-to-end tests cover the whole path.

## Topic folders

- Every topic gets its own folder, `~/.domo/topics/<name>/` (`topics/folders.ts`), the first time it runs, named after its title and never renamed. It starts with `notes.md`. Without a project, the topic's runs and its background tasks work there, so files the agent writes land in the topic. A coding topic keeps its project as the working directory and is still told where its notes are.
- Each run gets the folder path and the current `notes.md` (first 8k characters) as extra system context, and is asked to keep the notes current, quietly. Facts about the user still go to `remember`.
- After each run `notes.md` is indexed (`notes_fts`), and `recall` searches it alongside memories and topic summaries.
- There is no screen for topics or notes: the user asks ("show me the newsletter plan") and Domo shows the file. A topic's first run in its folder starts a fresh provider session (a session can't resume in a new directory), seeded with recent messages. Receipts name a project only for real projects, never the topic folder.

## Goals

- Goals (`goals/`) are durable outcomes that the agent manages with `set_goal`, `update_goal` and `list_goals`. Every turn's system prompt lists the active goals.
- `CheckIns` runs when the user comes back or makes their first visit of a local day (`Presence.touch` returns `greeting`). It posts at most 3 short notes, one per due goal, into the goal's topic. The next check-in moves out by the cadence before the note is written, so a failure never makes it repeat.

## Guarded actions

- `providers/guard.ts` classifies shell commands into the constitution's guarded actions (git push, publish, deploy, deleting files, system settings, sending outside). Quoted text is ignored. Extend the patterns there and add a test for each.
- **Claude:** a `PreToolUse` hook refuses guarded commands unless approved in this run. It runs even when a project's own settings would allow the command. `canUseTool` allows everything else (high autonomy).
- **Codex:** no per-command hook exists, so every Codex run has network off, which makes push, deploy and send impossible. Its built-in web search still works.
- Approval goes only through `ask_user`, with `action` set to the guarded category. It is scoped to one run and checked live, so it unlocks the action immediately. Subagents can't ask, so they report back.
- `ask_user` blocks the tool call until the user answers (up to 25 minutes). A new non-reply message releases it ("moved on"), so the chat never stalls.

## Tidying and presence

- The client reports presence on interaction (`usePresence`). Reports are throttled, but the first interaction after a pause always reports. Reading only counts as presence within 2 minutes of an interaction, so an idle open tab never looks present.
- The daemon's `Tidier` folds topics only while every device has been idle past `awaySeconds` (default 2h; `DOMO_AWAY_SECONDS`), once per absence. The fold rule is the pure `selectFolds`: resolved or a week stale, read past, not the last touched, no open Choice. Nothing is deleted, and each tidy can be undone.
- The page changes only when the user returns. The return response triggers a rebuild that keeps the scroll anchor. Never apply a tidy to a page the user is looking at.
- Topic state (resolved, summary, decision, stakes) comes from the Filer's single post-exchange call. Costly or irreversible decisions get one confirmation note, which is answered without running a model.

## The Lab

- `lab/Lab.ts` runs once per local day, only while the user is away. It turns the week's friction (`lab/friction.ts`, weighted per user message) into one skill-edit hypothesis. It replays the last 5 real exchanges with the current skill and with the edit, and the other provider judges each pair blind with `evals/rubric/judge-prompt.md`, alternating which answer is A. The edit is promoted only if it wins at least once and at least as often as the baseline: it writes the skill, makes a `~/.domo` commit and adds an entry to `~/.domo/lab/ledger.jsonl`.
- After 7 days a promotion is either kept or reverted with `git revert`. It is reverted if friction rose more than 10% (`regressed`).
- The Lab edits skills in `~/.domo/skills` only. Code changes and synthetic-user browser runs come later.

## Running it

- `bun run build:web` builds the PWA, and `bun run serve` starts the daemon on 127.0.0.1:7420, serving the app and `/rpc`.
- For UI work: run `bun run serve`, then `bun run dev:web` (Vite on 5173 proxies `/rpc` to the daemon; set `DOMO_PORT` if it isn't 7420).
- Use `--home ~/.domo-dev --port 7421` for development so test chats stay out of the real agent home.

## Seed skills

- `skills/` in the repo are seeds. At every daemon start, `initHome` copies in any seed skill the home doesn't have yet and commits it, so new skills reach existing installs through `domo update`. A skill already in the home is refreshed from its seed only while its `~/.domo` history is all `chore:` (seeding) commits; once the agent or the Lab has edited it, it's theirs and is never overwritten.

## Settings

- `~/.domo/domo.md` holds the user's own instructions for Domo (`instructions/Instructions.ts`). It's injected into every turn's system prompt right after the persona, with comments stripped. It's human-owned: the settings sheet edits it, Domo may only propose a change through `propose_instructions_change` (saved only on the user's "Save it"), and the Lab never touches it. Every save is a `~/.domo` commit. `profile.md` is different: it's Domo's nightly summary of what it knows, and is rewritten by Sleep.

- The gear beside the date opens the settings sheet (`remote/SettingsSheet.tsx`), so the main page gains only that one quiet icon. It covers notifications, the away clock, the default model, appearance (system, light or dark, per device in `localStorage`, applied as `data-theme` before first paint), the Lab on/off with an undo for each promoted change, what Domo knows, and devices.
- The Filer uses `Settings.backgroundModel` (default Haiku 5.5; `luna` is Codex `gpt-6-luna`, the affordable tier a ChatGPT login offers, since `gpt-*-mini` models aren't available there).
- Model routing: an unpinned topic follows the default model from settings, even after it changes. A leading `@alias` pins its topic to that model (`modelPinned`). The composer suggests the aliases when the user types `@`.
- `settings/Settings.ts` stores only the user's overrides in `meta`; defaults come from `DomoConfig`. Anything that depends on the away clock reads `Settings.awayMs`, never `config.awaySeconds`. Every change emits `SettingChanged`.
- Components follow the "index cards" style: quiet bordered cards on the paper, with a 2px sage border for the pick or the selected value. Settings controls use the same cards.

## Remote (phone)

- The daemon only listens on 127.0.0.1. `scripts/remote.sh` puts it on the tailnet over HTTPS (`tailscale serve`), which the PWA and Web Push need. `scripts/install-launchd.sh` keeps it running at login.
- Domo's home is one always-on Mac (a Mac mini), set up with `scripts/setup-host.sh`. Other computers and phones are clients only: they open `https://<host>.<tailnet>.ts.net` and install nothing. Agent work, including coding, runs on the host's files with the host's Claude and Codex logins.
- Requests from the host owner's Tailscale login (the `Tailscale-User-Login` header that `tailscale serve` sets) need no token, so your own devices never pair. `DOMO_TAILSCALE_USERS` changes the list or turns this `off`. The Tailscale CLI is looked up on PATH and then inside `Tailscale.app`, because the App Store install has no CLI on PATH.
- An access token (`<home>/token`, created on first `serve`) guards `/rpc`, `/mcp` and `/auth` (`http/access.ts`). The app shell stays public. `domo pair` prints the unlocking links and code. The browser sends the token as `?token=` on the WebSocket, and agent runs send it as a bearer header to MCP. `DOMO_TOKEN=off` is for tests only.
- Web Push (`notify/Notifier.ts`, VAPID keys in `<home>/vapid.json`) is sent only for `ask_user`, and only if no device was active in the last minute. The installed app offers notifications once (`PushOffer`), because iOS needs a tap to ask permission.

## Doctor

- `domo doctor` checks the CLIs and their saved logins, then sends one tiny request to Claude (Haiku) and to Codex through the same provider path Domo uses (`liveCheck`). The CLIs' own status commands only read the saved login, so an expired or revoked one looks signed in there; only a real request catches it.
- A reply that fails because a login expired says so in plain words, with the command to sign in again (`conductor/failure.ts`).

## Updating a host

- `domo update` (`update/update.ts`) fast-forwards the checkout to its upstream, runs `bun install --frozen-lockfile` and `bun run build:web`, then restarts the launchd job and waits for `/health` to report a newer `startedAt`. If any of that fails, it resets to the previous commit, rebuilds and restarts. It refuses a checkout with local edits or commits. `--check` only lists what's waiting.
- Keep `/health` public and free of user data.

## Workflow

- `bun run check` (Biome, tsc, vitest) must pass before every commit. `bun run fix` formats.
- Commits follow conventional commit style (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), small and focused, one concern each.
- When you change a convention, update this file in the same commit.
