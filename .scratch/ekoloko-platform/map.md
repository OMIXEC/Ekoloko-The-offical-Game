# Wayfinder map — Ekoloko platform consolidation and playability

Type: map
Status: charting complete; work in progress

## Destination

A playable, deployable Ekoloko platform in one consolidated repo: the preserved Flash client runs through self-hosted Ruffle against the TypeScript game server, with a working account/gift-card/admin surface, a safe V1 preservation branch, and production-ready dev/deploy guidance.

## Notes

- Domain: preservation/re-implementation of a Flash-era children's virtual world. Canonical game = Flash client + `systems7430-bit/Ekoloko-Server-Files`. The HTML5 game (`play.ekoloko.org`) is out of scope.
- Tracker: local markdown under `.scratch/ekoloko-platform/` is canonical. GitHub writes are unavailable (read-only token; repo has no commits/remote). Intended public remote: `https://github.com/OMIXEC/Ekoloko-The-offical-Game.git`.
- Skills to consult: `wayfinder`, `grilling` + `domain-modeling` for HITL decisions, `research`, `prototype`, `find-skills`, `reverse-engineer-anything` (REA) for shipped-artifact or runtime evidence.
- Refer to tickets by name, never bare number. Names wrap their links.
- Running stack: Node 22, `EKOLOKO_HOST=localhost GAME_ASSETS_ROOT=<repo>/client npm --prefix backend/server start`. Health at `/health`.
- QA: `node tests/qa/session-smoke.mjs`; `cd tests/qa && npx playwright test` (3/3 passing). Both are CI gates.
- Current account: `orimiz` / `Iorimiz11`, full dev loadout. `DevMax` / `DevMax123` remains the original dev superuser.
- 2026 baseline: Node 22 LTS, self-hosted Ruffle 0.8.0, Electron 45, Playwright 1.65, HTTPS/WSS only, no foreign build URLs, audited dependencies, single-instance state documented.
- Canonical term **V1 baseline**: immutable upstream snapshot in `source/origin/V1`. **Working line**: `master`, which drives builds; nothing merges back into V1.
- Canonical term **playable session**: auth → `logOK` → room list → `joinOK` → room data → world canvas, with zero `Unhandled` commands on that path. Automated browser currently stops at room data; visual world render remains unverified in headless Chromium.

## Decisions so far

- [Verify the TypeScript server boots and serves a playable session](issues/01-verify-server-runtime.md): builds and starts on Node 22 after the DB shim; full socket session works; visual world render still unverified.
- [Inventory asset duplication between the mirror and the server client](issues/02-inventory-asset-duplication.md): `client/` is canonical; ~578 MB total, 371 cache-artifact files in conf; 1,927 dedupe candidates staged, not applied.
- [Map client endpoints to server routes and handlers](issues/03-map-client-endpoints-to-server-routes-and-handlers.md): startup and redemption routes now real; `ExtensionRouter` covers 100+ IDs; minor legacy actions remain stubs.
- [Audit security posture before public deployment](issues/04-audit-security-posture.md): seeded credentials, MD5, wildcard CORS/crossdomain and no rate limiting are the blockers; children's-data scope still open.
- [Acquire write access or ratify local tracker](issues/05-acquire-write-access-or-ratify-local-tracker.md): local markdown tracker ratified; no GitHub issue writes.
- [Define admin identity, roles and authentication](issues/06-define-admin-identity-and-authentication.md): staff in `admin_users`, roles viewer/operator/admin/owner, TOTP on writes, Redis sessions in prod.
- [Define subscription and entitlement model](issues/07-define-subscription-and-entitlement-model.md): admin store authoritative for billing; `premium/pioneer/gold/ranger` entitlements mirrored to the Game account.
- [Define Eko-Code and Eko-Card lifecycle and redemption protocol](issues/09-define-eko-code-and-eko-card-lifecycle.md): hashed single-use codes, reward payload defined, HTTP redemption endpoint chosen.
- [Prototype redemption API contract and schema](issues/10-prototype-redemption-api-contract.md): contract realized in `redeem_batches`/`redeem_codes`/`entitlements` plus the HTTP endpoint.
- [Decide deployment topology for a remote user base](issues/11-decide-deployment-topology-for-a-remote-user-base.md): ngrok for dev; Vercel static + GCP Cloud Run backend in one project; AWS DR; single sticky instance.
- [Define package and asset update policy](issues/14-define-package-and-asset-update-policy.md): lockfiles, Node 22, pinned Ruffle/Electron/Playwright, stable asset names, staged dedupe.
- [Verify Ruffle compatibility for the SWF set](issues/15-verify-ruffle-compatibility-for-the-swf-set.md): 0.8.0 self-hosted renders the client; socket bridge works; world render not certified.
- [Research macOS DMG automation options](issues/16-research-macos-dmg-automation-options.md): existing JS + `hdiutil` on macOS CI; Rust rejected.
- [Decide macOS signing, notarization and auto-update](issues/17-decide-macos-signing-notarization-and-auto-update.md): unsigned until an Apple Developer ID is provisioned; right-click → Open; auto-update off on macOS.
- [Prototype release workflow patch for macOS DMG](issues/18-prototype-release-workflow-patch-for-macos-dmg.md): desktop matrix builds DMG/zip and uploads artifacts; release gate waits on all jobs.
- [Retarget desktop wrapper to our deployment](issues/19-retarget-desktop-wrapper-to-our-deployment.md): env-driven prod/beta targets, HTTPS allowlist, dev-only local HTTP, same Ruffle launcher.
- [Wire the existing SmartFox protocol stack into the server entrypoint](issues/23-wire-the-existing-smartfox-protocol-stack.md): `SocketServer` + `ExtensionRouter` + `ProtocolBridge` replace the hand-rolled handler; no hardcoded identity.
- [Implement Playwright end-to-end session QA](issues/26-implement-playwright-end-to-end-session-qa.md): 3 specs covering registration, browser socket session and single-use redemption; CI `qa` job added.
- [Add CI gates for protocol fixtures and Playwright](issues/30-add-ci-gates-for-protocol-fixtures-and-playwright.md): links, backend, smoke, desktop, Docker, Terraform and Playwright all gate release.
- [Implement the real gift-card redemption endpoint](issues/31-implement-gift-card-redemption-endpoint.md): `redeemCard.action` applies rewards transactionally and enforces single-use.
- [Create the orimiz developer account with full entitlements](issues/32-create-orimiz-developer-account-with-full-entitlements.md): account id 4 with max dev state, used by smoke and Playwright suites.

