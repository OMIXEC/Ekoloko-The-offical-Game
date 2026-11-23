# Define package and asset update policy

Type: grilling
Status: closed
Blocked by: Audit security posture before public deployment

## Question

How are dependencies and game assets updated without breaking a live platform?

## Resolution

- Lockfiles are committed and CI uses `npm ci`; Node is pinned to 22 LTS (Node 26 breaks `better-sqlite3@11`).
- 2026 baseline adopted: self-hosted Ruffle 0.8.0, Electron 45, Playwright 1.65, HTTPS/WSS only, no foreign build URLs, no new dependency without audit.
- Wave 1 upgrades applied: `ws` 8.23.0, `uuid` 14.0.3, `@types/uuid` 11.0.0; unused `crypto-js` removed.
- Asset rule: keep filenames stable, use `files_version.xml` for cache busting, stage dedupe before applying, and back up the DB before schema-touching deploys.
