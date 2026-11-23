# Wire the existing SmartFox protocol stack into the server entrypoint

Type: task
Status: closed
Blocked by:

## Question

How does the server reach a playable session without reimplementing the preserved protocol code?

## Resolution

`index.ts` now starts `SocketServer` + `ServerState` + `ExtensionRouter` through `protocol/ProtocolBridge.ts`. Sys handlers cover `verChk`, `rndK`, `login`, `zInfo`, `getRmList`, `joinRoom`, `autoJoin`, `setUvars`, `pubMsg`, `loadB`, `roundTrip`, `logout`, and a signed internal `sessionUser` frame. Extension messages route to the preserved 20+ modules. Unknown commands warn loudly instead of returning canned stubs. No hardcoded `DevMax`. Verified by `tests/qa/session-smoke.mjs`.
