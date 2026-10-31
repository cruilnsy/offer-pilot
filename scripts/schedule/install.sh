#!/bin/zsh
# Install (or reinstall) the daily 7:00 job fetch as a macOS LaunchAgent.
#   zsh scripts/schedule/install.sh            install
#   zsh scripts/schedule/install.sh uninstall  remove
set -e
LABEL="com.offerpilot.fetch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_DIR="${0:A:h:h:h}"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ "$1" == "uninstall" ]]; then rm -f "$PLIST"; echo "removed $LABEL"; exit 0; fi

mkdir -p "$APP_DIR/data"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$APP_DIR/scripts/schedule/fetch-jobs.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$APP_DIR/data/fetch.log</string>
  <key>StandardErrorPath</key><string>$APP_DIR/data/fetch.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL: runs daily at 7:00, log: $APP_DIR/data/fetch.log"
