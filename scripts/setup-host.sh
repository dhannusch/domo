#!/bin/sh
# Turns this Mac (e.g. an always-on Mac mini) into Domo's home: installs, builds the
# app, keeps the daemon running, puts it on your tailnet, and prints the pairing links.
# Other computers and phones then just open the tailnet link; they install nothing.
#
# Before running: sign in to Tailscale, and to Claude Code and Codex on this Mac:
#   claude auth login        codex login
set -eu
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Install Node 24 first."; exit 1; }
command -v bun >/dev/null || { echo "Install Bun first (it's only the package manager)."; exit 1; }
command -v tailscale >/dev/null || { echo "Install and sign in to Tailscale first."; exit 1; }
bun install
bun run build:web
sh scripts/install-cli.sh
DOMO="node --no-warnings apps/daemon/src/bin/domo.ts"
$DOMO init
$DOMO doctor || true
sh scripts/install-launchd.sh
sh scripts/remote.sh
$DOMO pair
