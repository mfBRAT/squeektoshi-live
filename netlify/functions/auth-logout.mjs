// POST /api/auth/logout -> clears the session cookie.
import { clearCookie } from "../../lib/session.js";
import { json, fail, sameOrigin } from "../../lib/http.js";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  if (!sameOrigin(req)) return fail(403, "Bad origin");
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
};

export const config = { path: "/api/auth/logout" };
