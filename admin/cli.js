#!/usr/bin/env node
"use strict";

/**
 * Local admin CLI for the consolidated Ekoloko platform.
 *
 * Operates directly on the SQLite database created by the game server.
 * Every mutating command writes an audit row. Never prints password hashes.
 *
 * Run with Node 20+ (Node 22 recommended):
 *   node admin/cli.js help
 */

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.EKOLOKO_DB ||
  path.join(ROOT, "backend", "server", "database", "ekoloko.db");
const SqliteDatabase = require(path.join(ROOT, "backend", "server", "node_modules", "better-sqlite3"));

const db = new SqliteDatabase(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function ensureAdminSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, email TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'male',
      coins INTEGER NOT NULL DEFAULT 500, credits INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
      premium INTEGER NOT NULL DEFAULT 0, ranger_level INTEGER NOT NULL DEFAULT 0,
      is_moderator INTEGER NOT NULL DEFAULT 0, is_banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT, days_played INTEGER NOT NULL DEFAULT 0, last_login INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1, equipped INTEGER DEFAULT 0, obtained_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, card_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS user_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, quest_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active', progress INTEGER DEFAULT 0, completed INTEGER DEFAULT 0,
      started_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_id INTEGER NOT NULL,
      score INTEGER NOT NULL, played_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_animals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, animal_id INTEGER NOT NULL,
      name TEXT NOT NULL, level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0,
      hunger INTEGER DEFAULT 100, happiness INTEGER DEFAULT 100, health INTEGER DEFAULT 100,
      days_left INTEGER DEFAULT 30, cleanliness INTEGER DEFAULT 100, adopted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_house (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
      house_type INTEGER DEFAULT 1, furniture TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS houses (
      player_id INTEGER PRIMARY KEY, type_id INTEGER DEFAULT 1, size INTEGER DEFAULT 1,
      electric_level INTEGER DEFAULT 0, garden_level INTEGER DEFAULT 0, locked INTEGER DEFAULT 0,
      furniture TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS potions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, potion_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1, added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS storage_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1, added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, room_id INTEGER NOT NULL,
      message TEXT NOT NULL, sent_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'operator', disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'manual', provider_sub_id TEXT,
      plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      current_period_end INTEGER, cancelled_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      kind TEXT NOT NULL, source TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      granted_at INTEGER NOT NULL, expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS redeem_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      reward_json TEXT NOT NULL, expires_at INTEGER, created_by TEXT NOT NULL,
      count INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL UNIQUE, code_hint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused', used_by INTEGER, used_at INTEGER,
      expires_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
      target_type TEXT, target_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_batch ON redeem_codes(batch_id);
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);
}
ensureAdminSchema();

// ── helpers ───────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
function flag(name) { return process.argv.includes(`--${name}`); }
function actor() { return arg("actor", process.env.ADMIN_ACTOR || "cli"); }
function audit(action, targetType, targetId, metadata) {
  db.prepare(
    "INSERT INTO audit_log (actor, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(actor(), action, targetType || null, targetId == null ? null : String(targetId), JSON.stringify(metadata || {}), Date.now());
}
function out(value) { console.log(JSON.stringify(value, null, 2)); }
function fail(message) { console.error(`error: ${message}`); process.exit(1); }
function hash(code) { return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex"); }
function randomCode(prefix, length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let body = "";
  for (let i = 0; i < length; i++) body += alphabet[bytes[i] % alphabet.length];
  return `${prefix || "EKO"}-${body}`;
}
function parseReward(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { fail(`invalid --reward JSON: ${e.message}`); }
}
function expiresAt() {
  const days = Number(arg("days", "365"));
  return Date.now() + days * 86400000;
}
function findUser(value) {
  return db.prepare(
    "SELECT id, username, email, gender, coins, credits, xp, level, premium, ranger_level, is_moderator, is_banned, created_at FROM users WHERE id = ? OR username = ? COLLATE NOCASE"
  ).get(/^\d+$/.test(String(value)) ? Number(value) : -1, String(value));
}

// ── commands ──────────────────────────────────────────────────────────────
function cmdBatchCreate() {
  const type = arg("type", "code");
  if (!["code", "gift", "rav"].includes(type)) fail("--type must be code|gift|rav");
  const count = Math.min(Math.max(Number(arg("count", "10")), 1), 10000);
  const reward = parseReward(arg("reward", "{}"));
  const name = arg("name", `${type}-${new Date().toISOString().slice(0, 10)}`);
  const prefix = arg("prefix", type === "rav" ? "RAV" : type === "gift" ? "GIFT" : "EKO");
  const expiry = expiresAt();
  const now = Date.now();

  const codes = [];
  const batch = db.transaction(() => {
    const info = db.prepare(
      "INSERT INTO redeem_batches (name, type, reward_json, expires_at, created_by, count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(name, type, JSON.stringify(reward), expiry, actor(), count, now);
    const batchId = Number(info.lastInsertRowid);
    const insert = db.prepare(
      "INSERT INTO redeem_codes (batch_id, code_hash, code_hint, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    for (let i = 0; i < count; i++) {
      const code = randomCode(prefix);
      insert.run(batchId, hash(code), `${prefix}-****-${code.slice(-4)}`, expiry, now);
      codes.push(code);
    }
    audit("batch.create", "redeem_batch", batchId, { type, count, name });
    return batchId;
  })();

  const csvPath = arg("out", null);
  const csv = ["code,batch_id,type,expires_at", ...codes.map((c) => `${c},${batch},${type},${new Date(expiry).toISOString()}`)].join("\n");
  if (csvPath) {
    fs.writeFileSync(csvPath, csv, { mode: 0o600 });
    console.error(`CSV written to ${csvPath} (keep it private; codes are shown once).`);
  }
  out({ batch_id: batch, name, type, count, expires_at: new Date(expiry).toISOString(), codes: csvPath ? undefined : codes });
}

function cmdBatchList() {
  out(db.prepare("SELECT * FROM redeem_batches ORDER BY id DESC LIMIT ?").all(Number(arg("limit", "50"))));
}

function cmdCodesList() {
  const batchId = arg("batch", null);
  const rows = batchId
    ? db.prepare("SELECT id, batch_id, code_hint, status, used_by, used_at, expires_at FROM redeem_codes WHERE batch_id = ? ORDER BY id").all(Number(batchId))
    : db.prepare("SELECT id, batch_id, code_hint, status, used_by, used_at, expires_at FROM redeem_codes ORDER BY id DESC LIMIT ?").all(Number(arg("limit", "100")));
  out(rows);
}

function cmdRedeem() {
  const code = arg("code", null);
  const userValue = arg("user", null);
  if (!code || !userValue) fail("--code and --user are required");
  const user = findUser(userValue);
  if (!user) fail(`user not found: ${userValue}`);
  const row = db.prepare("SELECT * FROM redeem_codes WHERE code_hash = ?").get(hash(code));
  if (!row) fail("invalid code");
  if (row.status !== "unused") fail(`code is ${row.status}`);
  if (row.expires_at && row.expires_at < Date.now()) fail("code expired");

  const batch = db.prepare("SELECT * FROM redeem_batches WHERE id = ?").get(row.batch_id);
  const reward = JSON.parse(batch.reward_json);
  const apply = db.transaction(() => {
    if (reward.coins) db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(Number(reward.coins), user.id);
    if (reward.credits) db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(Number(reward.credits), user.id);
    if (reward.premium) db.prepare("UPDATE users SET premium = 1 WHERE id = ?").run(user.id);
    for (const itemId of reward.itemIds || []) {
      db.prepare("INSERT INTO user_items (user_id, item_id, quantity, obtained_at) VALUES (?, ?, 1, ?)").run(user.id, Number(itemId), Date.now());
    }
    for (const cardId of reward.cardIds || []) {
      db.prepare("INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, 1)").run(user.id, Number(cardId));
    }
    if (reward.entitlement) {
      db.prepare("INSERT INTO entitlements (user_id, kind, source, granted_at) VALUES (?, ?, ?, ?)")
        .run(user.id, String(reward.entitlement), `redeem:${batch.id}`, Date.now());
    }
    db.prepare("UPDATE redeem_codes SET status = 'used', used_by = ?, used_at = ? WHERE id = ?").run(user.id, Date.now(), row.id);
    audit("code.redeem", "redeem_code", row.id, { user_id: user.id, batch_id: row.batch_id, code_hint: row.code_hint });
  });
  apply();
  out({ ok: true, user: user.username, batch_id: row.batch_id, reward });
}

function cmdRevoke() {
  const code = arg("code", null);
  if (!code) fail("--code is required");
  const row = db.prepare("SELECT id FROM redeem_codes WHERE code_hash = ?").get(hash(code));
  if (!row) fail("invalid code");
  db.prepare("UPDATE redeem_codes SET status = 'revoked' WHERE id = ?").run(row.id);
  audit("code.revoke", "redeem_code", row.id, { code_hint: hash(code).slice(0, 8) });
  out({ ok: true, revoked_code_id: row.id });
}

function cmdSubscriptionGrant() {
  const userValue = arg("user", null);
  const plan = arg("plan", "premium");
  if (!userValue) fail("--user is required");
  const user = findUser(userValue);
  if (!user) fail(`user not found: ${userValue}`);
  const expiry = expiresAt();
  const grant = db.transaction(() => {
    db.prepare(
      "INSERT INTO subscriptions (user_id, provider, provider_sub_id, plan, status, current_period_end, created_at) VALUES (?, 'manual', ?, ?, 'active', ?, ?)"
    ).run(user.id, `manual-${Date.now()}`, plan, expiry, Date.now());
    db.prepare("INSERT INTO entitlements (user_id, kind, source, granted_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, plan, "subscription:manual", Date.now(), expiry);
    if (plan === "premium") db.prepare("UPDATE users SET premium = 1 WHERE id = ?").run(user.id);
    audit("subscription.grant", "user", user.id, { plan, expires_at: expiry });
  });
  grant();
  out({ ok: true, user: user.username, plan, expires_at: new Date(expiry).toISOString() });
}

function cmdSubscriptionRevoke() {
  const userValue = arg("user", null);
  if (!userValue) fail("--user is required");
  const user = findUser(userValue);
  if (!user) fail(`user not found: ${userValue}`);
  const revoke = db.transaction(() => {
    db.prepare("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE user_id = ? AND status = 'active'").run(Date.now(), user.id);
    db.prepare("UPDATE entitlements SET active = 0 WHERE user_id = ?").run(user.id);
    db.prepare("UPDATE users SET premium = 0 WHERE id = ?").run(user.id);
    audit("subscription.revoke", "user", user.id, {});
  });
  revoke();
  out({ ok: true, user: user.username });
}

function cmdSubscriptionList() {
  out(db.prepare("SELECT s.*, u.username FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT ?").all(Number(arg("limit", "100"))));
}

function cmdUserShow() {
  const userValue = arg("user", null);
  if (!userValue) fail("--user is required");
  const user = findUser(userValue);
  if (!user) fail(`user not found: ${userValue}`);
  const id = user.id;
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const data = {
    account: user,
    inventory: q("SELECT * FROM user_items WHERE user_id = ?", id),
    animals: q("SELECT * FROM user_animals WHERE user_id = ?", id),
    cards: q("SELECT * FROM user_cards WHERE user_id = ?", id),
    quests: q("SELECT * FROM user_quests WHERE user_id = ?", id),
    house: db.prepare("SELECT * FROM houses WHERE player_id = ?").get(id) || null,
    potions: q("SELECT * FROM potions WHERE user_id = ?", id),
    storage: q("SELECT * FROM storage_items WHERE user_id = ?", id),
    scores: q("SELECT * FROM game_scores WHERE user_id = ? ORDER BY score DESC LIMIT 20", id),
    subscriptions: q("SELECT * FROM subscriptions WHERE user_id = ?", id),
    entitlements: q("SELECT * FROM entitlements WHERE user_id = ?", id),
    recent_redemptions: q("SELECT code_hint, used_at, batch_id FROM redeem_codes WHERE used_by = ? ORDER BY used_at DESC LIMIT 20", id),
  };
  audit("user.show", "user", id, { requested_by: actor() });
  out(data);
}

function cmdAdminAdd() {
  const username = arg("username", null);
  if (!username) fail("--username is required");
  db.prepare("INSERT INTO admin_users (username, role, created_at) VALUES (?, ?, ?)")
    .run(username, arg("role", "operator"), Date.now());
  audit("admin.add", "admin_user", username, { role: arg("role", "operator") });
  out({ ok: true, username });
}

function cmdAudit() {
  out(db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(Number(arg("limit", "100"))));
}

function cmdUserCreate() {
  const username = arg("username", null);
  if (!username) fail("--username is required");
  if (findUser(username)) fail(`user already exists: ${username}`);
  const password = arg("password", "DevMax123");
  const email = arg("email", `${username}@ekoloko.local`);
  const gender = arg("gender", "male");
  // Legacy client sends MD5(password); keep compatibility for local/dev accounts.
  const passwordHash = crypto.createHash("md5").update(password).digest("hex");
  db.prepare(
    "INSERT INTO users (username, password_hash, email, gender, coins, created_at) VALUES (?, ?, ?, ?, 500, ?)"
  ).run(username, passwordHash, email, gender, Date.now());
  audit("user.create", "user", username, { email });
  out({ ok: true, username, password, email, note: "MD5 kept for Flash client compatibility; dev only" });
}

function cmdUserMax() {
  const userValue = arg("user", null);
  if (!userValue) fail("--user is required");
  const user = findUser(userValue);
  if (!user) fail(`user not found: ${userValue}`);
  const ENTITLEMENTS = ["premium", "pioneer", "gold", "ranger"];

  // Derive item/card IDs from files that actually exist, so the Flash client
  // never requests missing SWFs like MKP_1.swf.
  const realItemIds = [];
  const itemsRoot = path.join(ROOT, "client", "ekoloko", "items");
  if (fs.existsSync(itemsRoot)) {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      const m = e.name.match(/_(\d+)\.swf$/i);
      return m ? [Number(m[1])] : [];
    });
    realItemIds.push(...new Set(walk(itemsRoot)));
  }
  const realCardIds = [];
  const cardsRoot = path.join(ROOT, "client", "ekoloko", "cards", "albums", "1", "cards");
  if (fs.existsSync(cardsRoot)) {
    for (const name of fs.readdirSync(cardsRoot)) {
      const m = name.match(/a1_c(\d+)\.jpg/i);
      if (m) realCardIds.push(Number(m[1]));
    }
  }
  const itemIds = realItemIds.slice(0, 20).length ? realItemIds.slice(0, 20) : [1001];
  const cardIds = realCardIds.slice(0, 10).length ? realCardIds.slice(0, 10) : [1];

  const apply = db.transaction(() => {
    db.prepare(
      `UPDATE users SET coins = 9999999, credits = 999999, xp = 999999, level = 999,
        premium = 1, ranger_level = 5, is_moderator = 1, is_banned = 0, ban_reason = NULL
       WHERE id = ?`
    ).run(user.id);
    db.prepare("DELETE FROM entitlements WHERE user_id = ? AND source = 'devmax'").run(user.id);
    db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND plan = 'all-entitlements'").run(user.id);
    for (const kind of ENTITLEMENTS) {
      db.prepare(
        "INSERT INTO entitlements (user_id, kind, source, active, granted_at) VALUES (?, ?, 'devmax', 1, ?)"
      ).run(user.id, kind, Date.now());
    }
    db.prepare(
      "INSERT INTO subscriptions (user_id, provider, provider_sub_id, plan, status, created_at) VALUES (?, 'manual', ?, 'all-entitlements', 'active', ?)"
    ).run(user.id, `devmax-${Date.now()}`, Date.now());
    db.prepare("DELETE FROM user_items WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM user_cards WHERE user_id = ?").run(user.id);
    const item = db.prepare("INSERT INTO user_items (user_id, item_id, quantity, obtained_at) VALUES (?, ?, 1, ?)");
    for (const itemId of itemIds) item.run(user.id, itemId, Date.now());
    const card = db.prepare("INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, 1)");
    for (const cardId of cardIds) card.run(user.id, cardId);
    audit("user.max", "user", user.id, { entitlements: ENTITLEMENTS, itemIds, cardIds });
  });
  apply();
  out({ ok: true, user: user.username, coins: 9999999, credits: 999999, level: 999, premium: true, moderator: true, ranger_level: 5, entitlements: ENTITLEMENTS, items: itemIds, cards: cardIds });
}

function cmdAdminList() {
  out(db.prepare("SELECT id, username, role, disabled, created_at FROM admin_users ORDER BY id").all());
}

function cmdHelp() {
  console.log(`Ekoloko admin CLI

  init
  user:create      --username DevMax [--password ...] [--email ...]   # game account
  user:max         --user DevMax                                      # all entitlements/items
  admin:add        --username ops [--role viewer|operator|admin|owner] # staff identity
  admin:list
  batch:create     --type code|gift|rav --count N --reward '{...}' [--days 365] [--prefix EKO] [--out codes.csv]
  batch:list
  codes:list       [--batch ID | --limit N]
  code:redeem      --code <code> --user <id|username>
  code:revoke      --code <code>
  subscription:grant  --user <id|username> [--plan premium] [--days 30]
  subscription:revoke --user <id|username>
  subscription:list
  user:show        --user <id|username>      # full player state, no secrets
  audit:list

All mutating commands log to audit_log. Use --actor <name> or ADMIN_ACTOR.
Reward JSON example: {"coins":100,"credits":5,"premium":false,"itemIds":[12],"cardIds":[3],"entitlement":"pioneer"}
DB: ${DB_PATH}
`);
}

const commands = {
  init: () => out({ ok: true, db: DB_PATH }),
  help: cmdHelp,
  "admin:add": cmdAdminAdd,
  "admin:list": cmdAdminList,
  "user:create": cmdUserCreate,
  "user:max": cmdUserMax,
  "batch:create": cmdBatchCreate,
  "batch:list": cmdBatchList,
  "codes:list": cmdCodesList,
  "code:redeem": cmdRedeem,
  "code:revoke": cmdRevoke,
  "subscription:grant": cmdSubscriptionGrant,
  "subscription:revoke": cmdSubscriptionRevoke,
  "subscription:list": cmdSubscriptionList,
  "user:show": cmdUserShow,
  "audit:list": cmdAudit,
};

const command = process.argv[2] || "help";
if (!commands[command]) fail(`unknown command: ${command} (try help)`);
commands[command]();
db.close();
