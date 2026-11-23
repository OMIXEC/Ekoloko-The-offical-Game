import * as crypto from "crypto";
import type { DbAdapter } from "./db";
import { DEFAULT_ENTITLEMENT_KINDS } from "./schema";
import {
  can,
  Role,
  AuthContext,
  AdminUser,
  PERMISSIONS,
  USER_EDITABLE_FIELDS,
} from "./types";
import {
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  totpUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
} from "./security";
import { checkSql, runSql } from "./sqlConsole";

const now = () => Date.now();

function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T = any>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class AdminService {
  constructor(private db: DbAdapter) {}

  // ── bootstrap / migrations ────────────────────────────────────────────

  async initialize(): Promise<void> {
    // Add columns introduced after the original snapshot (both dialects).
    const extraColumns: Array<[string, string, string]> = [
      ["users", "credits", "INTEGER NOT NULL DEFAULT 0"],
      ["users", "skin_tone", "TEXT NOT NULL DEFAULT '1'"],
      ["users", "last_room_id", "INTEGER NOT NULL DEFAULT -1"],
      ["user_items", "slot_id", "INTEGER NOT NULL DEFAULT 0"],
      ["user_items", "item_type", "INTEGER NOT NULL DEFAULT 0"],
      ["user_cards", "series_id", "INTEGER NOT NULL DEFAULT 0"],
      ["user_cards", "album_id", "INTEGER NOT NULL DEFAULT 0"],
      ["user_quests", "stage", "INTEGER NOT NULL DEFAULT 0"],
      ["user_quests", "completed", "INTEGER NOT NULL DEFAULT 0"],
      ["user_animals", "days_left", "INTEGER NOT NULL DEFAULT 30"],
      ["user_animals", "cleanliness", "INTEGER NOT NULL DEFAULT 100"],
      ["admin_users", "password_hash", "TEXT NOT NULL DEFAULT ''"],
      ["admin_users", "role", "TEXT NOT NULL DEFAULT 'viewer'"],
      ["admin_users", "totp_secret", "TEXT"],
      ["admin_users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0"],
      ["admin_users", "last_login_at", "INTEGER"],
      ["entitlements", "reason", "TEXT"],
      ["audit_log", "reason", "TEXT"],
      ["audit_log", "before_json", "TEXT"],
      ["audit_log", "after_json", "TEXT"],
    ];
    for (const [table, column, definition] of extraColumns) {
      try {
        if (this.db.dialect === "sqlite") {
          await this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        } else {
          await this.db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
        }
      } catch {
        // Column already exists — expected on repeat startup.
      }
    }

    for (const kind of DEFAULT_ENTITLEMENT_KINDS) {
      await this.db.run(
        `INSERT INTO entitlement_kinds (kind, label_en, label_he, rank, default_days, gating_mode)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind) DO NOTHING`.replace(
          /ON CONFLICT\(kind\) DO NOTHING/,
          this.db.dialect === "sqlite"
            ? "ON CONFLICT(kind) DO NOTHING"
            : "ON CONFLICT(kind) DO NOTHING",
        ),
        [kind.kind, kind.label_en, kind.label_he, kind.rank, kind.default_days, kind.gating_mode],
      );
    }

    const bootstrapUser = process.env.ADMIN_BOOTSTRAP_USER;
    const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (bootstrapUser && bootstrapPass) {
      const existing = await this.db.get("SELECT id FROM admin_users WHERE username = ?", [bootstrapUser]);
      if (!existing) {
        await this.db.insert(
          `INSERT INTO admin_users (username, password_hash, role, disabled, created_at)
           VALUES (?, ?, 'owner', 0, ?)`,
          [bootstrapUser, hashPassword(bootstrapPass), now()],
        );
        console.log(`[admin] bootstrapped owner '${bootstrapUser}'`);
      }
    }
  }

  // ── audit ─────────────────────────────────────────────────────────────

  async audit(
    ctx: AuthContext | null,
    action: string,
    targetType?: string | null,
    targetId?: string | number | null,
    reason?: string | null,
    before?: unknown,
    after?: unknown,
  ): Promise<void> {
    await this.db.insert(
      `INSERT INTO audit_log (actor, action, target_type, target_id, reason, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ctx?.admin.username ?? "system",
        action,
        targetType ?? null,
        targetId == null ? null : String(targetId),
        reason ?? null,
        safeJson(before),
        safeJson(after),
        now(),
      ],
    );
  }

  private authorize(ctx: AuthContext, permission: string): void {
    if (!can(ctx.admin.role, permission)) {
      throw new AuthError(`Permission '${permission}' required`, 403);
    }
  }

  assertPermission(ctx: AuthContext, permission: string): void {
    this.authorize(ctx, permission);
  }

  async getAdmin(id: number): Promise<AdminUser | undefined> {
    return this.db.get("SELECT * FROM admin_users WHERE id = ?", [id]) as Promise<AdminUser | undefined>;
  }

  async verifyAdminTotp(ctx: AuthContext, code: string): Promise<boolean> {
    const admin = await this.getAdmin(ctx.admin.id);
    if (!admin?.totp_enabled || !admin.totp_secret) return true;
    return verifyTotp(decryptSecret(admin.totp_secret), String(code ?? ""));
  }

  // ── auth ──────────────────────────────────────────────────────────────

  async login(username: string, password: string, totp?: string): Promise<any> {
    const admin = await this.db.get("SELECT * FROM admin_users WHERE username = ?", [String(username ?? "")]);
    if (!admin || admin.disabled) throw new AuthError("Invalid credentials", 401);
    if (!verifyPassword(String(password ?? ""), admin.password_hash)) {
      await this.audit(null, "auth.login.denied", "admin_user", admin.id, "bad password");
      throw new AuthError("Invalid credentials", 401);
    }
    if (admin.totp_enabled && !totp) {
      await this.audit(null, "auth.login.totp_required", "admin_user", admin.id, null);
      return { needsTotp: true };
    }
    if (admin.totp_enabled) {
      const secret = decryptSecret(admin.totp_secret);
      if (!verifyTotp(secret, String(totp ?? ""))) {
        await this.audit(null, "auth.login.denied", "admin_user", admin.id, "bad TOTP");
        throw new AuthError("Invalid verification code", 401);
      }
    }
    await this.db.run("UPDATE admin_users SET last_login_at = ? WHERE id = ?", [now(), admin.id]);
    await this.audit(
      { admin, ip: "", userAgent: "", sessionId: "" },
      "auth.login",
      "admin_user",
      admin.id,
      null,
    );
    return {
      needsTotp: false,
      user: { id: admin.id, username: admin.username, role: admin.role, totpEnabled: !!admin.totp_enabled },
    };
  }

  async totpEnroll(ctx: AuthContext): Promise<{ secret: string; uri: string }> {
    this.authorize(ctx, "admins:read");
    const secret = generateTotpSecret();
    return { secret, uri: totpUri(secret, ctx.admin.username) };
  }

  async totpEnable(ctx: AuthContext, secret: string, code: string): Promise<{ ok: true }> {
    this.authorize(ctx, "admins:read");
    if (!verifyTotp(secret, String(code ?? ""))) throw new AuthError("Invalid verification code", 400);
    await this.db.run(
      "UPDATE admin_users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?",
      [encryptSecret(secret), ctx.admin.id],
    );
    await this.audit(ctx, "auth.totp.enable", "admin_user", ctx.admin.id, null);
    return { ok: true };
  }

  async me(ctx: AuthContext): Promise<any> {
    const admin = await this.db.get("SELECT * FROM admin_users WHERE id = ?", [ctx.admin.id]);
    return {
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        totpEnabled: !!admin.totp_enabled,
      },
      permissions: Object.keys(PERMISSIONS).filter((p) => can(admin.role, p)),
    };
  }

  // ── overview ──────────────────────────────────────────────────────────

  async overview(ctx: AuthContext): Promise<any> {
    this.authorize(ctx, "overview:read");
    const one = async (sql: string, params: any[] = []) => (await this.db.get(sql, params))?.n ?? 0;
    const [
      users,
      activeEntitlements,
      activeSubscriptions,
      unusedCodes,
      expiringCodes,
      redemptionsToday,
      auditEntries,
      bannedUsers,
    ] = await Promise.all([
      one("SELECT COUNT(*) AS n FROM users"),
      one("SELECT COUNT(*) AS n FROM entitlements WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)", [now()]),
      one("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'"),
      one("SELECT COUNT(*) AS n FROM redeem_codes WHERE status = 'unused'"),
      one("SELECT COUNT(*) AS n FROM redeem_codes WHERE status = 'unused' AND expires_at IS NOT NULL AND expires_at < ?", [now() + 7 * 86400000]),
      one("SELECT COUNT(*) AS n FROM redeem_codes WHERE used_at > ?", [now() - 86400000]),
      one("SELECT COUNT(*) AS n FROM audit_log"),
      one("SELECT COUNT(*) AS n FROM users WHERE is_banned = 1"),
    ]);
    const recentAudit = await this.db.all(
      "SELECT actor, action, target_type, target_id, reason, created_at FROM audit_log ORDER BY id DESC LIMIT 10",
    );
    return {
      users,
      activeEntitlements,
      activeSubscriptions,
      unusedCodes,
      expiringCodes,
      redemptionsToday,
      auditEntries,
      bannedUsers,
      recentAudit,
    };
  }

  // ── users ─────────────────────────────────────────────────────────────

  async listUsers(ctx: AuthContext, query = "", limit = 50, offset = 0): Promise<any> {
    this.authorize(ctx, "users:read");
    const q = `%${String(query ?? "")}%`;
    const where = query ? "WHERE username LIKE ? OR email LIKE ? OR CAST(id AS TEXT) LIKE ?" : "";
    const params = query ? [q, q, q] : [];
    const total = (await this.db.get(`SELECT COUNT(*) AS n FROM users ${where}`, params))?.n ?? 0;
    const items = await this.db.all(
      `SELECT id, username, email, gender, coins, credits, xp, level, premium, ranger_level,
              is_moderator, is_banned, ban_reason, days_played, last_login, created_at
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0)],
    );
    return { items, total, limit, offset };
  }

  async getUser(ctx: AuthContext, id: number): Promise<any> {
    this.authorize(ctx, "users:read");
    const user = await this.db.get(
      `SELECT id, username, email, gender, coins, credits, xp, level, premium, ranger_level,
              is_moderator, is_banned, ban_reason, days_played, last_login, last_room_id, skin_tone, created_at
       FROM users WHERE id = ?`,
      [id],
    );
    if (!user) throw new AuthError("User not found", 404);
    const [inventory, cards, animals, quests, house, houses, storage, potions, scores, chat, entitlements, subscriptions, sessions, notes, redemptions] =
      await Promise.all([
        this.db.all("SELECT * FROM user_items WHERE user_id = ? ORDER BY id", [id]),
        this.db.all("SELECT * FROM user_cards WHERE user_id = ? ORDER BY id", [id]),
        this.db.all("SELECT * FROM user_animals WHERE user_id = ? ORDER BY id", [id]),
        this.db.all("SELECT * FROM user_quests WHERE user_id = ? ORDER BY id", [id]),
        this.db.get("SELECT * FROM user_house WHERE user_id = ?", [id]),
        this.db.get("SELECT * FROM houses WHERE player_id = ?", [id]),
        this.db.all("SELECT * FROM storage_items WHERE user_id = ? ORDER BY id", [id]),
        this.db.all("SELECT * FROM potions WHERE user_id = ? ORDER BY id", [id]),
        this.db.all("SELECT * FROM game_scores WHERE user_id = ? ORDER BY score DESC LIMIT 50", [id]),
        this.db.all("SELECT * FROM chat_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT 50", [id]),
        this.db.all("SELECT * FROM entitlements WHERE user_id = ? ORDER BY id DESC", [id]),
        this.db.all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC", [id]),
        this.db.all("SELECT * FROM user_sessions WHERE user_id = ? ORDER BY login_at DESC LIMIT 50", [id]),
        this.db.all("SELECT * FROM admin_notes WHERE user_id = ? ORDER BY id DESC", [id]),
        this.db.all(
          "SELECT code_hint, used_at, batch_id FROM redeem_codes WHERE used_by = ? ORDER BY used_at DESC LIMIT 50",
          [id],
        ),
      ]);
    const userAudit = await this.db.all(
      "SELECT actor, action, reason, created_at FROM audit_log WHERE target_type = 'user' AND target_id = ? ORDER BY id DESC LIMIT 50",
      [String(id)],
    );
    return {
      user,
      inventory,
      cards,
      animals,
      quests,
      house: house ?? houses ?? null,
      storage,
      potions,
      scores,
      chat,
      entitlements,
      subscriptions,
      sessions,
      notes,
      redemptions,
      audit: userAudit,
    };
  }

  async updateUser(ctx: AuthContext, id: number, patch: Record<string, any>, reason?: string): Promise<any> {
    this.authorize(ctx, "users:write");
    const before = await this.db.get("SELECT * FROM users WHERE id = ?", [id]);
    if (!before) throw new AuthError("User not found", 404);
    const entries = Object.entries(patch ?? {}).filter(
      ([key]) => (USER_EDITABLE_FIELDS as readonly string[]).includes(key),
    );
    if (!entries.length) throw new AuthError("No editable fields supplied", 400);
    if ("username" in patch) {
      const conflict = await this.db.get("SELECT id FROM users WHERE username = ? AND id <> ?", [patch.username, id]);
      if (conflict) throw new AuthError("Username already taken", 409);
    }
    if ("is_banned" in patch && !patch.ban_reason && !before.ban_reason) {
      throw new AuthError("A reason is required when banning a user", 400);
    }
    const sets = entries.map(([key]) => `${key} = ?`).join(", ");
    await this.db.run(`UPDATE users SET ${sets} WHERE id = ?`, [...entries.map(([, value]) => value), id]);
    const after = await this.db.get("SELECT * FROM users WHERE id = ?", [id]);
    await this.audit(ctx, "user.update", "user", id, reason, before, after);
    return after;
  }

  async setUserPassword(ctx: AuthContext, id: number, newPassword: string, reason?: string): Promise<{ ok: true }> {
    this.authorize(ctx, "users:password");
    if (!newPassword || String(newPassword).length < 10) {
      throw new AuthError("Password must be at least 10 characters", 400);
    }
    await this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(newPassword), id]);
    await this.audit(ctx, "user.password.reset", "user", id, reason, { password_hash: "[redacted]" }, { password_hash: "[redacted]" });
    return { ok: true };
  }

  async setBan(ctx: AuthContext, id: number, banned: boolean, reason: string): Promise<{ ok: true }> {
    this.authorize(ctx, "users:ban");
    if (banned && !reason) throw new AuthError("Ban reason is required", 400);
    const before = await this.db.get("SELECT is_banned, ban_reason FROM users WHERE id = ?", [id]);
    if (!before) throw new AuthError("User not found", 404);
    await this.db.run(
      "UPDATE users SET is_banned = ?, ban_reason = ? WHERE id = ?",
      [banned ? 1 : 0, banned ? reason : null, id],
    );
    await this.audit(ctx, banned ? "user.ban" : "user.unban", "user", id, reason, before, { is_banned: banned ? 1 : 0 });
    return { ok: true };
  }

  async addNote(ctx: AuthContext, id: number, note: string): Promise<any> {
    this.authorize(ctx, "users:write");
    const clean = String(note ?? "").trim();
    if (!clean) throw new AuthError("Note cannot be empty", 400);
    const noteId = await this.db.insert(
      "INSERT INTO admin_notes (user_id, author, note, created_at) VALUES (?, ?, ?, ?)",
      [id, ctx.admin.username, clean, now()],
    );
    await this.audit(ctx, "user.note.add", "user", id, clean, null, { note_id: noteId });
    return { id: noteId };
  }

  async deleteNote(ctx: AuthContext, id: number, noteId: number): Promise<{ ok: true }> {
    this.authorize(ctx, "users:write");
    const before = await this.db.get("SELECT * FROM admin_notes WHERE id = ? AND user_id = ?", [noteId, id]);
    if (!before) throw new AuthError("Note not found", 404);
    await this.db.run("DELETE FROM admin_notes WHERE id = ?", [noteId]);
    await this.audit(ctx, "user.note.delete", "user", id, null, before, null);
    return { ok: true };
  }

  // ── entitlements ──────────────────────────────────────────────────────

  async listEntitlementKinds(ctx: AuthContext): Promise<any[]> {
    this.authorize(ctx, "entitlements:read");
    return this.db.all("SELECT * FROM entitlement_kinds ORDER BY rank, kind");
  }

  async upsertEntitlementKind(ctx: AuthContext, kind: string, patch: Record<string, any>): Promise<any> {
    this.authorize(ctx, "entitlements:write");
    const existing = await this.db.get("SELECT * FROM entitlement_kinds WHERE kind = ?", [kind]);
    if (existing) {
      const fields = ["label_en", "label_he", "rank", "default_days", "gating_mode"].filter((k) => k in patch);
      if (fields.length) {
        await this.db.run(
          `UPDATE entitlement_kinds SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE kind = ?`,
          [...fields.map((f) => patch[f]), kind],
        );
      }
    } else {
      await this.db.insert(
        `INSERT INTO entitlement_kinds (kind, label_en, label_he, rank, default_days, gating_mode)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [kind, patch.label_en ?? kind, patch.label_he ?? kind, patch.rank ?? 99, patch.default_days ?? null, patch.gating_mode ?? "off"],
      );
    }
    const after = await this.db.get("SELECT * FROM entitlement_kinds WHERE kind = ?", [kind]);
    await this.audit(ctx, "entitlement.kind.upsert", "entitlement_kind", kind, null, existing, after);
    return after;
  }

  async grantEntitlement(
    ctx: AuthContext,
    userId: number,
    kind: string,
    days: number | null,
    reason?: string,
    source = "admin",
  ): Promise<any> {
    this.authorize(ctx, "entitlements:write");
    const known = await this.db.get("SELECT * FROM entitlement_kinds WHERE kind = ?", [kind]);
    if (!known) throw new AuthError(`Unknown entitlement kind '${kind}'`, 400);
    const duration = days ?? known.default_days;
    const expiresAt = duration ? now() + Number(duration) * 86400000 : null;
    const id = await this.db.insert(
      `INSERT INTO entitlements (user_id, kind, source, active, granted_at, expires_at, reason)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [userId, kind, source, now(), expiresAt, reason ?? null],
    );
    if (kind === "premium" || kind.startsWith("pioneer")) {
      await this.db.run("UPDATE users SET premium = 1 WHERE id = ?", [userId]);
    }
    await this.audit(ctx, "entitlement.grant", "user", userId, reason, null, { id, kind, expiresAt });
    return { id, kind, expiresAt };
  }

  async revokeEntitlement(ctx: AuthContext, userId: number, entitlementId: number, reason?: string): Promise<{ ok: true }> {
    this.authorize(ctx, "entitlements:write");
    const before = await this.db.get("SELECT * FROM entitlements WHERE id = ? AND user_id = ?", [entitlementId, userId]);
    if (!before) throw new AuthError("Entitlement not found", 404);
    await this.db.run("UPDATE entitlements SET active = 0 WHERE id = ?", [entitlementId]);
    const remaining = await this.db.get(
      "SELECT COUNT(*) AS n FROM entitlements WHERE user_id = ? AND active = 1 AND kind IN ('premium','pioneer','pioneer:weekly','pioneer:monthly','pioneer:bimonthly','pioneer:quarterly','pioneer:halfyear','pioneer:yearly')",
      [userId],
    );
    if (!remaining?.n) await this.db.run("UPDATE users SET premium = 0 WHERE id = ?", [userId]);
    await this.audit(ctx, "entitlement.revoke", "user", userId, reason, before, { active: 0 });
    return { ok: true };
  }

  // ── subscriptions ─────────────────────────────────────────────────────

  async listSubscriptions(ctx: AuthContext, limit = 100): Promise<any[]> {
    this.authorize(ctx, "subscriptions:read");
    return this.db.all(
      `SELECT s.*, u.username FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC LIMIT ?`,
      [Math.min(Number(limit) || 100, 500)],
    );
  }

  async grantSubscription(ctx: AuthContext, userId: number, plan: string, days: number, reason?: string): Promise<any> {
    this.authorize(ctx, "subscriptions:write");
    const known = await this.db.get("SELECT kind FROM entitlement_kinds WHERE kind = ?", [plan]);
    if (!known) throw new AuthError(`Unknown plan '${plan}'`, 400);
    const expiry = now() + Number(days || 30) * 86400000;
    const id = await this.db.insert(
      `INSERT INTO subscriptions (user_id, provider, provider_sub_id, plan, status, current_period_end, created_at)
       VALUES (?, 'manual', ?, ?, 'active', ?, ?)`,
      [userId, `manual-${now()}`, plan, expiry, now()],
    );
    await this.grantEntitlement(ctx, userId, plan, days, reason ?? `subscription:${plan}`, "subscription:manual");
    return { id, plan, expiresAt: expiry };
  }

  async revokeSubscription(ctx: AuthContext, userId: number, subscriptionId: number, reason?: string): Promise<{ ok: true }> {
    this.authorize(ctx, "subscriptions:write");
    const before = await this.db.get("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?", [subscriptionId, userId]);
    if (!before) throw new AuthError("Subscription not found", 404);
    await this.db.run("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE id = ?", [now(), subscriptionId]);
    await this.db.run("UPDATE entitlements SET active = 0 WHERE user_id = ? AND source LIKE 'subscription:%'", [userId]);
    await this.db.run("UPDATE users SET premium = 0 WHERE id = ?", [userId]);
    await this.audit(ctx, "subscription.revoke", "user", userId, reason, before, { status: "cancelled" });
    return { ok: true };
  }

  // ── catalog ───────────────────────────────────────────────────────────

  async listCatalog(ctx: AuthContext, kind?: string): Promise<any[]> {
    this.authorize(ctx, "catalog:read");
    const where = kind ? "WHERE kind = ?" : "";
    return this.db.all(`SELECT * FROM catalog_entries ${where} ORDER BY kind, entity_id`, kind ? [kind] : []);
  }

  async upsertCatalogEntry(ctx: AuthContext, kind: string, entityId: number, data: any, publish: boolean): Promise<any> {
    this.authorize(ctx, "catalog:write");
    const before = await this.db.get("SELECT * FROM catalog_entries WHERE kind = ? AND entity_id = ?", [kind, entityId]);
    const payload = JSON.stringify(data ?? {});
    if (before) {
      await this.db.run(
        "UPDATE catalog_entries SET data_json = ?, published = ?, updated_by = ?, updated_at = ? WHERE kind = ? AND entity_id = ?",
        [payload, publish ? 1 : 0, ctx.admin.username, now(), kind, entityId],
      );
    } else {
      await this.db.insert(
        `INSERT INTO catalog_entries (kind, entity_id, data_json, published, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [kind, entityId, payload, publish ? 1 : 0, ctx.admin.username, now()],
      );
    }
    const after = await this.db.get("SELECT * FROM catalog_entries WHERE kind = ? AND entity_id = ?", [kind, entityId]);
    await this.audit(ctx, "catalog.entry.upsert", "catalog_entry", `${kind}:${entityId}`, null, before, after);
    return after;
  }

  async catalogDrift(ctx: AuthContext): Promise<any> {
    this.authorize(ctx, "catalog:read");
    const emptyStores = await this.db.all(
      "SELECT id, name FROM stores WHERE items_json IS NULL OR items_json = '[]' ORDER BY id",
    ).catch(() => [] as any[]);
    const unpublished = await this.db.all(
      "SELECT kind, entity_id, updated_by, updated_at FROM catalog_entries WHERE published = 0 ORDER BY id",
    );
    return { emptyStores, unpublished };
  }

  async listCollections(ctx: AuthContext): Promise<any[]> {
    this.authorize(ctx, "catalog:read");
    return this.db.all("SELECT * FROM catalog_collections ORDER BY id DESC");
  }

  async createCollection(ctx: AuthContext, name: string, nameHe: string, description: string): Promise<any> {
    this.authorize(ctx, "catalog:write");
    if (!name?.trim()) throw new AuthError("Collection name is required", 400);
    const id = await this.db.insert(
      `INSERT INTO catalog_collections (name, name_he, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), nameHe?.trim() || null, description ?? "", ctx.admin.username, now()],
    );
    await this.audit(ctx, "catalog.collection.create", "catalog_collection", id, null, null, { name });
    return { id };
  }

  async addCollectionItem(ctx: AuthContext, collectionId: number, entityKind: string, entityId: number): Promise<{ ok: true }> {
    this.authorize(ctx, "catalog:write");
    await this.db.run(
      `INSERT INTO catalog_collection_items (collection_id, entity_kind, entity_id, added_at)
       VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`.replace(
        /ON CONFLICT DO NOTHING/,
        this.db.dialect === "sqlite" ? "ON CONFLICT DO NOTHING" : "ON CONFLICT DO NOTHING",
      ),
      [collectionId, entityKind, entityId, now()],
    );
    await this.audit(ctx, "catalog.collection.item.add", "catalog_collection", collectionId, null, null, { entityKind, entityId });
    return { ok: true };
  }

  async removeCollectionItem(ctx: AuthContext, collectionId: number, entityKind: string, entityId: number): Promise<{ ok: true }> {
    this.authorize(ctx, "catalog:write");
    await this.db.run(
      "DELETE FROM catalog_collection_items WHERE collection_id = ? AND entity_kind = ? AND entity_id = ?",
      [collectionId, entityKind, entityId],
    );
    await this.audit(ctx, "catalog.collection.item.remove", "catalog_collection", collectionId, null, null, { entityKind, entityId });
    return { ok: true };
  }

  // ── codes & cards ─────────────────────────────────────────────────────

  async createBatch(ctx: AuthContext, input: any): Promise<any> {
    this.authorize(ctx, "codes:write");
    const type = String(input.type ?? "code");
    if (!["code", "gift", "rav"].includes(type)) throw new AuthError("type must be code|gift|rav", 400);
    const count = Math.min(Math.max(Number(input.count ?? 10), 1), 10000);
    const reward = typeof input.reward === "string" ? parseJson(input.reward, {}) : input.reward ?? {};
    const prefix = String(input.prefix ?? (type === "rav" ? "RAV" : type === "gift" ? "GIFT" : "EKO"));
    const expiresAt = input.days ? now() + Number(input.days) * 86400000 : null;
    const name = String(input.name ?? `${type}-${new Date().toISOString().slice(0, 10)}`);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes: string[] = [];

    const batchId = await this.db.transaction(async (tx) => {
      const id = await tx.insert(
        `INSERT INTO redeem_batches (name, type, reward_json, expires_at, created_by, count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, type, JSON.stringify(reward), expiresAt, ctx.admin.username, count, now()],
      );
      for (let i = 0; i < count; i++) {
        const bytes = crypto.randomBytes(12);
        let body = "";
        for (let j = 0; j < 12; j++) body += alphabet[bytes[j] % alphabet.length];
        const code = `${prefix}-${body}`;
        const hash = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
        await tx.insert(
          `INSERT INTO redeem_codes (batch_id, code_hash, code_hint, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
          [id, hash, `${prefix}-****-${body.slice(-4)}`, expiresAt, now()],
        );
        codes.push(code);
      }
      return id;
    });
    await this.audit(ctx, "codes.batch.create", "redeem_batch", batchId, input.reason, { type, count, name });
    if (type === "rav" && !Array.isArray(reward.rareItemIds) && !(reward as any).rareItems) {
      await this.audit(ctx, "codes.batch.rav_without_rare_items", "redeem_batch", batchId, "Rav batch has no rareItemIds");
    }
    return { batchId, codes };
  }

  async listBatches(ctx: AuthContext, limit = 50): Promise<any[]> {
    this.authorize(ctx, "codes:read");
    return this.db.all("SELECT * FROM redeem_batches ORDER BY id DESC LIMIT ?", [Math.min(Number(limit) || 50, 500)]);
  }

  async listCodes(ctx: AuthContext, batchId?: number, limit = 100): Promise<any> {
    this.authorize(ctx, "codes:read");
    const where = batchId ? "WHERE batch_id = ?" : "";
    const params = batchId ? [batchId] : [];
    const total = (await this.db.get(`SELECT COUNT(*) AS n FROM redeem_codes ${where}`, params))?.n ?? 0;
    const items = await this.db.all(
      `SELECT id, batch_id, code_hint, status, used_by, used_at, expires_at FROM redeem_codes ${where}
       ORDER BY id DESC LIMIT ?`,
      [...params, Math.min(Number(limit) || 100, 500)],
    );
    return { items, total };
  }

  async redeemCode(ctx: AuthContext, code: string, userId: number, reason?: string): Promise<any> {
    this.authorize(ctx, "codes:write");
    const hash = crypto.createHash("sha256").update(String(code ?? "").trim().toUpperCase()).digest("hex");
    const row = await this.db.get("SELECT * FROM redeem_codes WHERE code_hash = ?", [hash]);
    if (!row) throw new AuthError("Invalid code", 404);
    if (row.status !== "unused") throw new AuthError(`Code is ${row.status}`, 409);
    if (row.expires_at && row.expires_at < now()) throw new AuthError("Code expired", 409);
    const batch = await this.db.get("SELECT * FROM redeem_batches WHERE id = ?", [row.batch_id]);
    if (!batch) throw new AuthError("Batch not found", 404);
    const reward = parseJson<any>(batch.reward_json, {});
    if (batch.type === "rav") {
      const user = await this.db.get("SELECT premium FROM users WHERE id = ?", [userId]);
      if (!user?.premium) throw new AuthError("Rav-Card requires rare-store access (Pioneer)", 403);
    }
    await this.db.transaction(async (tx) => {
      if (reward.coins) await tx.run("UPDATE users SET coins = coins + ? WHERE id = ?", [Number(reward.coins), userId]);
      if (reward.credits) await tx.run("UPDATE users SET credits = credits + ? WHERE id = ?", [Number(reward.credits), userId]);
      if (reward.premium) await tx.run("UPDATE users SET premium = 1 WHERE id = ?", [userId]);
      for (const itemId of reward.itemIds ?? []) {
        await tx.run("INSERT INTO user_items (user_id, item_id, quantity, obtained_at) VALUES (?, ?, 1, ?)", [userId, Number(itemId), now()]);
      }
      for (const cardId of reward.cardIds ?? []) {
        await tx.run("INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, 1)", [userId, Number(cardId)]);
      }
      for (const rareId of reward.rareItemIds ?? []) {
        await tx.run("INSERT INTO user_items (user_id, item_id, quantity, obtained_at, item_type) VALUES (?, ?, 1, ?, 2)", [userId, Number(rareId), now()]);
      }
      if (reward.entitlement) {
        const kind = String(reward.entitlement);
        const known = await tx.get("SELECT kind, default_days FROM entitlement_kinds WHERE kind = ?", [kind]);
        if (!known) throw new AuthError(`Reward entitlement '${kind}' is not in the registry`, 400);
        const days = reward.entitlementDays ?? known.default_days;
        await tx.run(
          `INSERT INTO entitlements (user_id, kind, source, active, granted_at, expires_at, reason)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
          [userId, kind, `redeem:${batch.id}`, now(), days ? now() + Number(days) * 86400000 : null, `redeem ${row.code_hint}`],
        );
      }
      await tx.run("UPDATE redeem_codes SET status = 'used', used_by = ?, used_at = ? WHERE id = ? AND status = 'unused'", [userId, now(), row.id]);
    });
    await this.audit(ctx, "codes.redeem", "user", userId, reason ?? `code ${row.code_hint}`, null, { batchId: batch.id });
    return { ok: true, batchId: batch.id, reward };
  }

  async revokeCode(ctx: AuthContext, code: string, reason?: string): Promise<{ ok: true }> {
    this.authorize(ctx, "codes:revoke");
    const hash = crypto.createHash("sha256").update(String(code ?? "").trim().toUpperCase()).digest("hex");
    const row = await this.db.get("SELECT id, code_hint FROM redeem_codes WHERE code_hash = ?", [hash]);
    if (!row) throw new AuthError("Invalid code", 404);
    await this.db.run("UPDATE redeem_codes SET status = 'revoked' WHERE id = ?", [row.id]);
    await this.audit(ctx, "codes.revoke", "redeem_code", row.id, reason, null, { code_hint: row.code_hint });
    return { ok: true };
  }

  async revokeBatch(ctx: AuthContext, batchId: number, reason?: string): Promise<any> {
    this.authorize(ctx, "codes:revoke");
    const changes = await this.db.run(
      "UPDATE redeem_codes SET status = 'revoked' WHERE batch_id = ? AND status = 'unused'",
      [batchId],
    );
    await this.audit(ctx, "codes.batch.revoke", "redeem_batch", batchId, reason, null, { revoked: changes });
    return { ok: true, revoked: changes };
  }

  // ── audit ─────────────────────────────────────────────────────────────

  async listAudit(ctx: AuthContext, filters: any): Promise<any> {
    this.authorize(ctx, "audit:read");
    const where: string[] = [];
    const params: any[] = [];
    if (filters.actor) { where.push("actor LIKE ?"); params.push(`%${filters.actor}%`); }
    if (filters.action) { where.push("action LIKE ?"); params.push(`%${filters.action}%`); }
    if (filters.targetType) { where.push("target_type = ?"); params.push(filters.targetType); }
    if (filters.targetId) { where.push("target_id = ?"); params.push(String(filters.targetId)); }
    if (filters.from) { where.push("created_at >= ?"); params.push(Number(filters.from)); }
    if (filters.to) { where.push("created_at <= ?"); params.push(Number(filters.to)); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Number(filters.limit) || 100, 500);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const total = (await this.db.get(`SELECT COUNT(*) AS n FROM audit_log ${clause}`, params))?.n ?? 0;
    const items = await this.db.all(
      `SELECT * FROM audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { items: items.map((row) => ({ ...row, before: parseJson(row.before_json, null), after: parseJson(row.after_json, null) })), total, limit, offset };
  }

  // ── SQL console ───────────────────────────────────────────────────────

  async checkSql(ctx: AuthContext, sql: string, mode: "read" | "write") {
    this.authorize(ctx, mode === "write" ? "sql:write" : "sql:read");
    return checkSql(sql, mode);
  }

  async runSqlStatement(
    ctx: AuthContext,
    sql: string,
    params: any[],
    mode: "read" | "write",
    previewOnly: boolean,
    reason?: string,
  ): Promise<any> {
    this.authorize(ctx, mode === "write" ? "sql:write" : "sql:read");
    if (mode === "write" && (!reason || String(reason).trim().length < 5)) {
      throw new AuthError("A reason (min 5 chars) is required for SQL writes", 400);
    }
    const check = checkSql(sql, mode);
    if (check.mode === "blocked") throw new AuthError(check.reason ?? "Statement blocked", 400);
    const result = await runSql(this.db, check, params ?? [], previewOnly);
    await this.db.insert(
      `INSERT INTO sql_query_history (actor, sql, params_json, mode, reason, row_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ctx.admin.username, check.sql, JSON.stringify(params ?? []), mode, reason ?? null, result.rows.length || result.changes, now()],
    );
    await this.audit(ctx, previewOnly ? "sql.preview" : mode === "write" ? "sql.write" : "sql.read", "sql_query", null, reason, null, {
      sql: check.sql,
      rows: result.rows.length,
      changes: result.changes,
    });
    return result;
  }

  async sqlHistory(ctx: AuthContext, limit = 100): Promise<any[]> {
    this.authorize(ctx, "sql:read");
    return this.db.all("SELECT * FROM sql_query_history ORDER BY id DESC LIMIT ?", [Math.min(Number(limit) || 100, 500)]);
  }

  // ── admin users ───────────────────────────────────────────────────────

  async listAdmins(ctx: AuthContext): Promise<any[]> {
    this.authorize(ctx, "admins:read");
    return this.db.all("SELECT id, username, role, totp_enabled, disabled, created_at, last_login_at FROM admin_users ORDER BY id");
  }

  async createAdmin(ctx: AuthContext, username: string, password: string, role: Role): Promise<any> {
    this.authorize(ctx, "admins:write");
    if (!username?.trim() || !password || String(password).length < 12) {
      throw new AuthError("Username required and password must be at least 12 characters", 400);
    }
    if (!["viewer", "operator", "admin", "owner"].includes(role)) throw new AuthError("Invalid role", 400);
    const id = await this.db.insert(
      `INSERT INTO admin_users (username, password_hash, role, disabled, created_at) VALUES (?, ?, ?, 0, ?)`,
      [username.trim(), hashPassword(password), role, now()],
    );
    await this.audit(ctx, "admin.create", "admin_user", id, null, null, { username, role });
    return { id };
  }

  async updateAdmin(ctx: AuthContext, id: number, patch: Record<string, any>): Promise<{ ok: true }> {
    this.authorize(ctx, "admins:write");
    const before = await this.db.get("SELECT * FROM admin_users WHERE id = ?", [id]);
    if (!before) throw new AuthError("Admin not found", 404);
    if (id === ctx.admin.id && (patch.disabled || (patch.role && patch.role !== "owner"))) {
      throw new AuthError("Cannot disable or demote yourself", 400);
    }
    const fields = ["role", "disabled"].filter((f) => f in patch);
    if (fields.length) {
      await this.db.run(`UPDATE admin_users SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`, [...fields.map((f) => patch[f]), id]);
    }
    if (patch.password) {
      if (String(patch.password).length < 12) throw new AuthError("Password must be at least 12 characters", 400);
      await this.db.run("UPDATE admin_users SET password_hash = ? WHERE id = ?", [hashPassword(patch.password), id]);
    }
    await this.audit(ctx, "admin.update", "admin_user", id, patch.reason, before, patch);
    return { ok: true };
  }

  async deleteAdmin(ctx: AuthContext, id: number): Promise<{ ok: true }> {
    this.authorize(ctx, "admins:write");
    if (id === ctx.admin.id) throw new AuthError("Cannot delete yourself", 400);
    await this.db.run("DELETE FROM admin_users WHERE id = ?", [id]);
    await this.audit(ctx, "admin.delete", "admin_user", id, null, { id }, null);
    return { ok: true };
  }
}

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AuthError";
  }
}
