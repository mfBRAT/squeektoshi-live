// Netlify Blobs access. Production and previews use separate stores, so testing a preview
// never touches real picks or leaderboards.
import { getStore } from "@netlify/blobs";

const PROD_HOSTS = new Set(["squeekorsleep.mfbrat.com", "squeekorsleep.netlify.app"]);
export const PROD_STORE = "game";
export const storeNameFor = (host) => (PROD_HOSTS.has(host) ? PROD_STORE : "game-preview");
export const openStore = (name) => getStore({ name, consistency: "strong" });
export const storeFor = (req) => openStore(storeNameFor(new URL(req.url).host));

/**
 * Read-modify-write with an ETag check, retried on conflict.
 * `fn(current)` returns the new value, or `undefined` to leave the entry unchanged.
 * Resolves to { value, changed }.
 */
export async function updateJSON(store, key, fn, { tries = 6 } = {}) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const next = await fn(cur ? structuredClone(cur.data) : null);
    if (next === undefined) return { value: cur ? cur.data : null, changed: false };
    const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON(key, next, opts);
    if (res && res.modified) return { value: next, changed: true };
  }
  throw new Error("Busy, please try again");
}

/** In-memory store with the same calls we use, for unit tests. */
export function memoryStore() {
  const m = new Map();
  let n = 0;
  const copy = (v) => (v === undefined ? null : structuredClone(v));
  return {
    _map: m,
    async get(key) { return m.has(key) ? copy(m.get(key).data) : null; },
    async getWithMetadata(key) { return m.has(key) ? { data: copy(m.get(key).data), etag: m.get(key).etag, metadata: {} } : null; },
    async setJSON(key, data, opts = {}) {
      const cur = m.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${++n}"`;
      m.set(key, { data: structuredClone(data), etag });
      return { modified: true, etag };
    },
    async delete(key) { m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })) }; },
  };
}
