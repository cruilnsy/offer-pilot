#!/bin/zsh
# Run by launchd every morning at 7:00 (see install.sh). Logs go to data/fetch.log.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "${0:A:h}/../.." || exit 1
echo "=== $(date '+%F %T') fetch-jobs ==="
pnpm fetch-jobs
