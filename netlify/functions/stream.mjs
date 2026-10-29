// GET /api/stream -> the livestream to embed right now, or { live: false }.
import { storeFor } from "../../lib/store.js";
import { json, fail } from "../../lib/http.js";
import { DESCRIPTOR_URL, OVERRIDE_KEY, chooseStream } from "../../lib/stream.js";

async function readDescriptor() {
  try {
    const r = await fetch(DESCRIPTOR_URL, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export default async (req) => {
  if (req.method !== "GET") return fail(405, "Method not allowed");
  const [descriptor, override] = await Promise.all([
    readDescriptor(),
    storeFor(req).get(OVERRIDE_KEY, { type: "json" }).catch(() => null),
  ]);
  const out = chooseStream({ descriptor, override, nowMs: Date.now(), host: new URL(req.url).hostname });
  // Public, read-only data: the dashboard (squeek.mfbrat.com) reads it cross-site.
  return json(out, 200, { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" });
};

export const config = { path: "/api/stream" };
