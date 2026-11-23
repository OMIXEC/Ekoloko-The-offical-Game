# Map client endpoints to server routes and handlers

Type: research
Status: closed
Blocked by: Verify the TypeScript server boots and serves a playable session

## Question

Which client requests have real implementations, and which are dead or stubbed?

## Resolution

Coverage established in `backend/server/src`:
- Real: `/ekoloko-web/login.action`, `getDetails.action`, `getData.action`, `register.action`, `validateUsername.action`, `/ekoloko-i18n/:action`, `/static`, `/ekoloko/conf`, `/ekoloko-web/redeemCard.action`, `creditsRedeemCard.action`, `/ws`, `/health`, `/BlueBox/HttpBox.do` (fallback).
- Real extension handlers: `ExtensionRouter` maps 100+ extension IDs across 20+ modules (login, room, items, chat, quests, stores, trades, animals, house, cards, potions, multiplayer tasks, ranger, etc.).
- Real sys handlers in `protocol/ProtocolBridge.ts`: `verChk`, `rndK`, `login`, `zInfo`, `getRmList`, `joinRoom`, `autoJoin`, `setUvars`, `pubMsg`, `loadB`, `roundTrip`, `logout`, plus signed `sessionUser` from the WS bridge.
- Stubbed: `/ekoloko-web/:action` catch-all still returns `{success:true,action,message:"stub"}` for minor legacy actions; `/BlueBox/HttpBox.do` in `HttpServer.ts` is a placeholder queue, while the real polling server exists in `protocol/HttpPollingServer.ts` but is not mounted.
- Startup/redeem paths used by the Flash client are now covered; no `[TCP] Unhandled` appears on the core session path.
