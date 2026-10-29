// POST /api/admin/stream with header x-admin-key and JSON body:
//   { "url": "https://x.com/i/broadcasts/…", "hours": 12 }  -> embed that broadcast until it expires
//   { "clear": true }                                        -> remove the override
// Used on nights Squeekchain's live descriptor is missing. Wrong key -> 404.
import { createHash, timingSafeEqual } from "node:crypto";
import { storeFor } from "../../lib/store.js";
import { json, fail, readBody } from "../../lib/http.js";
import { OVERRIDE_KEY, OVERRIDE_HOURS, parseStreamUrl } from "../../lib/stream.js";

const digest = (s) => createHash("sha256").update(String(s)).digest();

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  const want = process.env.ADMIN_KEY;
  const got = req.headers.get("x-admin-key");
  if (!want || want.length < 32 || !got || !timingSafeEqual(digest(want), digest(got))) return fail(404, "Not found");

  const body = await readBody(req);
  if (!body) return fail(400, "Send JSON");
  const store = storeFor(req);
  if (body.clear === true) { await store.delete(OVERRIDE_KEY); return json({ cleared: true }); }

  const parsed = parseStreamUrl(body.url);
  if (!parsed) return fail(400, "Not an X broadcast, YouTube or Twitch link");
  const hours = Math.min(24, Math.max(1, Number(body.hours) || OVERRIDE_HOURS));
  const until = Date.now() + hours * 3600_000;
  await store.setJSON(OVERRIDE_KEY, { ...parsed, until, setAt: Date.now() });
  return json({ set: parsed, until: new Date(until).toISOString() });
};

export const config = { path: "/api/admin/stream" };
