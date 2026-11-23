# Establish one public-host configuration source

Type: task
Status: open
Blocked by:

## Question

Which single env value drives client config, Ruffle socket proxy, desktop targets and deploy configs in dev and prod?

## Current state

Dev is consistent: `EKOLOKO_HOST` drives generated `urls_general.xml` and `sfs_servers.xml`, and generated config is served before vendored snapshots. Still open: concrete ngrok hostname, Vercel rewrites to the GCloud backend, HTTPS/WSS-only config generation, and a single `EKOLOKO_PUBLIC_HOST` variable wired through `.env.example`, Compose, Terraform and `vercel.json`.
