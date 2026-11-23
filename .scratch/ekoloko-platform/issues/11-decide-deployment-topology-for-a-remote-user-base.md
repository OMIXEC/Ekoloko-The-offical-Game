# Decide deployment topology for a remote user base

Type: grilling
Status: closed
Blocked by: Map client endpoints to server routes and handlers, Audit security posture before public deployment

## Question

Where does each component run for real remote users, and what are the operational boundaries?

## Resolution

- Local/dev: `localhost:8080` plus an ngrok HTTPS tunnel; one env value drives hosts. Ruffle uses `wss://<host>/ws`.
- Staging/prod: Vercel serves the static client with rewrites for `/ekoloko-web`, `/ekoloko-i18n`, `/BlueBox`, `/ws`, `/health`, `/ekoloko/conf` to a GCP Cloud Run backend in the same GCP project. TLS/WSS terminated at the edge.
- AWS is DR/mirror (ECS + S3/CloudFront). Optional templates for Azure, Railway and a single VPS with Docker Compose + Caddy are in scope for the guidance doc.
- Backend runs one instance with sticky sessions because rooms/sessions are in memory; `min=max=1` until state is externalized. HTTP 8080 and WS `/ws` are the only client-facing paths; raw TCP 9339 stays internal.
