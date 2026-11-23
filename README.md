# Ekoloko — full local build

Self-contained monorepo for the Flash Ekoloko preservation build: client, game server, desktop wrapper, admin tooling, and CI. No links to the original hosted builds remain in app code or config.

Canonical stack: **Flash client + replacement Node/TypeScript server**. The HTML5 game at the original public host is out of scope.

---

## 1. Hierarchy

```
.
├── client/                      FRONTEND — Flash assets served at /ekoloko
│   ├── ekoloko/                 .swf, XML, HTML wrappers, media
│   ├── ekoloko-i18n/            localization endpoints
│   ├── games/  moderator/  ekoloko-mod/  ekoloko-web/  staging/
│   ├── vendor/ruffle/           self-hosted Ruffle (no CDN)
│   ├── launcher.html            clean entry point
│   ├── ruffle-loader.js         loads /vendor/ruffle/ruffle.js
│   └── index.html               legacy entry (kept for reference)
├── backend/                     BACKEND — pinned server snapshot + local repair
│   ├── server/                  Express + SmartFox TCP + WebSocket + SQLite
│   │   ├── src/                 protocol, extensions, http, database, static
│   │   ├── config/              generated client config XML
│   │   ├── static-data/         generated JSON
│   │   └── database/            local SQLite (ignored by git)
│   └── client -> ../client      upstream layout alias; no duplicate assets
├── desktop/                     DESKTOP — Electron 45 wrapper
│   ├── src/main/                window, URL allowlist, updater, DMG support
│   ├── scripts/                 check.js, createMacDmg.js
│   └── build/                   icons, entitlements, DMG background
├── admin/                       ADMIN SIDE
│   └── cli.js                   codes, gift cards, subscriptions, user state
├── docker/                      container packaging (backend, nginx client)
├── docker-compose.yml           local production-parity stack
├── terraform/                   GCP primary + AWS mirror/DR (modules + envs)
├── patches/                     local patches (upstream repairs, reapplied by bootstrap)
├── scripts/                     bootstrap, dev, desktop build, link sanitizer
├── .github/workflows/build.yml  CI/CD: link check, backend, desktop matrix, tagged release
├── docs/                        operations guide, skills inventory
├── .scratch/ekoloko-platform/   wayfinder map + decision tickets
├── .env.example                 canonical env vars
├── GLOSSARY.md                  domain vocabulary
└── README.md                    this file
```

Pinned upstream snapshots (stored as patched source, not submodules):

| Component | Upstream | Pin |
| --- | --- | --- |
| Backend | `systems7430-bit/Ekoloko-Server-Files` | `0ef65ea83d4991069a1251b0776c9d6fbdf867b9` |
| Desktop | `ekolokonet/ekoloko-desktop-app` | `409e673eb26e865006cc2a3645ec384de665d8af` |

Local repairs in `patches/`:

- `server-database-layer.patch` — restores the missing `src/database/Database.ts`, uses it from `index.ts`, serves the asset root at `/`, and defaults generated hostnames to `localhost` instead of the original public host.
- `desktop-local-target.patch` — targets our host via `EKOLOKO_PROD_URL`, allowlists our hosts via `EKOLOKO_ALLOWED_HOSTS`, removes the external Discord/presence URLs, and migrates only allowed-host cookies.

---

## 2. Quickstart

```bash
cp .env.example .env
./scripts/bootstrap.sh
./scripts/dev.sh
```

Open:

- Client <http://localhost:8080/launcher.html>
- Health <http://localhost:8080/health>
- Admin `node admin/cli.js help`

`bootstrap.sh` installs dependencies, builds both apps, and initializes admin tables. `dev.sh` runs the backend with `GAME_ASSETS_ROOT=$PWD/client`, so `client` is the single source of frontend assets. Node 20/22 required (**Node 26 breaks `better-sqlite3@11`**; scripts prefer nvm v22.22.0).

Smoke test: health → launcher renders SWF through local Ruffle → register/login → admin batch/redeem (below). Check the server log for `[TCP] Unhandled:` — those are upstream stub commands.

---

## 3. Admin side

`admin/cli.js` is the server-side management tool for dev team and named users. Every mutation writes `audit_log`; codes are SHA-256 hashed at rest and shown once.

