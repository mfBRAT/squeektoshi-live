import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE_DEPLOY_BLOCK } from "../lib/config.js";
import { roundStart, seasonOf, roundDay } from "../lib/game.js";
import { resolve, feedOnline } from "../lib/resolver.js";
import { memoryStore } from "../lib/store.js";
import { gameView } from "../lib/view.js";

// A fake chain: settlement batches placed at block numbers.
function fakeChain() {
  const logs = []; // { block, name, args, tx }
  let head = CORE_DEPLOY_BLOCK + 10n;
  return {
    setHead(b) { head = b; },
    settle(block, prev, through, active = {}) {
      for (const [r, w] of Object.entries(active)) logs.push({ block, name: "RoundRecorded", args: { roundId: BigInt(r), work: BigInt(w) }, tx: `0xrr${r}` });
      logs.push({ block, name: "BatchSettled", args: { previousSettledThroughRound: BigInt(prev), settledThroughRound: BigInt(through) }, tx: `0xbatch${through}` });
    },
    async safeHead() { return head; },
    async logs(from, to) { return logs.filter((l) => l.block >= from && l.block <= to); },
  };
}
const online = async () => ({ measurement: { freshness: "online", observedAt: new Date().toISOString(), staleAfterSeconds: 120 } });
const offline = async () => ({ measurement: { freshness: "stale", observedAt: "2026-01-01T00:00:00Z", staleAfterSeconds: 120 } });

test("feed freshness", () => {
  const now = Date.parse("2026-10-29T16:00:00Z") / 1000;
  assert.equal(feedOnline({ measurement: { freshness: "online", observedAt: "2026-10-29T15:59:30Z", staleAfterSeconds: 120 } }, now), true);
  assert.equal(feedOnline({ measurement: { freshness: "online", observedAt: "2026-10-29T15:50:00Z", staleAfterSeconds: 120 } }, now), false);
  assert.equal(feedOnline({ measurement: { freshness: "offline", observedAt: "2026-10-29T15:59:59Z" } }, now), false);
  assert.equal(feedOnline(null, now), false);
});

test("backfill: zero-work rounds inside a batch are naps, listed rounds keep their work", async () => {
  const store = memoryStore(), chain = fakeChain();
  chain.settle(CORE_DEPLOY_BLOCK + 2n, 0, 3, { 2: 120 });
  chain.settle(CORE_DEPLOY_BLOCK + 5n, 3, 5, { 5: 640 });
  const s = await resolve({ store, chain, fetchStatus: online, now: roundStart(10) + 5 });
  assert.equal(s.newRounds, 5);
  const day = await store.get(`results/${roundDay(1)}`);
  assert.deepEqual([1, 2, 3, 4, 5].map((r) => day[r].o), ["nap", "jog", "nap", "nap", "zoomies"]);
  assert.equal(day[2].tx, "0xrr2");
  assert.equal(day[3].tx, "0xbatch3"); // nap proven by the batch that certified it
  assert.equal((await store.get("meta/state")).resolvedThrough, 5);
});

test("picks are scored once, voided rounds score nothing, re-runs change nothing", async () => {
  const store = memoryStore(), chain = fakeChain();
  const start = 20;
  // First run starts the game at round `start`.
  chain.settle(CORE_DEPLOY_BLOCK + 1n, 0, start - 1);
  await resolve({ store, chain, fetchStatus: online, now: roundStart(start) + 10 });

  const A = "0xaaaa", B = "0xbbbb";
  await store.setJSON(`picks/${start}/${A}`, { o: "zoomies", pts: 11, at: 1 });
  await store.setJSON(`picks/${start}/${B}`, { o: "nap", pts: 1, at: 1 });
  await store.setJSON(`picks/${start + 1}/${A}`, { o: "nap", pts: 1, at: 1 });
  await store.setJSON(`picks/${start + 1}/${B}`, { o: "nap", pts: 1, at: 1 });
  // The pick endpoint also keeps each player's own record; mirror that.
  await store.setJSON(`players/${A}`, { handle: "", picks: { [start]: { o: "zoomies", pts: 11, at: 1 }, [start + 1]: { o: "nap", pts: 1, at: 1 } } });

  // Round start+1 is seen offline -> void.
  await resolve({ store, chain, fetchStatus: offline, now: roundStart(start + 1) + 10 });
  chain.settle(CORE_DEPLOY_BLOCK + 15n, start - 1, start + 1, { [start]: 650 }); // after the head already scanned
  chain.setHead(CORE_DEPLOY_BLOCK + 20n);
  const s = await resolve({ store, chain, fetchStatus: online, now: roundStart(start + 3) + 10 });
  assert.equal(s.newRounds, 2);
  assert.equal(s.scoredPicks, 4);

  const board = await store.get(`board/${seasonOf(start)}`);
  assert.deepEqual(board.players[A], { pts: 11, hits: 1, picks: 2 });
  assert.deepEqual(board.players[B], { pts: 0, hits: 0, picks: 2 }); // B's nap on the void round earns nothing
  const all = await store.get("board/all");
  assert.equal(all.players[A].pts, 11);

  // Simulate a crash before meta was saved: roll meta back and run again. Boards must not double.
  const meta = await store.get("meta/state");
  await store.setJSON("meta/state", { ...meta, cursorBlock: String(CORE_DEPLOY_BLOCK + 1n), resolvedThrough: start - 1 });
  await resolve({ store, chain, fetchStatus: online, now: roundStart(start + 3) + 20 });
  assert.equal((await store.get(`board/${seasonOf(start)}`)).players[A].pts, 11);
  assert.equal((await store.get("board/all")).players[A].pts, 11);

  // The view shows the results and ranks A first.
  const v = await gameView(store, roundStart(start + 3) + 30, A);
  assert.equal(v.board[0].addr, A);
  assert.equal(v.me.season.rank, 1);
  const p = v.me.picks.find((x) => x.round === start);
  assert.equal(p.earned, 11);
  assert.equal(v.me.picks.find((x) => x.round === start + 1).void, true);
});

test("expired nonces are cleaned up", async () => {
  const store = memoryStore(), chain = fakeChain();
  const now = roundStart(50);
  await store.setJSON(`nonces/${now - 1}-old`, { addr: "0x1" });
  await store.setJSON(`nonces/${now + 600}-new`, { addr: "0x1" });
  await resolve({ store, chain, fetchStatus: online, now });
  assert.equal(await store.get(`nonces/${now - 1}-old`), null);
  assert.ok(await store.get(`nonces/${now + 600}-new`));
});
