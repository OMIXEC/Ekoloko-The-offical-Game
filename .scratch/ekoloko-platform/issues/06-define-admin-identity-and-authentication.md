# Define admin identity, roles and authentication

Type: grilling
Status: closed
Blocked by: Audit security posture before public deployment

## Question

Who can administer the platform, how are they authenticated, and how is that identity separated from a Player?

## Resolution

- Canonical roles: `viewer`, `operator`, `admin`, `owner` with rank ordering in `admin/security.ts`.
- Staff identities live in the admin store (`admin_users`), separate from `users` (Player/Game account). `Administrator` and `Moderator` remain distinct glossary terms; `users.is_moderator` is a game flag, not admin access.
- Passwords use the admin service's password hashing; TOTP is required for writes (`ADMIN_REQUIRE_TOTP=true` in prod). Sessions are Redis-backed in prod, in-memory only in dev.
- Break-glass: the bootstrap owner account is created on first start from `ADMIN_BOOTSTRAP_USER/PASSWORD`; remove the env values after first login. A compromised staff account is revoked via `admin` tooling and audited.
- Implementation: `backend/server/src/admin/*` and `/admin` dashboard.
