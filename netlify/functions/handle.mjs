// POST /api/handle { handle } -> optional display name (shown as unverified).
import { cleanHandle } from "../../lib/game.js";
import { storeFor, updateJSON } from "../../lib/store.js";
import { json, fail, sameOrigin, readBody, currentSession } from "../../lib/http.js";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  if (!sameOrigin(req)) return fail(403, "Bad origin");
  const s = currentSession(req);
  if (!s) return fail(401, "Sign in first");
  const handle = cleanHandle((await readBody(req))?.handle);
  if (handle === null) return fail(400, "Use 1-15 letters, numbers or _");

  const store = storeFor(req);
  await updateJSON(store, `players/${s.addr}`, (p) => ({ ...(p || { picks: {} }), handle }));
  await updateJSON(store, "meta/handles", (h) => {
    const map = { ...(h || {}) };
    if (handle) map[s.addr] = handle; else delete map[s.addr];
    return map;
  });
  return json({ handle });
};

export const config = { path: "/api/handle" };