```bash
# Full state for a specific user (no password hashes)
node admin/cli.js user:show --user TestUser

# Codes / gift cards / rav cards
node admin/cli.js batch:create --type gift --count 50 \
  --reward '{"coins":1000,"credits":10,"itemIds":[12],"entitlement":"pioneer"}' \
  --days 30 --actor ops --out gift-cards.csv
node admin/cli.js batch:list
node admin/cli.js codes:list --batch 1
node admin/cli.js code:redeem --code GIFT-XXXX --user TestUser
node admin/cli.js code:revoke --code GIFT-XXXX

# Subscriptions / entitlements
node admin/cli.js subscription:grant --user TestUser --plan premium --days 30
node admin/cli.js subscription:revoke --user TestUser
node admin/cli.js subscription:list

# Dev superuser (all entitlements) + staff owner
node admin/cli.js user:create --username DevMax --password DevMax123
node admin/cli.js user:max --user DevMax
node admin/cli.js admin:add --username ops --role owner

# Access + audit
node admin/cli.js admin:list
node admin/cli.js audit:list --limit 50
```

`user:max` grants exactly: coins 9,999,999 / credits 999,999 / level 999 / xp 999,999 / premium 1 / moderator 1 / ranger 5, entitlements `premium`, `pioneer`, `gold`, `ranger`, 20 items, 10 cards, and one `all-entitlements` subscription. DevMax is a game account; `ops` (role `owner`) is the separate staff identity.

`user:show` returns account, inventory, animals, cards, quests, house, potions, storage, scores, subscriptions, entitlements, and recent redemptions. Use it for support and specific-user investigations.

Subscriptions today are entitlement records, not payment processing. Recommended model: Stripe (or equivalent) as billing source of truth, signed webhooks syncing our `subscriptions`/`entitlements` snapshot. Never store card data. Decisions are tracked in the wayfinder map.

---

## 4. Desktop builds

```bash
./scripts/build-desktop.sh           # Windows NSIS
./scripts/build-desktop.sh --linux   # AppImage
./scripts/build-desktop.sh --mac     # zip + styled DMG (macOS host only)
```

Packaged builds accept only hosts in `EKOLOKO_ALLOWED_HOSTS` over HTTPS; dev runs allow localhost with `EKOLOKO_ALLOW_LOCAL=1`. Defaults already point at `http://localhost:8080/launcher.html`.

**macOS DMG: no Rust.** `desktop/scripts/createMacDmg.js` builds the styled DMG with `hdiutil` + `osascript`; CI adds a `macos-latest` job. Unsigned builds show a Gatekeeper warning and disable auto-update — signing + notarization with an Apple Developer ID is the remaining decision.

---

## 5. CI/CD

`.github/workflows/build.yml` runs on push/PR and on tags:

| Job | What it does |
| --- | --- |
| `links` | `scripts/sanitize-links.py --check` fails if a foreign-build URL reappears. |
| `backend` | Node 22, `npm ci`, `tsc`, admin CLI smoke (batch create/list). |
| `desktop` | Windows / Linux / macOS matrix; `npm run check`; NSIS / AppImage / zip+DMG; uploads artifacts. |
| `docker` | Builds backend + client images; pushes to GHCR on `v*` tags. |
| `terraform` | `fmt -check` + `validate` for all GCP/AWS envs (no cloud creds needed). |
| `release` | On `v*` tags, publishes all artifacts via `softprops/action-gh-release`. |

Bump `desktop/package.json` version to ship a desktop release; the tag drives the GitHub release.

---

## 6. Containers and cloud (production)

```bash
docker compose up --build          # local: nginx :80 + backend :8080/:9339
docker build -f docker/backend.Dockerfile -t ekoloko-backend .
docker build -f docker/client.Dockerfile -t ekoloko-client .
```

Terraform (GCP primary, AWS mirror/DR): see `terraform/README.md`.

```bash
cd terraform/envs/gcp/prod
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=../backend.hcl.example
terraform validate && terraform plan && terraform apply
```

- GCP: Cloud Run backend (1 instance, session affinity) + GCS/Cloud CDN.
- AWS: ECS Fargate (1 task, ALB stickiness) + S3/CloudFront as warm DR mirror.
- State is still in memory → keep `max_instances = 1` / `desired_count = 1`.
- Secrets come from Secret Manager / Secrets Manager; no keys in the repo.

---

## 7. Safe optimizations applied

