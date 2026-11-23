# Decide macOS signing, notarization and auto-update

Type: grilling
Status: closed
Blocked by: Research macOS DMG automation options

## Question

Will releases be signed and notarized, and what is the user experience until then?

## Resolution

Until an Apple Developer ID and notarization credentials are provisioned, macOS builds are unsigned: users must right-click → Open, and auto-update stays off on macOS because Squirrel.Mac requires a signed app. Release criteria to flip the switch: developer-certificate ownership, `APPLE_IDENTITY` and notarization credentials in CI secrets, and a verified signed DMG smoke test. Ownership of the Apple account is still an open operational fact, not a design decision.
