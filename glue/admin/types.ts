export type Role = "viewer" | "operator" | "admin" | "owner";

export const ROLES: Role[] = ["viewer", "operator", "admin", "owner"];

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

export interface AdminUser {
  id: number;
  username: string;
  role: Role;
  totp_secret?: string | null;
  totp_enabled?: number;
  disabled: number;
  created_at: number;
  last_login_at?: number | null;
}

export interface AuthContext {
  admin: AdminUser;
  ip: string;
  userAgent: string;
  sessionId: string;
}

export interface Page<T = any> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditEntry {
  actor: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Fields the UI is allowed to edit on a game account. password_hash is never exposed. */
export const USER_EDITABLE_FIELDS = [
  "username",
  "email",
  "gender",
  "coins",
  "credits",
  "xp",
  "level",
  "premium",
  "ranger_level",
  "is_moderator",
  "is_banned",
  "ban_reason",
  "days_played",
  "last_room_id",
  "skin_tone",
] as const;

/** Tables the guarded SQL console may write to (never audit/admin identity/hash/codes). */
export const SQL_WRITE_TABLES = new Set([
  "users",
  "user_items",
  "user_cards",
  "user_animals",
  "user_quests",
  "user_house",
  "houses",
  "storage_items",
  "potions",
  "game_scores",
  "chat_log",
  "entitlements",
  "subscriptions",
  "redeem_batches",
  "catalog_entries",
  "catalog_collections",
  "catalog_collection_items",
  "admin_notes",
]);

export const SQL_BLOCKED_TABLES = new Set([
  "audit_log",
  "admin_users",
  "admin_sessions",
  "redeem_codes",
  "sql_query_history",
]);

export const PERMISSIONS: Record<string, Role> = {
  "overview:read": "viewer",
  "users:read": "viewer",
  "users:write": "operator",
  "users:ban": "operator",
  "users:password": "admin",
  "entitlements:read": "viewer",
  "entitlements:write": "admin",
  "catalog:read": "viewer",
  "catalog:write": "admin",
  "codes:read": "viewer",
  "codes:write": "operator",
  "codes:revoke": "admin",
  "subscriptions:read": "viewer",
  "subscriptions:write": "admin",
  "audit:read": "viewer",
  "sql:read": "viewer",
  "sql:write": "admin",
  "admins:read": "admin",
  "admins:write": "owner",
};

export function can(role: Role, permission: keyof typeof PERMISSIONS | string): boolean {
  const required = PERMISSIONS[permission];
  if (!required) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