- Ruffle config: `quality: "medium"` (2× MSAA instead of 4×), no splash/preloader, no polyfills, self-hosted WASM, `maxExecutionDuration: 15`.
- `scripts/dedupe-assets.py` reports **1,927 redundant scrape artifacts (~275 MB)** with a dry run; `--apply` quarantines them reversibly into `client/.dedupe-trash/`. Not applied — run it in staging and retest SWF references first.
- Package wave 1 applied: `ws` 8.23.0, `uuid` 14.0.3, `@types/uuid` 11.0.0, removed unused `crypto-js`. Backend build + boot smoke pass.
- Next waves (not yet applied): Express 4→5, better-sqlite3 11→13, TypeScript 6→7, then MD5→Argon2id and Node 22→current LTS.

---

## 8. Removing foreign build links

`scripts/sanitize-links.py` rewrites original hosted domains, Flash download CDNs, ad/tracker hosts, and Discord/unpkg URLs to `/` inside app code and config — 1,437 replacements across ~250 files already applied. The link check in CI enforces it. Ruffle is self-hosted at `client/vendor/ruffle/` so no CDN is needed.

Documentation links to upstream repos are intentionally kept for provenance.

---

## 9. Session verification

Dev accounts created locally:
- `DevMax` / `DevMax123` (original dev superuser).
- `orimiz` / `Iorimiz11` (current account, full dev loadout via `user:max`).

HTTP auth: `GET /ekoloko-web/login.action?userName=orimiz&password=Iorimiz11` → `["login_ok_mod"]` and sets a signed `ekoloko_user` cookie.

**Playable session — verified.** `node tests/qa/session-smoke.mjs` drives the exact frames the Flash client sends and asserts the full path: `apiOK` → `logOK` + full player data → `rmList` → `joinOK` + room data. It passes against the local stack.

What changed to get there:
- `index.ts` no longer uses the hand-rolled ten-command handler. It now starts the preserved SmartFox stack: `SocketServer` + `SmartFoxProtocol` + `ClientSession` + `ServerState` + `ExtensionRouter` (20+ extensions). See `backend/server/src/protocol/ProtocolBridge.ts`.
- `/ws` inherits the HTTP-authenticated identity from the signed cookie (`SessionToken.ts` + `WebSocketProxy.ts`), so no username is hardcoded.
- Generated config now wins over the vendored `client/ekoloko/conf/` snapshots; `sfs_servers.xml` is generated with all channels from the real host.
- Rooms are seeded from `S_ROOMS_DATA.json` (`jungle101.swf`, etc.) instead of a fake `Channel1`.

**Playwright QA** (`cd tests/qa && npx playwright test`, 3/3 passing):
- registration — new account created, correct login accepted, wrong password rejected;
- browser session — HTTP login sets signed cookie, Chromium `/ws` receives `logOK` + player data, `rmList`, `joinOK`, room data;
- gift card — admin creates a single-use code, HTTP `redeemCard.action` applies coins/credits, second redemption rejected.

The CI `qa` job runs the same suite.

**Remaining gap:** driving the Flash form itself with headless CDP is unreliable (field coordinates shift with Ruffle rendering). The browser test drives the same `/ws` path the Flash client uses via `socketProxy`. Visual world render after `joinOK` is still not proven in an automated browser — Ruffle closes the socket (1005) before a room SWF request is observed. Use a normal browser for that visual check.

---

## 10. Deployment and best practices

Full VPS/nginx/TLS/systemd/backup guidance: `docs/EKOLOKO_PLATFORM_GUIDE.md`; upstream install notes: `backend/INSTALL.md`.

Key practices from the repo audit:

- Keep the local Database patch — upstream server does not compile without it.
- Remove seeded `Admin/admin123`; move MD5 passwords to Argon2id/bcrypt with per-user salt.
- Restrict CORS and `crossdomain.xml` to explicit origins.
- Pin Node 20/22; use `npm ci` and lockfiles everywhere.
- Back up SQLite (WAL) off-host with a restore drill before launch.
- Settle COPPA/GDPR-K scope, chat retention, moderation, and privacy notice before public launch.
- Keep filenames stable for SWF/XML asset swaps; use `files_version.xml` for cache busting.

Skills/plugins inventory: `docs/SKILLS_AND_PLUGINS.md`. Decision map: `.scratch/ekoloko-platform/map.md`.
