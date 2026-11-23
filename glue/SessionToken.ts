/**
 * Small signed token shared by the HTTP login route and the Ruffle WebSocket
 * bridge. The browser sets it as a cookie on successful HTTP auth; the WS
 * handshake carries it back, so the game socket inherits the right identity.
 */
import * as crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";

export function signSession(username: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${username}.${expiry}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifySession(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expiryRaw, sig] = parts;
  const expiry = Number(expiryRaw);
  if (!username || !Number.isFinite(expiry) || expiry < Date.now()) return null;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${username}.${expiryRaw}`)
    .digest("hex")
    .slice(0, 32);
  if (sig !== expected) return null;
  return username;
}

export function usernameFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== "ekoloko_user") continue;
    try {
      return verifySession(decodeURIComponent(part.slice(idx + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}
