#!/bin/sh
# Exposes the Domo daemon on your tailnet only, over HTTPS (needed for the PWA
# and Web Push). Nothing is published to the internet. Undo: tailscale serve reset
set -eu
# The App Store install keeps the CLI inside the app (and a shell alias doesn't reach scripts).
TAILSCALE="$(command -v tailscale 2>/dev/null || true)"
[ -x "$TAILSCALE" ] || TAILSCALE=/Applications/Tailscale.app/Contents/MacOS/Tailscale
PORT="${DOMO_PORT:-7420}"
"$TAILSCALE" serve --bg --https=443 "http://127.0.0.1:${PORT}"
"$TAILSCALE" serve status
echo
echo "Now run 'domo pair' and open the phone link on your iPhone,"
echo "then Share > Add to Home Screen."
