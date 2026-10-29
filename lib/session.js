// Stateless signed session cookie: base64url(JSON payload) + "." + HMAC-SHA256.
// The cookie has no Domain attribute, so only the exact host that set it (squeek.mfbrat.com) sees it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_DAYS } from "./config.js";

const b64 = (s) => Buffer.from(s).toString("base64url");
const mac = (data, secret) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSession(payload, secret) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  const body = b64(JSON.stringify(payload));
  return body + "." + mac(body, secret);
}

export function verifySession(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.addr || !p.exp || p.exp < nowSec) return null;
    return p;
  } catch { return null; }
}

export function readCookie(req, name = SESSION_COOKIE) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function sessionCookie(token, maxAgeSec = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export const clearCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
