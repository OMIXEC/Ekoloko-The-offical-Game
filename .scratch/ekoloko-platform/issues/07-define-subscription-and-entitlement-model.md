# Define subscription and entitlement model

Type: grilling
Status: closed
Blocked by: Audit security posture before public deployment, Define admin identity, roles and authentication

## Question

What does a paid Player actually own, where is that recorded, and which system is authoritative?

## Resolution

- `Subscription`: recurring billing relationship in the admin store. `Entitlement`: right to a paid feature, held as a snapshot on the Game account and mirrored in the admin `entitlements` table.
- Canonical entitlement kinds registered locally: `premium`, `pioneer`, `gold`, `ranger` (plus `ranger` level 0-5 as a separate game flag).
- Redemption-granted entitlements carry `source = redeem:<batchId>` and expiry from the reward; purchased entitlements carry a subscription source. The admin store is authoritative for billing state; the game server snapshot is authoritative for what the Flash client sees.
- Payment provider is not wired yet; no card data is stored by the platform. Trial/renewal/dunning rules remain a later billing decision but do not block playability.
