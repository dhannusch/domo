#!/bin/sh
# Keeps the Domo daemon running on this Mac (starts at login, restarts if it stops).
# Remove: launchctl bootout "gui/$(id -u)/com.domo.daemon" && rm ~/Library/LaunchAgents/com.domo.daemon.plist
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
HOME_DIR="${DOMO_HOME:-$HOME/.domo}"
PLIST="$HOME/Library/LaunchAgents/com.domo.daemon.plist"
TAILSCALE="$(command -v tailscale 2>/dev/null || true)"
[ -x "$TAILSCALE" ] || TAILSCALE=/Applications/Tailscale.app/Contents/MacOS/Tailscale

# Your Tailscale login, looked up now: a process started by launchd can't always ask
# Tailscale itself, and this is what lets your own devices in without a token.
OWNER="${DOMO_TAILSCALE_USERS:-$("$TAILSCALE" status --json 2>/dev/null | "$NODE" -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try { const j = JSON.parse(s); process.stdout.write(j.User[String(j.Self.UserID)].LoginName || "") } catch {}
})' || true)}"
if [ -n "$OWNER" ]; then
  ENV_OWNER="<key>DOMO_TAILSCALE_USERS</key><string>$OWNER</string>"
  echo "Your devices signed in to Tailscale as $OWNER won't need pairing."
else
  ENV_OWNER=""
  echo "Couldn't read your Tailscale login; every device will need the token from domo pair."
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME_DIR/logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.domo.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--no-warnings</string>
    <string>$REPO/apps/daemon/src/bin/domo.ts</string>
    <string>--home</string><string>$HOME_DIR</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>$ENV_OWNER<key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME_DIR/logs/daemon.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/logs/daemon.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.domo.daemon" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Domo is running and will start at login. Logs: $HOME_DIR/logs/daemon.log"
