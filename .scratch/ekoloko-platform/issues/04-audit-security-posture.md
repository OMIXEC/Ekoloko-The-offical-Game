# Audit security posture before public deployment

Type: research
Status: closed
Blocked by: Verify the TypeScript server boots and serves a playable session

## Question

What must be fixed before this server is exposed to remote users, and what can wait?

## Resolution

Findings (not yet all fixed):
- Critical: seeded `Admin/admin123`; unsalted MD5 password hashing kept only for Flash compatibility; `Access-Control-Allow-Origin: *` and crossdomain policy allow all origins; no rate limiting on login or redemption.
- High: dev `SESSION_SECRET` fallback; admin bootstrap password default; SQLite WAL DB and codes CSV files on local disk; chat stored in `chat_log`.
- Minimum bar before public launch: remove seeded credentials, replace MD5 with salted Argon2id/bcrypt behind a compatibility migration, restrict CORS/crossdomain to our origins, set real secrets, enable Redis-backed admin sessions, rate-limit auth and redemption, settle children's-data obligations.
- Can wait: fine-grained moderation tooling, advanced observability, optional cloud providers beyond the primary topology.
- Tracked further in "Define compliance and moderation scope" and "Define observability and incident response scope".
