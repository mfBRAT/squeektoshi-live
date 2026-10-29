// POST /api/pick { round, outcome } -> records or changes a pick for an upcoming round.
import { OUTCOMES, DAILY_CALLS, DEFAULT_POINTS } from "../../lib/config.js";
import { canPick, roundDay, callsUsed, roundAt } from "../../lib/game.js";
import { storeFor, updateJSON } from "../../lib/store.js";
import { gameView } from "../../lib/view.js";
import { json, fail, sameOrigin, readBody, currentSession } from "../../lib/http.js";

const KEEP_ROUNDS = 8 * 144; // keep ~8 days of picks on the player record

class LimitError extends Error {}

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  if (!sameOrigin(req)) return fail(403, "Bad origin");
  const s = currentSession(req);
  if (!s) return fail(401, "Sign in first");
  const body = await readBody(req);
  const round = Number(body?.round);
  const outcome = body?.outcome;
  if (!OUTCOMES.includes(outcome)) return fail(400, "Pick nap, jog or zoomies");
  const now = Math.floor(Date.now() / 1000);
  if (!canPick(round, now)) return fail(409, "That round is locked or too far ahead");

  const store = storeFor(req);
  const table = (await store.get("meta/points", { type: "json" }))?.table || DEFAULT_POINTS;
  const pick = { o: outcome, pts: table[outcome], at: now };
  const day = roundDay(round);
  try {
    await updateJSON(store, `players/${s.addr}`, (p) => {
      const player = p || { handle: "", picks: {} };
      const had = player.picks[round];
      if (had && had.o === outcome) return undefined; // nothing to change
      if (!had && callsUsed(player.picks, day, round) >= DAILY_CALLS) throw new LimitError();
      player.picks[round] = pick;
      const oldest = roundAt(now) - KEEP_ROUNDS;
      for (const r of Object.keys(player.picks)) if (Number(r) < oldest) delete player.picks[r];
      return player;
    });
  } catch (e) {
    if (e instanceof LimitError) return fail(429, `You've used all ${DAILY_CALLS} calls for ${day} (UTC)`);
    throw e;
  }
  // Re-check the lock after the write so a pick can't land once the round has started.
  if (!canPick(round, Math.floor(Date.now() / 1000))) return fail(409, "That round just locked");
  await store.setJSON(`picks/${round}/${s.addr}`, pick);
  return json(await gameView(store, Math.floor(Date.now() / 1000), s.addr));
};

export const config = { path: "/api/pick" };
