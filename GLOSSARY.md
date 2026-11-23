# Glossary

Canonical terms for the Ekoloko platform. No implementation details here.

- **Platform**: the Flash game client, the Node/TypeScript game server, the desktop wrapper, and the operations around them.
- **Client**: the Flash movies (`.swf`), XML configuration, localization files, HTML wrappers, and media presented to a player.
- **Game server**: the Node/TypeScript process that implements rooms, chat, inventory, quests, stores, and mini-games for the Client.
- **Ruffle**: the emulator that runs Flash content in a modern browser.
- **Player**: a person playing the game. A Player owns one game account.
- **Game account**: the persistent player identity held in the game server database. Carries inventory, progress, currency, and an entitlement snapshot.
- **Eko-Code**: a redeemable promotional code. Grants a defined reward to a Player once. Has an expiry and a single use.
- **Eko-Card**: a physical or digital gift card carrying a redeemable code, redeemable through the gift-card flow.
- **Rav-Card**: the rare-item variant of a gift card, redeemable through the rare-item store rather than the general store.
- **Redemption batch**: a named group of codes or cards created together, sharing reward, expiry, and creator.
- **Redemption**: the audited act of applying a code or card to a Game account.
- **Entitlement**: the right to a paid feature (for example premium or pioneer status). Derived from a subscription or a redemption; held as a snapshot in the game server database.
- **Subscription**: a recurring billing relationship with a payment provider that grants an Entitlement while active.
- **Payment provider**: the external system that stores payment instruments and reports billing events. The platform never stores card data.
- **Administrator**: a staff identity with privileged access to management functions. Distinct from a Player and from a moderator.
- **Moderator**: a staff identity responsible for player conduct and chat; a subset of administrative capability.
- **Audit log**: the append-only record of privileged actions, including actor, action, target, and time.
- **Desktop wrapper**: the Electron application that hosts the Client in its own window and handles install/update lifecycle.
- **DMG**: the macOS disk-image format used to distribute the Desktop wrapper.
- **Notarization**: Apple's service that scans and tickets a signed macOS application so Gatekeeper admits it without a warning.
