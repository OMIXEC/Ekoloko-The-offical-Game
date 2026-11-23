# Verify the TypeScript server boots and serves a playable session

Type: research
Status: closed
Blocked by:

## Question

Does the server, as shipped, build and run well enough for a remote player to register, log in, enter a room, and open a SWF through Ruffle?

## Resolution

Facts established:
- Upstream `index.ts` did not compile until the local `database/Database.ts` shim was added; that patch is kept in `patches/server-database-layer.patch`.
- `npm run build` and `npm start` now succeed with Node 22. Health: `GET /health` → `{"status":"ok"}`.
- HTTP auth works: `GET /ekoloko-web/login.action?userName=orimiz&password=Iorimiz11` → `["login_ok_mod"]`.
- The shipped entrypoint bypassed the preserved SmartFox stack with a ten-command hand-rolled handler. After wiring `SocketServer` + `SmartFoxProtocol` + `ExtensionRouter`, a full session works: `apiOK` → `logOK` + player data → `rmList` → `joinOK` → room data. Proven by `node tests/qa/session-smoke.mjs`.
- Defects found and fixed: hardcoded `DevMax` identity, rooms table containing only a fake `Channel1`, generated config shadowed by vendored client snapshots, missing cookie-to-socket identity bridge.
- Remaining defect: headless Ruffle closes the socket (1005) after `joinOK` before a room SWF request; visual world render not yet proven in automation.
