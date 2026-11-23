# Inventory asset duplication between the mirror and the server client

Type: research
Status: closed
Blocked by:

## Question

Which asset tree is complete and canonical, how much overlap exists, and what would a safe deduplication look like?

## Resolution

- The canonical client is the vendored tree under `client/` (Flash `.swf`, XML config, i18n, media). The server snapshot ships a partial copy.
- Measured footprint: ~9,363 files / ~578 MB before cleanup.
- `client/ekoloko/conf/` held 371 files / ~4.3 MB of encoded query-string artifacts such as `urls_general.xml%3fr=0.123`; these shadow generated config until serving order was fixed.
- `scripts/dedupe-assets.py --apply` would quarantine 1,927 redundant files (~275 MB). Not applied: staging test required first. Tracked in "Optimize asset serving and prune cache artifacts".
- Minimal serving set: `client/ekoloko`, `client/games`, `client/ekoloko-i18n`, self-hosted `client/vendor/ruffle`, plus generated config from `backend/server/config`.
