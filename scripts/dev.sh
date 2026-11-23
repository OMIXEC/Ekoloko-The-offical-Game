#!/usr/bin/env bash
# Run the backend with client as the Flash asset root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export EKOLOKO_HOST="${EKOLOKO_HOST:-localhost}"
export GAME_ASSETS_ROOT="${GAME_ASSETS_ROOT:-$ROOT/client}"
export HTTP_PORT="${HTTP_PORT:-8080}"
export TCP_PORT="${TCP_PORT:-9339}"

if [ -x "$HOME/.nvm/versions/node/v22.22.0/bin/node" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
fi

echo "==> health:  http://$EKOLOKO_HOST:$HTTP_PORT/health"
echo "==> client:  http://$EKOLOKO_HOST:$HTTP_PORT/launcher.html"
echo "==> admin:   node admin/cli.js help"
exec npm --prefix "$ROOT/backend/server" start
