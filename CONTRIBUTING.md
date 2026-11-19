# Contributing to Domo

Thanks for helping. Domo is opinionated, so please read this and [`AGENTS.md`](AGENTS.md) before opening a pull request.

## Before you start

- For anything bigger than a small fix, open an issue first and describe the problem from the user's side. The product principles (one chat, four things to learn, nothing moves while the user is looking, prose first) are deliberate. Changes that add chrome or new concepts to the main page are unlikely to be accepted.
- `constitution.md` and `evals/rubric/` are human-owned guardrails. Changes to them need an issue and a maintainer's agreement. Domo's own self-improvement loop is never allowed to edit them.

## Setup

```bash
bun install
bun run check
bun run test:e2e   # needs Google Chrome
```

## Making a change

- Follow the conventions in `AGENTS.md`: Effect services and tagged errors, schemas at every boundary, append-only events instead of state machines, and a `data-testid` on every interactive element.
- Every feature ships with a test. Daemon logic gets an `@effect/vitest` test. UI behavior gets a Playwright flow plus a check that maps to a UX rubric item.
- Tests never call live models. Use the echo provider (`DOMO_PROVIDER=echo`) and its directives, or `FakeProvider` fixtures.
- Every user-facing behavior emits a typed telemetry event, so the Lab can measure friction.
- `bun run check` must pass. Keep commits small and use conventional messages (`feat:`, `fix:`, `docs:`…).
- When you change a convention, update `AGENTS.md` in the same pull request.

## Reporting bugs

Include what you did, what you expected, what happened, and the daemon log around it (`~/.domo/logs/daemon.log` when run under launchd). Remove anything personal first: conversation text, memory notes, and your tailnet name.
