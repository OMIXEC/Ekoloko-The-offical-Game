# Bind Ruffle socket proxy to the public WSS endpoint

Type: task
Status: open
Blocked by: Establish one public-host configuration source

## Question

How does the Flash `XMLSocket` reach the backend over HTTPS/WSS on the public host?

## Current state

Locally `client/ruffle-loader.js` maps `localhost`/`127.0.0.1` ports 9339, 8080, 80 and 443 to `ws(s)://<host>/ws`. For production this must derive from the public host only, use `wss`, and drop any hardcoded host/port list. nginx and Vercel rewrite rules for `/ws` exist in templates but are not deployed.
