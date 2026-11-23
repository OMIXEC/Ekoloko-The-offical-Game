# Prototype redemption API contract and schema

Type: prototype
Status: closed
Blocked by: Define Eko-Code and Eko-Card lifecycle and redemption protocol

## Question

What are the concrete tables, endpoints, request/response shapes, and error codes for code and card redemption?

## Resolution

The contract is realized in code rather than a separate prototype artifact:
- Tables: `redeem_batches`, `redeem_codes`, `entitlements`, `audit_log` in `backend/server/src/admin/schema.ts`.
- Endpoint: `GET /ekoloko-web/redeemCard.action?userName=...&password=...&code=...` in `backend/server/src/http/HttpServer.ts`, delegating to `AdminService.redeemCode`.
- Responses: `["ok"]` or `["bad_user_password"]` / `["invalid_code"]`.
- Batch creation and code listing: `admin/cli.js batch:create`, `codes:list`, `code:revoke`.
- Error strings in `ekoCode_iw.xml` / `ekoCard_iw.xml` are not yet mapped one-to-one to the HTTP responses; that is a later localization task.
