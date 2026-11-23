#!/usr/bin/env bash
# Install/pin backend + desktop, reapply local patches, build, init admin tables.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_REPO="https://github.com/systems7430-bit/Ekoloko-Server-Files.git"
DESKTOP_REPO="https://github.com/ekolokonet/ekoloko-desktop-app.git"
SERVER_SHA="0ef65ea83d4991069a1251b0776c9d6fbdf867b9"
DESKTOP_SHA="409e673eb26e865006cc2a3645ec384de665d8af"

# better-sqlite3@11 ships prebuilds for Node 20/22, not 26.
if [ -x "$HOME/.nvm/versions/node/v22.22.0/bin/node" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
fi
NPM_BIN="${NPM_BIN:-$(command -v npm)}"
echo "Using node $(node -v), npm $(npm -v)"

clone_or_update() {
  local dir="$1" url="$2" sha="$3"
  if [ -d "$dir/.git" ]; then
    echo "==> $dir has upstream git; resetting to pinned $sha"
    git -C "$dir" fetch --depth 1 origin "$sha"
    git -C "$dir" reset --hard "$sha"
    echo "==> reapplying local patch"
    git -C "$dir" apply "$ROOT/patches/$(basename "$dir" | sed 's/^backend$/server-database-layer/;s/^desktop$/desktop-local-target/').patch"
  elif [ -d "$dir" ]; then
    echo "==> $dir is a committed, patched snapshot; skipping clone"
  else
    echo "==> cloning $url into $dir"
    git clone --depth 1 "$url" "$dir"
    git -C "$dir" reset --hard "$sha"
    git -C "$dir" apply "$ROOT/patches/$(basename "$dir" | sed 's/^backend$/server-database-layer/;s/^desktop$/desktop-local-target/').patch"
  fi
}

clone_or_update "$ROOT/backend" "$SERVER_REPO" "$SERVER_SHA"
clone_or_update "$ROOT/desktop" "$DESKTOP_REPO" "$DESKTOP_SHA"

# Our own protocol glue lives in the public repo, not in the vendored snapshot.
echo "==> installing local protocol and admin glue"
mkdir -p "$ROOT/backend/server/src/http" "$ROOT/backend/server/src/protocol" "$ROOT/backend/server/src/admin"
cp "$ROOT/glue/SessionToken.ts" "$ROOT/backend/server/src/http/SessionToken.ts"
cp "$ROOT/glue/ProtocolBridge.ts" "$ROOT/backend/server/src/protocol/ProtocolBridge.ts"
cp "$ROOT/glue/admin/"*.ts "$ROOT/backend/server/src/admin/"
cp "$ROOT/glue/server/package.json" "$ROOT/glue/server/package-lock.json" "$ROOT/glue/server/tsconfig.json" "$ROOT/backend/server/"

echo "==> installing dependencies"
(cd "$ROOT/backend/server" && "$NPM_BIN" ci --no-audit --no-fund)
(cd "$ROOT/desktop" && "$NPM_BIN" ci --no-audit --no-fund)

echo "==> building"
(cd "$ROOT/backend/server" && "$NPM_BIN" run build)
(cd "$ROOT/desktop" && "$NPM_BIN" run check)

echo "==> initialising admin tables"
node "$ROOT/admin/cli.js" init

echo "Done. Next: cp .env.example .env && ./scripts/dev.sh"
