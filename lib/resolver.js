// Runs every 5 minutes. Safe to re-run: every write is keyed so nothing is counted twice.
//
// Store layout (one Netlify Blobs store per environment):
//   meta/state            { cursorBlock, resolvedThrough, sampleSince, lastRunAt }
//   meta/points           { table, season, counts, n, at }
//   observed/<round>      [{ t, online }]  live-feed samples taken during that round
//   results/<YYYY-MM-DD>  { <round>: { w, o, tx, void } }  settled outcomes, by UTC day
//   picks/<round>/<addr>  { o, pts, at }   one pick
//   players/<addr>        { handle, picks: { <round>: { o, pts, at } } }
//   board/<season>|all    { through, players: { <addr>: { pts, hits, picks } } }
//   nonces/<exp>-<rand>   sign-in nonces (expired ones are deleted here)
import { CORE_DEPLOY_BLOCK, ROUND_SECONDS } from "./config.js";
import { roundAt, roundDay, seasonOf, outcomeFor, pointsFromCounts, scorePick } from "./game.js";
import { updateJSON } from "./store.js";

const LOG_SPAN = 5000n; // blocks per getLogs call
const MAX_LOG_CALLS = 10; // per run; a long backlog catches up over several runs
const WEEK_ROUNDS = (7 * 86400) / ROUND_SECONDS;

/** Is the live wheel feed fresh right now? null = couldn't tell (our fetch failed). */
export function feedOnline(status, now) {
  const m = status?.measurement;
  if (!m || !m.observedAt) return false;
  const age = now - Date.parse(m.observedAt) / 1000;
  return m.freshness === "online" && age <= (m.staleAfterSeconds || 120);
}