## Not yet specified

- Concrete public hostname and DNS/TLS facts for ngrok, Vercel and GCP: a single `EKOLOKO_PUBLIC_HOST` must drive config generation, Ruffle WSS, desktop targets, Terraform and `vercel.json` (see [Establish one public-host configuration source](issues/24-establish-one-public-host-config-source.md) and [Bind Ruffle socket proxy to the public WSS endpoint](issues/25-bind-ruffle-socket-proxy-to-public-wss.md)).
- Actual provisioning facts — project IDs, domain, IP, certificates, deploy identity and secret locations (see [Provision infrastructure and secrets](issues/12-provision-infrastructure-and-secrets.md)).
- Backup cadence, off-host storage, restore drill, RPO/RTO and rollback triggers (see [Define backup, restore and rollback standard](issues/13-define-backup-restore-and-rollback-standard.md)).
- Admin dashboard IA review: which actions are read-only, which need 2FA re-auth, which need a second approver (see [Sketch admin dashboard information architecture](issues/08-sketch-admin-dashboard-information-architecture.md)).
- Observability and incident response: log destination/retention, alerts, severity, on-call and post-incident shape (see [Define observability and incident response scope](issues/20-define-observability-and-incident-response-scope.md)).
- Compliance depth — COPPA / GDPR-K applicability, consent, parental verification, chat retention, moderation and DSAR handling (see [Define compliance and moderation scope](issues/21-define-compliance-and-moderation-scope.md)).
- Legal/licensing position for third-party assets and the exact safe-files commit set; original icon artwork must be remade (see [Establish license notices, original icons and safe public-repo content](issues/28-establish-license-notices-icons-and-safe-repo-content.md)).
- Creation mechanics for the immutable V1 branch from pinned upstreams, including private remote placement (see [Preserve the pristine V1 baseline in source/origin/V1](issues/22-preserve-pristine-v1-baseline.md)).
- Copy-paste multi-cloud guidance text, including AWS DR and optional Azure/Railway/VPS templates (see [Publish multi-cloud deployment guidance](issues/27-publish-multi-cloud-deployment-guidance.md)).
- Staging procedure for conf-cache cleanup and the 1,927-file dedupe quarantine (see [Optimize asset serving and prune cache artifacts](issues/29-optimize-asset-serving-and-prune-cache-artifacts.md)).
- Visual world render in a normal browser after `joinOK`; headless Chromium closes the socket before a room SWF request.
- Exact subscription SKUs, price points and trial rules; payment provider wiring; mapping of `ekoCode_iw.xml` / `ekoCard_iw.xml` error strings to HTTP responses.

## Out of scope

- [Research macOS DMG automation options](issues/16-research-macos-dmg-automation-options.md): Rust does not solve macOS DMG delivery here; the existing JS + `hdiutil` script plus a macOS CI runner does, and signing/notarization is the real requirement.
- Migrating to the HTML5 game at `play.ekoloko.org`, or maintaining two game tracks in parallel — the destination fixes Flash + the TypeScript server as canonical.
- Mobile clients, console ports, and a rewritten game engine.
- Publishing third-party Flash assets and the proprietary-licensed desktop source to the public remote before license review; the bootstrap-script + patches approach replaces them.
