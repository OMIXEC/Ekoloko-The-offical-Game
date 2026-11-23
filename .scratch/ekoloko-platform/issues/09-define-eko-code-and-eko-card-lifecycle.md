# Define Eko-Code and Eko-Card lifecycle and redemption protocol

Type: grilling
Status: closed
Blocked by: Map client endpoints to server routes and handlers, Define subscription and entitlement model

## Question

What is the complete lifecycle of a code or gift card, and which protocol carries each step?

## Resolution

- `Eko-Code`: generic redeemable code; `Eko-Card`: gift card carrying a code; `Rav-Card`: rare-item variant requiring Pioneer access.
- Lifecycle: `batch:create` → hashed code rows (`sha256(code.trim().toUpperCase())`) → `unused` → `used` with `used_by`/`used_at`, or `revoked` / expired. Codes are shown once at creation.
- Reward payload: `{coins, credits, premium, itemIds, cardIds, rareItemIds, entitlement, entitlementDays}`.
- Transport: HTTP `GET /ekoloko-web/redeemCard.action` (and `creditsRedeemCard.action`) with `userName`, `password`, `code`/`cardNumber`. Success → `["ok"]`; failures → `["bad_user_password"]` / `["invalid_code"]`.
- Single-use is enforced by the `UPDATE ... WHERE status='unused'` transaction; a second redemption is rejected. All redemptions write an audit entry.
