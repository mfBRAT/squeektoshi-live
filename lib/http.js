import { verifySession, readCookie } from "./session.js";
import { API } from "./config.js";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export const fail = (status, error) => json({ error }, status);

/** Blocks cross-site POSTs: the browser always sends Origin on fetch POSTs. */
export function sameOrigin(req) {
  const o = req.headers.get("origin");
  try { return !!o && new URL(o).host === new URL(req.url).host; } catch { return false; }
}

export const currentSession = (req) => verifySession(readCookie(req), process.env.SESSION_SECRET);

export async function fetchStatus() {
  const r = await fetch(API + "/status", { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("status HTTP " + r.status);
  return r.json();
}

export async function readBody(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return null;
  try { return await req.json(); } catch { return null; }
}
