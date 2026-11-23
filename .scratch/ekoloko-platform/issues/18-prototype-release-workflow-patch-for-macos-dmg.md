# Prototype release workflow patch for macOS DMG

Type: prototype
Status: closed
Blocked by: Decide macOS signing, notarization and auto-update

## Question

What concrete workflow change publishes macOS artifacts alongside Windows and Linux without breaking the existing release gate?

## Resolution

Implemented in `.github/workflows/build.yml`: the desktop matrix adds `macos-latest` with artifacts `desktop/dist/*.dmg`, `*.zip`, `latest-mac.yml`; build runs `npm run dist:mac` then `node scripts/createMacDmg.js`. Unsigned fallback is explicit (`-c.mac.identity=null`). The tagged release job downloads all artifacts after `links`, `backend`, `qa`, `desktop`, `docker` and `terraform` pass.
