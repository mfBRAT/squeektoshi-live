// POST /api/admin/resolve with header x-admin-key -> runs the resolver now against this
// environment's store. Used to test previews (scheduled functions don't run there) and for reruns.
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "../../lib/resolver.js";
import { storeFor } from "../../lib/store.js";
import { makeChain } from "../../lib/chain.js";
import { json, fail, fetchStatus } from "../../lib/http.js";

const digest = (s) => createHash("sha256").update(String(s)).digest();

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  const want = process.env.ADMIN_KEY;
  const got = req.headers.get("x-admin-key");
  if (!want || want.length < 32 || !got || !timingSafeEqual(digest(want), digest(got))) return fail(404, "Not found");
  return json(await resolve({ store: storeFor(req), chain: makeChain(), fetchStatus }));
};

export const config = { path: "/api/admin/resolve" };
