# Optimize asset serving and prune cache artifacts

Type: task
Status: open
Blocked by: Implement Playwright end-to-end session QA

## Question

Which redundant assets can be removed without breaking the game?

## Current state

`client/ekoloko/conf/` still contains 371 encoded query-string artifacts (~4.3 MB). `scripts/dedupe-assets.py --apply` would quarantine 1,927 files (~275 MB) but has not been staged. nginx already sets immutable caching for SWF/WASM/images and no-cache for XML/HTML. Next: add a `scripts/sanitize-conf-cache.py --dry-run/--apply`, stage dedupe, re-run the full QA suite after each batch.
