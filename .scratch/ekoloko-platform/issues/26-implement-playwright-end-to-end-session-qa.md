# Implement Playwright end-to-end session QA

Type: task
Status: closed
Blocked by:

## Question

How is registration, login and redemption verified in a real browser and CI?

## Resolution

`tests/qa/` contains a Playwright project with three passing specs: registration/login validation, browser WebSocket session (cookie → `logOK` + player data → `rmList` → `joinOK` + room data), and single-use gift-card redemption. Chromium is installed via `npx playwright install chromium`. CI job `qa` runs the suite; tagged releases depend on it. `node tests/qa/session-smoke.mjs` is the lighter protocol-only check.
