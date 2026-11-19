#!/bin/sh
# Keeps the Domo daemon running on this Mac (starts at login, restarts if it stops).
# Remove: launchctl bootout "gui/$(id -u)/com.domo.daemon" && rm ~/Library/LaunchAgents/com.domo.daemon.plist
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
HOME_DIR="${DOMO_HOME:-$HOME/.domo}"
PLIST="$HOME/Library/LaunchAgents/com.domo.daemon.plist"
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
  <dict><key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
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
