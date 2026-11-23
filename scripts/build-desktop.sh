#!/usr/bin/env bash
# Build the desktop wrapper. Pass --mac on a macOS host to produce the DMG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/desktop"

if [ -x "$HOME/.nvm/versions/node/v22.22.0/bin/node" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
fi

cd "$DESKTOP"
npm ci --no-audit --no-fund
npm run check

case "${1:-}" in
  --mac)
    [ "$(uname -s)" = "Darwin" ] || { echo "--mac requires a macOS host"; exit 1; }
    npm run dist:mac
    node scripts/createMacDmg.js
    ;;
  --linux)
    npx electron-builder --linux --publish never
    ;;
  *)
    npx electron-builder --win --publish never
    ;;
esac

echo "Artifacts in $DESKTOP/dist"
