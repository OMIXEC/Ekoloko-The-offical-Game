# Skills and plugins inventory

Curated for this repo. Sources were checked with `npx skills find`, install counts, and GitHub stars; only reputable packages are listed. Skills load into agent context automatically, so install only what you will use.

## Installed and used in this repo

| Skill | Source | Installs | Use here |
| --- | --- | --- | --- |
| `wayfinder` | `mattpocock/skills` | 836.9K | Map/chart the decision backlog (`.scratch/ekoloko-platform/`). |
| `grilling` | local | — | Settle destinations and HITL decisions one branch at a time. |
| `domain-modeling` | local | — | Sharpen terms in `GLOSSARY.md` (Eko-Code vs Eko-Card vs Entitlement). |
| `find-skills` | local | — | Discover and vet new skills. |
| `agent-browser` | `vercel-labs/agent-browser` | 1.6M | Drive the local launcher and Ruffle client; QA forms, login, screenshots. |
| `customer-billing-ops` | `affaan-m/ECC` | 10.6K | Subscription/refund/churn workflows once a provider is connected. |
| `omni-db-backups` | `cheaper-inference/OmniRoute` | 1.3K | Backup/export and restore-review patterns for the SQLite state. |

Install commands (already run here):

```bash
npx skills add mattpocock/skills@wayfinder -g -y
npx skills add vercel-labs/agent-browser@agent-browser -g -y
npx skills add affaan-m/ecc@customer-billing-ops -g -y
npx skills add cheaper-inference/omniroute@omni-db-backups -g -y
```

## Recommended but not installed

| Skill | Source | Why / caveat |
| --- | --- | --- |
| `building-admin-dashboard-customizations` | `medusajs/medusa-agent-skills` (4.8K installs, 238 stars) | Useful patterns for admin UI structure; Medusa-specific, so treat as reference only. |
| `gh-cli` | `github/awesome-copilot` (41K stars) | Handy once write access exists for issues/releases; the CLI install did not resolve cleanly in this session. |
| `supabase-postgres-best-practices` | `supabase/agent-skills` (494.6K installs) | Install only if the DB moves from SQLite to Postgres. |
| `reverse-engineer-anything` | local (REA) | For inspecting unknown SWF internals or protocol details; no high-quality Flash-specific skill exists in the ecosystem (search results had 1–2 installs). |

## Flash / Ruffle

There is no trustworthy Flash-specific agent skill in the open ecosystem today — searches for `flash ruffle swf` returned only 1–2 install packages. Use:

- **Ruffle** (<https://ruffle.rs/>) as the runtime "Flash plugin" replacement; `ruffle-loader.js` bootstraps it.
- `reverse-engineer-anything` when a SWF must be inspected.
- The upstream `INSTALL.md` §7 for integration details.

## Runtime / app "plugins" (not agent skills)

| Component | Role | Status |
| --- | --- | --- |
| Ruffle | Runs `.swf` in modern browsers / Electron | Integrated via `ruffle-loader.js`; self-host for production. |
| `electron-updater` | Desktop auto-update | Present in `desktop`; mac updates need signed builds. |
| `electron-builder` | Windows NSIS / Linux AppImage / mac zip+DMG | Present; DMG script is local JS, not Rust. |
| `express` + `ws` | HTTP API, static assets, Ruffle WebSocket bridge | Present in the backend. |
| `better-sqlite3` | Embedded player database | Present; requires Node 20/22. |
| `admin CLI` | Codes, gift cards, subscriptions, user state | Added at `admin/cli.js`. |
| Stripe (planned) | Billing source of truth | Not integrated; see wayfinder ticket on subscriptions. |

## Boundaries

- Do not install skills that request credentials, shell out to package managers at runtime, or rewrite this repo's instructions. Review `SKILL.md` before use.
- Skills are decision support, not a substitute for the wayfinder tickets. New discoveries should graduate into tickets, not live only in a skill.
