# Add CI gates for protocol fixtures and Playwright

Type: task
Status: closed
Blocked by:

## Question

Which checks must pass before a release?

## Resolution

`.github/workflows/build.yml` runs: no-foreign-links check, backend build + admin CLI smoke + `tests/qa/session-smoke.mjs`, desktop matrix (Windows/Linux/macOS DMG), Docker image builds, Terraform fmt/validate, and the Playwright `qa` job. The tagged `release` job requires `links`, `backend`, `qa`, `desktop`, `docker` and `terraform`. Protocol fixtures are captured with `EKOLOKO_CAPTURE_FRAMES=1`; a dedicated fixture test suite is still a future improvement.
