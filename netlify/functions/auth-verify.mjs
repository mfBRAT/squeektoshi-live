// POST /api/auth/verify { message, signature } -> sets the session cookie.
import { parseSiweMessage } from "viem/siwe";
import { CHAIN_ID, SESSION_DAYS } from "../../lib/config.js";
import { storeFor } from "../../lib/store.js";
import { publicClient } from "../../lib/chain.js";
import { signSession, sessionCookie } from "../../lib/session.js";
import { json, fail, sameOrigin, readBody } from "../../lib/http.js";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  if (!sameOrigin(req)) return fail(403, "Bad origin");
  const body = await readBody(req);
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!message || !/^0x[0-9a-fA-F]+$/.test(signature)) return fail(400, "Missing message or signature");

  const url = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);
  const m = parseSiweMessage(message);
  if (m.domain !== url.host || m.uri !== url.origin || m.chainId !== CHAIN_ID || !m.nonce || !m.address || !m.expirationTime)
    return fail(400, "This sign-in message isn't for this site");
  const exp = Math.floor(m.expirationTime.getTime() / 1000);
  if (exp < now) return fail(400, "Sign-in expired, try again");

  // Nonces are single use: look up, then delete before checking the signature.
  const store = storeFor(req);
  const key = `nonces/${exp}-${m.nonce}`;
  const rec = await store.get(key, { type: "json" });
  if (!rec || rec.addr !== m.address.toLowerCase()) return fail(400, "Sign-in expired, try again");
  await store.delete(key);

  let ok = false;
  try {
    ok = await publicClient().verifySiweMessage({ message, signature, domain: url.host, nonce: m.nonce, time: new Date() });
  } catch { ok = false; }
  if (!ok) return fail(401, "Signature didn't match this wallet");

  const addr = m.address.toLowerCase();
  const token = signSession({ addr, exp: now + SESSION_DAYS * 86400 }, process.env.SESSION_SECRET);
  return json({ address: addr }, 200, { "set-cookie": sessionCookie(token) });
};

export const config = { path: "/api/auth/verify" };
