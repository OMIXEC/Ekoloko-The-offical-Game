# Implement the real gift-card redemption endpoint

Type: task
Status: closed
Blocked by: Define Eko-Code and Eko-Card lifecycle and redemption protocol, Prototype redemption API contract and schema

## Question

How does a Player redeem a code from the Flash client?

## Resolution

`GET /ekoloko-web/redeemCard.action` and `creditsRedeemCard.action` now verify credentials, call `AdminService.redeemCode` with a signed internal context, apply the reward transactionally and return `["ok"]` or `["bad_user_password"]` / `["invalid_code"]`. Single-use enforced; audit entry written. Verified by the Playwright gift-card spec (coins +1234, credits +7, second redemption rejected).
