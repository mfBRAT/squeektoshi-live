// Scheduled every 5 minutes (runs on the published production deploy only).
import { resolve } from "../../lib/resolver.js";
import { openStore, PROD_STORE } from "../../lib/store.js";
import { makeChain } from "../../lib/chain.js";
import { fetchStatus } from "../../lib/http.js";

export default async () => {
  const summary = await resolve({ store: openStore(PROD_STORE), chain: makeChain(), fetchStatus });
  console.log("resolve", JSON.stringify(summary));
};

export const config = { schedule: "*/5 * * * *" };
