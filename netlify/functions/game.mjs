// GET /api/game -> everything the /play page shows; includes "me" when signed in.
import { storeFor } from "../../lib/store.js";
import { gameView } from "../../lib/view.js";
import { json, fail, currentSession } from "../../lib/http.js";

export default async (req) => {
  if (req.method !== "GET") return fail(405, "Method not allowed");
  const s = currentSession(req);
  return json(await gameView(storeFor(req), Math.floor(Date.now() / 1000), s?.addr || null));
};

export const config = { path: "/api/game" };
