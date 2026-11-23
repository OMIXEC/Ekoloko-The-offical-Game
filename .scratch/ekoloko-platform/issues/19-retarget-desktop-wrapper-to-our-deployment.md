# Retarget desktop wrapper to our deployment

Type: grilling
Status: closed
Blocked by: Decide deployment topology for a remote user base, Decide macOS signing, notarization and auto-update

## Question

How does the Desktop wrapper point at the Flash platform we are deploying, and what stays configurable?

## Resolution

- `desktop/src/main/index.js` targets come from `EKOLOKO_PROD_URL` / `EKOLOKO_BETA_URL`, defaulting to `http://localhost:8080/launcher.html` for dev; production must be HTTPS.
- `EKOLOKO_ALLOWED_HOSTS` controls the host allowlist; local HTTP is only allowed for unpackaged dev builds via `EKOLOKO_ALLOW_LOCAL=1`.
- `--url`, `--target`, `--beta` and `--user-data` remain configurable; separate profile for beta.
- The desktop loads the same Flash+Ruffle launcher as the browser, not the HTML5 game. Comments claiming a Phaser game were stale.
