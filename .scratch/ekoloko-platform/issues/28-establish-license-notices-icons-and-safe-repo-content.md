# Establish license notices, original icons and safe public-repo content

Type: task
Status: open
Blocked by: Acquire write access or ratify local tracker

## Question

What may be committed to the public remote, and which assets must be replaced?

## Current state

Only `desktop/LICENSE` exists and it is proprietary ("no distribution outside ekoloko.org", "no modification"). Client Flash assets and the server snapshot have no license files, so default is all-rights-reserved. Recommendation: commit only our own code (server glue, admin CLI, docs, CI, Terraform, Docker, scripts, patches), keep vendored `client/`, `desktop/` and verbatim `backend/server/` local via bootstrap scripts, write `docs/THIRD_PARTY_NOTICES.md`, and remake `desktop/icon.ico`, `desktop/build/icon*.png|icns`, `desktop/build/dmg-background.png` and `client/favicon.ico` as original artwork before any public commit.