export async function resolve({ store, chain, fetchStatus, now = Math.floor(Date.now() / 1000) }) {
  const summary = { now, newRounds: 0, scoredPicks: 0 };
  const cur = roundAt(now);

  // 1. Sample the live feed for the round in progress.
  let online = null;
  try { online = feedOnline(await fetchStatus(), now); } catch (e) { online = null; summary.feedError = String(e?.message || e).slice(0, 200); }
  await updateJSON(store, `observed/${cur}`, (s) => [...(s || []), { t: now, online }]);
  summary.online = online;

  const { value: meta } = await updateJSON(store, "meta/state", (m) =>
    m ? undefined : { cursorBlock: String(CORE_DEPLOY_BLOCK - 1n), resolvedThrough: 0, sampleSince: cur });

  // 2. Read settled rounds from the chain, up to the confirmed head.
  const head = await chain.safeHead();
  let from = BigInt(meta.cursorBlock) + 1n;
  let reached = from - 1n;
  const recorded = new Map(); // round -> { w, tx }
  const batches = [];
  for (let calls = 0; from <= head && calls < MAX_LOG_CALLS; calls++) {
    const to = from + LOG_SPAN - 1n < head ? from + LOG_SPAN - 1n : head;
    for (const l of await chain.logs(from, to)) {
      if (l.name === "RoundRecorded") recorded.set(Number(l.args.roundId), { w: Number(l.args.work), tx: l.tx });
      else if (l.name === "BatchSettled") batches.push({ prev: Number(l.args.previousSettledThroughRound), through: Number(l.args.settledThroughRound), tx: l.tx });
    }
    reached = to;
    from = to + 1n;
  }

  // A batch settles every round in (prev, through]; rounds it doesn't list explicitly had zero work.
  const fresh = [];
  for (const b of batches) {
    for (let r = Math.max(b.prev, meta.resolvedThrough) + 1; r <= b.through; r++) {
      const rec = recorded.get(r);
      fresh.push({ r, w: rec ? rec.w : 0, tx: rec ? rec.tx : b.tx });
    }
  }
  fresh.sort((a, b) => a.r - b.r);

  // Void any round in which we saw the feed offline (only rounds since the game started sampling).
  const results = [];
  for (const f of fresh) {
    let isVoid = false;
    if (f.r >= meta.sampleSince) {
      const samples = (await store.get(`observed/${f.r}`, { type: "json" })) || [];
      isVoid = samples.some((s) => s.online === false);
    }
    results.push({ r: f.r, w: f.w, o: outcomeFor(f.w), tx: f.tx, void: isVoid });
  }

  // 3. Save results by UTC day (merging is idempotent).
  const byDay = new Map();
  for (const x of results) {
    const d = roundDay(x.r);
    if (!byDay.has(d)) byDay.set(d, {});
    byDay.get(d)[x.r] = { w: x.w, o: x.o, tx: x.tx, void: x.void };
  }
  for (const [d, add] of byDay) await updateJSON(store, `results/${d}`, (doc) => ({ ...(doc || {}), ...add }));

  // 4. Score picks into the weekly and all-time boards. `through` stops double counting.
  const deltas = new Map(); // boardKey -> { through, players: {addr: {pts,hits,picks}} }
  const bump = (key, r, addr, pts, hit) => {
    if (!deltas.has(key)) deltas.set(key, { through: 0, players: {} });
    const d = deltas.get(key);
    d.through = Math.max(d.through, r);
    if (!addr) return;
    const p = (d.players[addr] ||= { pts: 0, hits: 0, picks: 0 });
    p.pts += pts; p.picks += 1; if (hit) p.hits += 1;
  };
  for (const x of results) {
    bump("board/all", x.r); bump(`board/${seasonOf(x.r)}`, x.r);
    if (x.r < meta.sampleSince) continue; // no picks existed before the game started
    const { blobs } = await store.list({ prefix: `picks/${x.r}/` });
    for (const { key } of blobs) {
      const pick = await store.get(key, { type: "json" });
      if (!pick) continue;
      const addr = key.split("/")[2];
      const pts = scorePick(pick, x);
      bump("board/all", x.r, addr, pts, pts > 0); bump(`board/${seasonOf(x.r)}`, x.r, addr, pts, pts > 0);
      summary.scoredPicks++;
    }
  }
  for (const [key, d] of deltas) {
    await updateJSON(store, key, (board) => {
      const b = board || { through: 0, players: {} };
      if (d.through <= b.through) return undefined; // already counted
      for (const [addr, p] of Object.entries(d.players)) {
        const e = (b.players[addr] ||= { pts: 0, hits: 0, picks: 0 });
        e.pts += p.pts; e.hits += p.hits; e.picks += p.picks;
      }
      b.through = d.through;
      return b;
    });
  }

  const resolvedThrough = results.length ? results[results.length - 1].r : meta.resolvedThrough;
  await updateJSON(store, "meta/state", (m) => ({
    ...m, cursorBlock: String(reached), resolvedThrough: Math.max(m.resolvedThrough, resolvedThrough), lastRunAt: now,
    ...(online !== null ? { lastFeedSampleAt: now } : {}), // the page only promises voiding while sampling works
  }));
  summary.newRounds = results.length;
  summary.resolvedThrough = resolvedThrough;
  summary.caughtUp = reached >= head;

  // 5. Points table: recalculated once per season (week) from the last 7 days of settled rounds.
  const season = seasonOf(cur);
  const pts = await store.get("meta/points", { type: "json" });
  if (!pts || pts.season !== season) {
    const counts = { nap: 0, jog: 0, zoomies: 0 };
    const lo = Math.max(1, resolvedThrough - WEEK_ROUNDS + 1);
    const days = new Set();
    for (let r = lo; r <= resolvedThrough; r += 144) days.add(roundDay(r));
    if (resolvedThrough) days.add(roundDay(resolvedThrough));
    for (const d of days) {
      const doc = (await store.get(`results/${d}`, { type: "json" })) || {};
      for (const [r, x] of Object.entries(doc)) if (Number(r) >= lo && Number(r) <= resolvedThrough && !x.void) counts[x.o]++;
    }
    const n = counts.nap + counts.jog + counts.zoomies;
    await store.setJSON("meta/points", { table: pointsFromCounts(counts), season, counts, n, at: now });
    summary.points = "recalculated";
  }

  // 6. Delete expired sign-in nonces (key starts with the expiry time).
  const { blobs: nonces } = await store.list({ prefix: "nonces/" });
  for (const { key } of nonces) if (Number(key.slice(7).split("-")[0]) < now) await store.delete(key);

  return summary;
}
