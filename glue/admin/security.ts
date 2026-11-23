import * as crypto from "crypto";
import session from "express-session";

// ── password hashing (scrypt, no external dependency) ─────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) {
    const [, salt, derived] = stored.split("$");
    if (!salt || !derived) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(derived, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  // Legacy MD5 (seeded dev accounts only). Never create new ones.
  if (/^[a-f0-9]{32}$/i.test(stored)) {
    const md5 = crypto.createHash("md5").update(password).digest("hex");
    return md5 === stored.toLowerCase();
  }
  return false;
}

// ── TOTP (RFC 6238, SHA-256, 30 s, 6 digits) ─────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpUri(secret: string, username: string, issuer = "Ekoloko"): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA256",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function totpAt(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha256", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let delta = -1; delta <= 1; delta++) {
    const expected = totpAt(secret, counter + delta);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
  }
  return false;
}

// ── encryption for TOTP secrets at rest ──────────────────────────────────

function encKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc$${iv.toString("base64")}$${tag.toString("base64")}$${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc$")) return stored; // legacy plain secret
  const [, ivB64, tagB64, dataB64] = stored.split("$");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ── IP allowlist ─────────────────────────────────────────────────────────

export function clientIp(req: any): string {
  const forwarded = String(req.headers?.["x-forwarded-for"] ?? "");
  return (forwarded.split(",")[0] || req.socket?.remoteAddress || "unknown").trim();
}

export function ipAllowed(req: any): boolean {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? "";
  if (!raw.trim()) return true;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = clientIp(req);
  return allowed.includes(ip);
}

// ── Redis-backed sessions ────────────────────────────────────────────────

class RedisSessionStore extends session.Store {
  private redis: any;
  private prefix = "ekadmin:sess:";

  constructor(url: string) {
    super();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis") as any;
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
    this.redis.on("error", (err: Error) => console.error("[admin][redis]", err.message));
  }

  private key(sid: string): string {
    return this.prefix + sid;
  }

  get(sid: string, callback: (err: any, session?: any) => void): void {
    this.redis
      .get(this.key(sid))
      .then((raw: string | null) => callback(null, raw ? JSON.parse(raw) : null))
      .catch(callback);
  }

  set(sid: string, data: any, callback?: (err?: any) => void): void {
    const ttl = Math.max(1, Math.floor((data.cookie?.maxAge ?? 86_400_000) / 1000));
    this.redis
      .set(this.key(sid), JSON.stringify(data), "EX", ttl)
      .then(() => callback?.())
      .catch(callback);
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.redis
      .del(this.key(sid))
      .then(() => callback?.())
      .catch(callback);
  }

  touch(sid: string, data: any, callback?: (err?: any) => void): void {
    this.set(sid, data, callback);
  }
}

export function createSessionMiddleware(): any {
  const redisUrl = process.env.REDIS_URL;
  const store = redisUrl ? new RedisSessionStore(redisUrl) : undefined;
  if (!redisUrl) console.warn("[admin] REDIS_URL not set — using in-memory sessions (dev only)");
  const isProd = process.env.NODE_ENV === "production";
  return session({
    name: "ekadmin_sid",
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/admin",
    },
  });
}

export function requireTotpForWrites(): boolean {
  return process.env.ADMIN_REQUIRE_TOTP !== "false";
}
