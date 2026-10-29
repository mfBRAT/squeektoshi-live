import { test } from "node:test";
import assert from "node:assert/strict";
import { GENESIS, DAILY_CALLS, DEFAULT_POINTS } from "../lib/config.js";
import {
  roundStart, roundAt, outcomeFor, roundDay, seasonOf, pickableRounds, canPick,
  callsUsed, callsLeft, pointsFromCounts, scorePick, cleanHandle,
} from "../lib/game.js";
import { signSession, verifySession } from "../lib/session.js";

test("round clock matches the live contract", () => {
  assert.equal(roundStart(1), GENESIS);
  assert.equal(roundAt(GENESIS), 1);
  assert.equal(roundAt(GENESIS + 599), 1);
  assert.equal(roundAt(GENESIS + 600), 2); // a passage exactly at the end belongs to the next round
  // Observed on-chain 2026-10-29: round 448 was in progress at 16:25 UTC.
  assert.equal(roundAt(Date.parse("2026-10-29T16:25:00Z") / 1000), 448);
});

test("outcome buckets", () => {
  assert.equal(outcomeFor(0), "nap");
  assert.equal(outcomeFor(1), "jog");
  assert.equal(outcomeFor(499), "jog");
  assert.equal(outcomeFor(500), "zoomies");
  assert.equal(outcomeFor("699"), "zoomies");
  assert.throws(() => outcomeFor(-1));
});

test("seasons start Monday 00:00 UTC", () => {
  // 2026-11-01 is a Sunday, 2026-11-02 a Monday.
  const r = (iso) => roundAt(Date.parse(iso) / 1000);
  assert.equal(seasonOf(r("2026-11-01T23:55:00Z")), "2026-10-26");
  assert.equal(seasonOf(r("2026-11-02T00:05:00Z")), "2026-11-02");
});

test("only the next six rounds are pickable, and never the one in progress", () => {
  const now = roundStart(500) + 30; // 30s into round 500
  assert.deepEqual(pickableRounds(now), [501, 502, 503, 504, 505, 506]);
  assert.equal(canPick(500, now), false);
  assert.equal(canPick(507, now), false);
  assert.equal(canPick(501, now), true);
  assert.equal(canPick(501, roundStart(501)), false); // locks the second it starts
  assert.equal(canPick(501.5, now), false);
});

test("daily calls count per UTC day, and re-picking a round is free", () => {
  const day = roundDay(600);
  const picks = {};
  let r = 600;
  while (Object.keys(picks).length < DAILY_CALLS) { if (roundDay(r) === day) picks[r] = { o: "nap" }; r++; }
  assert.equal(callsLeft(picks, day), 0);
  assert.equal(callsUsed(picks, day, 600), DAILY_CALLS - 1); // changing round 600's pick doesn't need a new call
});

test("points: about 1/frequency, blind picks average ~1 point", () => {
  assert.deepEqual(pointsFromCounts({ nap: 10, jog: 1, zoomies: 1 }), { ...DEFAULT_POINTS }); // too little data
  const t = pointsFromCounts({ nap: 376, jog: 30, zoomies: 41 }); // the real first 447 rounds
  assert.deepEqual(t, { nap: 1, jog: 15, zoomies: 11 });
  const never = pointsFromCounts({ nap: 300, jog: 0, zoomies: 0 });
  assert.equal(never.jog, 25); // capped
});

test("scoring", () => {
  assert.equal(scorePick({ o: "jog", pts: 15 }, { o: "jog" }), 15);
  assert.equal(scorePick({ o: "jog", pts: 15 }, { o: "nap" }), 0);
  assert.equal(scorePick({ o: "nap", pts: 1 }, { o: "nap", void: true }), 0);
});

test("handles", () => {
  assert.equal(cleanHandle("@mfBRAT_eth"), "mfBRAT_eth");
  assert.equal(cleanHandle(""), "");
  assert.equal(cleanHandle("<script>"), null);
  assert.equal(cleanHandle("a".repeat(16)), null);
});

test("session cookie signing", () => {
  const secret = "x".repeat(40);
  const tok = signSession({ addr: "0xabc", exp: 2000 }, secret);
  assert.deepEqual(verifySession(tok, secret, 1000), { addr: "0xabc", exp: 2000 });
  assert.equal(verifySession(tok, secret, 3000), null); // expired
  assert.equal(verifySession(tok, "y".repeat(40), 1000), null); // wrong secret
  const [body, sig] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ addr: "0xevil", exp: 2000 })).toString("base64url") + "." + sig;
  assert.equal(verifySession(forged, secret, 1000), null);
  assert.equal(verifySession(body, secret, 1000), null);
  assert.throws(() => signSession({ addr: "a", exp: 1 }, "short"));
});
