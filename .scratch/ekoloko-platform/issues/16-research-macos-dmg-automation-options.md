# Research macOS DMG automation options

Type: research
Status: closed
Blocked by:

## Question

What is the smallest reliable way to publish a macOS DMG for every release, and is Rust warranted?

## Resolution

Use the existing JS + `hdiutil` script (`desktop/scripts/createMacDmg.js`) on a `macos-latest` GitHub runner. Rust is not warranted: it does not solve DMG delivery or signing. `.github/workflows/build.yml` builds `desktop/dist/*.dmg` and `*.zip` in the desktop matrix and uploads them as artifacts. Signing/notarization remains the real requirement and is tracked separately.
