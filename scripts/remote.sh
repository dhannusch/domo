#!/bin/sh
# Exposes the Domo daemon on your tailnet only, over HTTPS (needed for the PWA
# and Web Push). Nothing is published to the internet. Undo: tailscale serve reset
set -eu
PORT="${DOMO_PORT:-7420}"
tailscale serve --bg --https=443 "http://127.0.0.1:${PORT}"
tailscale serve status
echo
echo "Now run 'node apps/daemon/src/bin/domo.ts pair' and open the phone link on your iPhone,"
echo "then Share > Add to Home Screen."
