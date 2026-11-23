# Third-party notices

This repository contains original work plus patches and glue for two upstream projects. The large vendored snapshots are **not committed**; they are fetched locally by `scripts/bootstrap.sh` and rebuilt with the patches in `patches/`.

## Upstream projects

| Component | Origin | Pinned commit | License status |
|---|---|---|---|
| Game client + server | `systems7430-bit/Ekoloko-Server-Files` | `0ef65ea83d4991069a1251b0776c9d6fbdf867b9` | No license file found; all rights reserved by the original author |
| Desktop wrapper | `ekolokonet/ekoloko-desktop-app` | `409e673eb26e865006cc2a3645ec384de665d8af` | `desktop/LICENSE`: proprietary, "no distribution outside ekoloko.org", "no modification" |
| Original game artwork | `ekoloko.org` / Virtual Tweens Ltd. | preserved as-is | No license grant found; original copyright notices remain in the assets |

Copyright in the Flash client, its artwork, sounds and text remains with the original creators. This project preserves them for local, non-public operation and does not claim ownership.

## What is committed here

- Original code written for this consolidation: `admin/cli.js`, `glue/*`, `scripts/*`, `tests/*`, `docs/*`, `README.md`, `GLOSSARY.md`.
- Patches against the pinned upstream commits: `patches/*.patch`.
- Deployment and CI configuration: `.github/`, `terraform/`, `docker/`, `docker-compose.yml`, `.env.example`, `.dockerignore`, `.gitignore`.
- The repository's MIT `LICENSE` applies only to the original work in this repository, not to the vendored upstream assets.

## What is not committed

- `client/` — Flash movies, XML config and media from the original game.
- `desktop/` — Electron wrapper source and its proprietary license.
- `backend/` — verbatim upstream server snapshot. Only the two original glue modules are tracked under `glue/`.

## Reproduction

```
git clone https://github.com/OMIXEC/Ekoloko-The-offical-Game.git
cd Ekoloko-The-offical-Game
./scripts/bootstrap.sh
```

`bootstrap.sh` fetches both pinned upstreams, applies `patches/server-database-layer.patch` and `patches/desktop-local-target.patch`, then copies `glue/SessionToken.ts` and `glue/ProtocolBridge.ts` into the fetched server tree. Icons for a public release must be remade as original artwork before any vendored asset is published; see the wayfinder ticket "Establish license notices, original icons and safe public-repo content".
