import express from "express";
import type { Request, Response, NextFunction } from "express";
import * as path from "path";
import * as fs from "fs";
import { AdminService, AuthError } from "./service";
import { createSessionMiddleware, clientIp, ipAllowed, requireTotpForWrites } from "./security";
import type { AuthContext } from "./types";

function findWebRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../admin/web"),       // dist/admin → /app/admin/web
    path.resolve(__dirname, "../../../../admin/web"), // src/admin → repo/admin/web
    path.resolve(process.cwd(), "admin/web"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}
const WEB_ROOT = findWebRoot();

function ctx(req: Request): AuthContext {
  const admin = (req as any).session.admin;
  return {
    admin,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] ?? ""),
    sessionId: (req as any).sessionID ?? "",
  };
}

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (res.headersSent) return;
      res.json({ ok: true, data: result ?? null });
    } catch (error: any) {
      if (error instanceof AuthError) {
        res.status(error.status).json({ ok: false, error: error.message });
      } else {
        console.error("[admin]", error);
        res.status(500).json({ ok: false, error: error?.message ?? "Internal error" });
      }
    }
  };
}

export function createAdminRouter(service: AdminService): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: "1mb" }));
  router.use(express.urlencoded({ extended: true }));

  // ── auth ─────────────────────────────────────────────────────────────
  router.post(
    "/auth/login",
    wrap(async (req, res) => {
      if (!ipAllowed(req)) throw new AuthError("IP not allowed", 403);
      const { username, password, totp } = req.body ?? {};
      const result = await service.login(username, password, totp);
      if (result.needsTotp) return res.json({ ok: true, data: result });
      (req as any).session.admin = result.user;
      // role comes from DB on every request, not from this cached object.
      return result;
    }),
  );

  router.post(
    "/auth/logout",
    wrap(async (req) => {
      await new Promise<void>((resolve) => (req as any).session.destroy(() => resolve()));
      return { ok: true };
    }),
  );

  router.get(
    "/auth/me",
    wrap(async (req) => service.me(ctx(req))),
  );

  router.post(
    "/auth/totp/enroll",
    wrap(async (req) => service.totpEnroll(ctx(req))),
  );

  router.post(
    "/auth/totp/enable",
    wrap(async (req) => service.totpEnable(ctx(req), req.body.secret, req.body.code)),
  );

  // ── auth guard for everything below ──────────────────────────────────
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).session?.admin) return res.status(401).json({ ok: false, error: "Not authenticated" });
    if (!ipAllowed(req)) return res.status(403).json({ ok: false, error: "IP not allowed" });
    next();
  });

  // Every mutation requires a fresh TOTP code when 2FA is enabled.
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    if (!requireTotpForWrites()) return next();
    try {
      const ok = await service.verifyAdminTotp(ctx(req), String(req.headers["x-totp"] ?? ""));
      if (!ok) return res.status(403).json({ ok: false, error: "Valid TOTP code required (X-TOTP header)" });
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/meta", wrap(async (req) => service.me(ctx(req))));
  router.get("/overview", wrap(async (req) => service.overview(ctx(req))));

  // users
  router.get("/users", wrap(async (req) =>
    service.listUsers(ctx(req), String(req.query.q ?? ""), Number(req.query.limit ?? 50), Number(req.query.offset ?? 0))));
  router.get("/users/:id", wrap(async (req) => service.getUser(ctx(req), Number(req.params.id))));
  router.patch("/users/:id", wrap(async (req) =>
    service.updateUser(ctx(req), Number(req.params.id), req.body.patch ?? req.body, req.body.reason)));
  router.post("/users/:id/password", wrap(async (req) =>
    service.setUserPassword(ctx(req), Number(req.params.id), req.body.newPassword, req.body.reason)));
  router.post("/users/:id/ban", wrap(async (req) =>
    service.setBan(ctx(req), Number(req.params.id), true, req.body.reason)));
  router.post("/users/:id/unban", wrap(async (req) =>
    service.setBan(ctx(req), Number(req.params.id), false, req.body.reason ?? "unban")));
  router.post("/users/:id/notes", wrap(async (req) =>
    service.addNote(ctx(req), Number(req.params.id), req.body.note)));
  router.delete("/users/:id/notes/:noteId", wrap(async (req) =>
    service.deleteNote(ctx(req), Number(req.params.id), Number(req.params.noteId))));

  // entitlements
  router.get("/entitlements/kinds", wrap(async (req) => service.listEntitlementKinds(ctx(req))));
  router.put("/entitlements/kinds/:kind", wrap(async (req) =>
    service.upsertEntitlementKind(ctx(req), String(req.params.kind), req.body)));
  router.post("/entitlements/grant", wrap(async (req) =>
    service.grantEntitlement(ctx(req), Number(req.body.userId), String(req.body.kind), req.body.days ?? null, req.body.reason)));
  router.delete("/entitlements/:id", wrap(async (req) =>
    service.revokeEntitlement(ctx(req), Number(req.body.userId ?? req.query.userId), Number(req.params.id), req.body.reason)));

  // subscriptions
  router.get("/subscriptions", wrap(async (req) => service.listSubscriptions(ctx(req), Number(req.query.limit ?? 100))));
  router.post("/subscriptions/grant", wrap(async (req) =>
    service.grantSubscription(ctx(req), Number(req.body.userId), String(req.body.plan), Number(req.body.days ?? 30), req.body.reason)));
  router.post("/subscriptions/revoke", wrap(async (req) =>
    service.revokeSubscription(ctx(req), Number(req.body.userId), Number(req.body.subscriptionId), req.body.reason)));

  // catalog
  router.get("/catalog", wrap(async (req) => service.listCatalog(ctx(req), req.query.kind ? String(req.query.kind) : undefined)));
  router.put("/catalog/:kind/:entityId", wrap(async (req) =>
    service.upsertCatalogEntry(ctx(req), String(req.params.kind), Number(req.params.entityId), req.body.data, !!req.body.publish)));
  router.get("/catalog/drift", wrap(async (req) => service.catalogDrift(ctx(req))));
  router.get("/catalog/collections", wrap(async (req) => service.listCollections(ctx(req))));
  router.post("/catalog/collections", wrap(async (req) =>
    service.createCollection(ctx(req), req.body.name, req.body.nameHe, req.body.description)));
  router.post("/catalog/collections/:id/items", wrap(async (req) =>
    service.addCollectionItem(ctx(req), Number(req.params.id), String(req.body.entityKind), Number(req.body.entityId))));
  router.delete("/catalog/collections/:id/items/:entityKind/:entityId", wrap(async (req) =>
    service.removeCollectionItem(ctx(req), Number(req.params.id), String(req.params.entityKind), Number(req.params.entityId))));

  // codes & cards
  router.post("/codes/batch", wrap(async (req) => service.createBatch(ctx(req), req.body)));
  router.get("/codes/batches", wrap(async (req) => service.listBatches(ctx(req), Number(req.query.limit ?? 50))));
  router.get("/codes", wrap(async (req) =>
    service.listCodes(ctx(req), req.query.batchId ? Number(req.query.batchId) : undefined, Number(req.query.limit ?? 100))));
  router.post("/codes/redeem", wrap(async (req) =>
    service.redeemCode(ctx(req), req.body.code, Number(req.body.userId), req.body.reason)));
  router.post("/codes/revoke", wrap(async (req) => service.revokeCode(ctx(req), req.body.code, req.body.reason)));
  router.post("/codes/batch/:id/revoke", wrap(async (req) =>
    service.revokeBatch(ctx(req), Number(req.params.id), req.body.reason)));

  // audit
  router.get("/audit", wrap(async (req) => service.listAudit(ctx(req), req.query)));

  // SQL console
  router.post("/sql/check", wrap(async (req) =>
    service.checkSql(ctx(req), String(req.body.sql ?? ""), req.body.mode === "write" ? "write" : "read")));
  router.post("/sql/query", wrap(async (req) =>
    service.runSqlStatement(
      ctx(req),
      String(req.body.sql ?? ""),
      Array.isArray(req.body.params) ? req.body.params : [],
      req.body.mode === "write" ? "write" : "read",
      !!req.body.preview,
      req.body.reason,
    )));
  router.get("/sql/history", wrap(async (req) => service.sqlHistory(ctx(req), Number(req.query.limit ?? 100))));

  // admin users
  router.get("/admins", wrap(async (req) => service.listAdmins(ctx(req))));
  router.post("/admins", wrap(async (req) =>
    service.createAdmin(ctx(req), req.body.username, req.body.password, req.body.role)));
  router.patch("/admins/:id", wrap(async (req) =>
    service.updateAdmin(ctx(req), Number(req.params.id), req.body)));
  router.delete("/admins/:id", wrap(async (req) => service.deleteAdmin(ctx(req), Number(req.params.id))));

  return router;
}

export function mountAdmin(app: any, service: AdminService): void {
  app.set("trust proxy", 1);
  app.use("/admin/api", createSessionMiddleware());
  app.use("/admin/api", createAdminRouter(service));

  // Static bilingual dashboard (no build step).
  app.use("/admin", express.static(WEB_ROOT, { index: "index.html" }));
  app.get("/admin/*", (_req: Request, res: Response) => res.sendFile(path.join(WEB_ROOT, "index.html")));
}
