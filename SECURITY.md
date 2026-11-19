# Security

Domo runs AI agents with high autonomy on your own machine, using your own accounts. Please report security problems privately.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** button on this repository (private vulnerability reporting), not a public issue. Include steps to reproduce, and what an attacker could do with it. You'll get an acknowledgement within a week.

## Threat model, in short

- **Network.** The daemon listens only on `127.0.0.1`. Remote access is meant to go through Tailscale (`tailscale serve`), so only your own devices can reach it. Don't expose the port to the internet.
- **Your Tailscale identity.** `tailscale serve` adds a `Tailscale-User-Login` header to requests from a signed-in tailnet user. It replaces any value the client sent. Domo lets in requests whose login is the host's owner (or one listed in `DOMO_TAILSCALE_USERS`) without the token. A process on the host itself could forge that header by calling `127.0.0.1` directly. Any such process can already read `<home>/token`, though, so this adds no access it didn't have. Set `DOMO_TAILSCALE_USERS=off` to require the token everywhere.
- **Access token.** `/rpc`, `/mcp` and `/auth` require the token in `<home>/token` (created with owner-only permissions). Browsers send it on the WebSocket URL; agent runs send it as a bearer header. Anyone with the token can use your agent, so treat a pairing link like a password.
- **Agent autonomy.** Agents may edit files and run commands in your projects and in `~/.domo`. Guarded actions (git push, publish, deploy, deleting outside a project, system settings, sending outside) are refused unless you approve them in the chat. On Claude this is enforced by a `PreToolUse` hook. Codex runs have network access turned off, because the Codex SDK has no per-command hook.
- **Visuals.** Agent-written HTML runs in an `<iframe sandbox="allow-scripts">` with an opaque origin and a Content-Security-Policy that allows no network. It can't read the token, cookies or storage, or call home. The pre-show check renders it in a headless browser with every request blocked.
- **Self-improvement.** The Lab may only edit skills in `~/.domo/skills`. Every change is a git commit there, and every change can be undone. It can't edit the constitution, the rubric or the judge prompts.
- **Your data.** Conversations, memory and telemetry stay on your machine, in `<home>`. Prompts are sent to Anthropic and OpenAI through their CLIs, under your accounts. Push notifications carry only the question being asked, encrypted end to end to your device's push service.

Known limits: Domo trusts the machine it runs on and everyone on your tailnet who holds the token. Prompt injection from content the agents read (web pages, files) is mitigated by the guarded-action approvals, not prevented.
