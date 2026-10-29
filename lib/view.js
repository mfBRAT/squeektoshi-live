// Builds the one JSON payload the /play page needs.
import { GENESIS, ROUND_SECONDS, DEFAULT_POINTS, DAILY_CALLS, PICK_AHEAD, ZOOMIES_MIN } from "./config.js";
import { roundAt, roundStart, roundDay, seasonOf, pickableRounds, callsLeft, scorePick } from "./game.js";

const BOARD_SIZE = 25;
const HISTORY_ROUNDS = 24;

export function rankBoard(board, handles = {}) {
  return Object.entries(board?.players || {})
    .map(([addr, p]) => ({ addr, handle: handles[addr] || "", ...p }))
    .sort((a, b) => b.pts - a.pts || a.picks - b.picks || b.hits - a.hits || (a.addr < b.addr ? -1 : 1))
    .map((p, i) => ({ rank: i + 1, ...p }));
}

export async function gameView(store, now, addr) {
  const cur = roundAt(now);
  const get = (k) => store.get(k, { type: "json" });
  const season = seasonOf(cur);
  const [meta, pts, today, yday, board, handles] = await Promise.all([
    get("meta/state"), get("meta/points"), get(`results/${roundDay(cur)}`), get(`results/${roundDay(cur - 144)}`),
    get(`board/${season}`), get("meta/handles"),
  ]);
  const results = { ...(yday || {}), ...(today || {}) };
  const ranked = rankBoard(board, handles || {});

  const view = {
    now, genesis: GENESIS, roundSeconds: ROUND_SECONDS,
    rules: { dailyCalls: DAILY_CALLS, pickAhead: PICK_AHEAD, zoomiesMin: ZOOMIES_MIN },
    current: { round: cur, start: roundStart(cur), end: roundStart(cur + 1) },
    settledThrough: meta?.resolvedThrough || 0,
    lastRunAt: meta?.lastRunAt || null,
    // Offline rounds are only voided while the feed check is actually working (sampled in the last 20 min).
    voidCheck: !!meta?.lastFeedSampleAt && now - meta.lastFeedSampleAt < 1200,
    points: pts?.table || { ...DEFAULT_POINTS },
    pointsBasis: pts ? { n: pts.n, counts: pts.counts } : null,
    upcoming: pickableRounds(now).map((r) => ({ round: r, start: roundStart(r) })),
    recent: Object.entries(results).map(([r, x]) => ({ round: Number(r), ...x })).sort((a, b) => b.round - a.round).slice(0, 12),
    season, board: ranked.slice(0, BOARD_SIZE), players: ranked.length,
    me: null,
  };

  if (addr) {
    const player = (await get(`players/${addr}`)) || { handle: "", picks: {} };
    const days = [...new Set(view.upcoming.map((u) => roundDay(u.round)))];
    const mine = Object.entries(player.picks || {})
      .map(([r, p]) => ({ round: Number(r), ...p }))
      .filter((p) => p.round > cur - HISTORY_ROUNDS)
      .sort((a, b) => b.round - a.round)
      .map((p) => {
        const res = results[p.round];
        return res ? { ...p, result: res.o, void: res.void, earned: scorePick(p, res) } : { ...p, result: null };
      });
    const me = ranked.find((p) => p.addr === addr);
    view.me = {
      address: addr, handle: player.handle || "",
      callsLeft: Object.fromEntries(days.map((d) => [d, callsLeft(player.picks, d)])),
      picks: mine, season: me ? { rank: me.rank, pts: me.pts, hits: me.hits, picks: me.picks } : null,
    };
  }
  return view;
}
