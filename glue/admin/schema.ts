/**
 * Single schema source for game + admin data.
 *
 * The same logical tables are created on SQLite (dev/default) and Postgres
 * (prod via DB_DRIVER=postgres). Column names and types are intentionally
 * identical so the AdminService SQL works on both drivers.
 */

export type Dialect = "sqlite" | "postgres";

const GAME_TABLES_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male',
  coins INTEGER NOT NULL DEFAULT 500,
  credits INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  premium INTEGER NOT NULL DEFAULT 0,
  ranger_level INTEGER NOT NULL DEFAULT 0,
  is_moderator INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  days_played INTEGER NOT NULL DEFAULT 0,
  last_login INTEGER,
  last_room_id INTEGER NOT NULL DEFAULT -1,
  skin_tone TEXT NOT NULL DEFAULT '1',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  slot_id INTEGER NOT NULL DEFAULT 0,
  item_type INTEGER NOT NULL DEFAULT 0,
  obtained_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  series_id INTEGER NOT NULL DEFAULT 0,
  album_id INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_animals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  animal_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  hunger INTEGER NOT NULL DEFAULT 100,
  happiness INTEGER NOT NULL DEFAULT 100,
  health INTEGER NOT NULL DEFAULT 100,
  days_left INTEGER NOT NULL DEFAULT 30,
  cleanliness INTEGER NOT NULL DEFAULT 100,
  last_fed INTEGER,
  adopted_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_buddies (
  user_id INTEGER NOT NULL,
  buddy_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, buddy_id)
);
CREATE TABLE IF NOT EXISTS user_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  quest_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  progress INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_house (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  house_type INTEGER NOT NULL DEFAULT 1,
  furniture TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS houses (
  player_id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL DEFAULT 1,
  size INTEGER NOT NULL DEFAULT 1,
  electric_level INTEGER NOT NULL DEFAULT 0,
  garden_level INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  furniture TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS storage_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS potions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  potion_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  played_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_animals_user ON user_animals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quests_user ON user_quests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_log_user ON chat_log(user_id, sent_at);
`;

const GAME_TABLES_POSTGRES = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male',
  coins INTEGER NOT NULL DEFAULT 500,
  credits INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  premium INTEGER NOT NULL DEFAULT 0,
  ranger_level INTEGER NOT NULL DEFAULT 0,
  is_moderator INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  days_played INTEGER NOT NULL DEFAULT 0,
  last_login BIGINT,
  last_room_id INTEGER NOT NULL DEFAULT -1,
  skin_tone TEXT NOT NULL DEFAULT '1',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_items (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  slot_id INTEGER NOT NULL DEFAULT 0,
  item_type INTEGER NOT NULL DEFAULT 0,
  obtained_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_cards (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  series_id INTEGER NOT NULL DEFAULT 0,
  album_id INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_animals (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  animal_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  hunger INTEGER NOT NULL DEFAULT 100,
  happiness INTEGER NOT NULL DEFAULT 100,
  health INTEGER NOT NULL DEFAULT 100,
  days_left INTEGER NOT NULL DEFAULT 30,
  cleanliness INTEGER NOT NULL DEFAULT 100,
  last_fed BIGINT,
  adopted_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_buddies (
  user_id INTEGER NOT NULL,
  buddy_id INTEGER NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, buddy_id)
);
CREATE TABLE IF NOT EXISTS user_quests (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  quest_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  progress INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  started_at BIGINT NOT NULL,
  completed_at BIGINT
);
CREATE TABLE IF NOT EXISTS user_house (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  house_type INTEGER NOT NULL DEFAULT 1,
  furniture TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS houses (
  player_id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL DEFAULT 1,
  size INTEGER NOT NULL DEFAULT 1,
  electric_level INTEGER NOT NULL DEFAULT 0,
  garden_level INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  furniture TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS storage_items (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS potions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  potion_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  played_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_animals_user ON user_animals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quests_user ON user_quests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_log_user ON chat_log(user_id, sent_at);
`;

const ADMIN_TABLES_SQLITE = `
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','operator','admin','owner')),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS entitlement_kinds (
  kind TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_he TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  default_days INTEGER,
  gating_mode TEXT NOT NULL DEFAULT 'off'
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_sub_id TEXT,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end INTEGER,
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS redeem_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  reward_json TEXT NOT NULL,
  expires_at INTEGER,
  created_by TEXT NOT NULL,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by INTEGER,
  used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  login_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(kind, entity_id)
);
CREATE TABLE IF NOT EXISTS catalog_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_he TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  UNIQUE(collection_id, entity_kind, entity_id)
);
CREATE TABLE IF NOT EXISTS sql_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  sql TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL,
  reason TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_codes_batch ON redeem_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
`;

const ADMIN_TABLES_POSTGRES = ADMIN_TABLES_SQLITE
  .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "BIGSERIAL PRIMARY KEY")
  .replace(/UNIQUE COLLATE NOCASE/g, "UNIQUE")
  .replace(/CREATE INDEX IF NOT EXISTS/g, "CREATE INDEX IF NOT EXISTS");

export function schemaFor(dialect: Dialect): string {
  return dialect === "postgres"
    ? GAME_TABLES_POSTGRES + ADMIN_TABLES_POSTGRES
    : GAME_TABLES_SQLITE + ADMIN_TABLES_SQLITE;
}

export const DEFAULT_ENTITLEMENT_KINDS = [
  { kind: "free", label_en: "Free", label_he: "חינמי", rank: 0, default_days: null, gating_mode: "off" },
  { kind: "premium", label_en: "Premium", label_he: "פרימיום", rank: 1, default_days: 30, gating_mode: "suggest" },
  { kind: "pioneer", label_en: "Pioneer", label_he: "חלוץ", rank: 2, default_days: 30, gating_mode: "required" },
  { kind: "pioneer:weekly", label_en: "Pioneer Weekly", label_he: "חלוץ שבועי", rank: 3, default_days: 7, gating_mode: "required" },
  { kind: "pioneer:monthly", label_en: "Pioneer Monthly", label_he: "חלוץ חודשי", rank: 4, default_days: 30, gating_mode: "required" },
  { kind: "pioneer:bimonthly", label_en: "Pioneer 2 Months", label_he: "חלוץ דו-חודשי", rank: 5, default_days: 60, gating_mode: "required" },
  { kind: "pioneer:quarterly", label_en: "Pioneer 3 Months", label_he: "חלוץ תלת-חודשי", rank: 6, default_days: 90, gating_mode: "required" },
  { kind: "pioneer:halfyear", label_en: "Pioneer 6 Months", label_he: "חלוץ חצי שנתי", rank: 7, default_days: 180, gating_mode: "required" },
  { kind: "pioneer:yearly", label_en: "Pioneer Yearly", label_he: "חלוץ שנתי", rank: 8, default_days: 365, gating_mode: "required" },
  { kind: "gold", label_en: "Gold", label_he: "זהב", rank: 9, default_days: 30, gating_mode: "suggest" },
  { kind: "ranger", label_en: "Ranger", label_he: "סייר", rank: 10, default_days: 30, gating_mode: "required" },
  { kind: "senior", label_en: "Senior", label_he: "ותיק", rank: 11, default_days: 365, gating_mode: "suggest" },
  { kind: "moderator", label_en: "Moderator", label_he: "מנהל", rank: 12, default_days: null, gating_mode: "strict" },
] as const;
