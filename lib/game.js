// Pure game rules: no I/O, so they can be unit-tested directly.
import {
  GENESIS, ROUND_SECONDS, OUTCOMES, ZOOMIES_MIN, PICK_AHEAD, DAILY_CALLS,
  POINTS_MAX, DEFAULT_POINTS, POINTS_MIN_SAMPLE,
} from "./config.js";

/** Unix seconds when round `r` starts. Round 1 starts at genesis. */
export const roundStart = (r) => GENESIS + (r - 1) * ROUND_SECONDS;
/** The round in progress at unix second `t`. */
export const roundAt = (t) => Math.floor((t - GENESIS) / ROUND_SECONDS) + 1;

/** Settled work for one round -> outcome bucket. */
export function outcomeFor(work) {
  const w = Number(work);
  if (!Number.isFinite(w) || w < 0) throw new Error("bad work value");
  if (w === 0) return "nap";
  return w >= ZOOMIES_MIN ? "zoomies" : "jog";
}

const isoDay = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 10);
/** UTC day a round belongs to (the day it starts). Daily calls are counted per this day. */
export const roundDay = (r) => isoDay(roundStart(r));
/** Weekly season id: the Monday (UTC) of the week the round starts in. */
export function seasonOf(r) {
  const d = new Date(roundStart(r) * 1000);
  const back = (d.getUTCDay() + 6) % 7; // days since Monday
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) / 1000);
}

/** Rounds that can still be picked at unix second `now`: the next PICK_AHEAD, all not started yet. */
export function pickableRounds(now) {
  const cur = roundAt(now);
  return Array.from({ length: PICK_AHEAD }, (_, i) => cur + 1 + i);
}
export const canPick = (r, now) => Number.isInteger(r) && pickableRounds(now).includes(r);

/** Calls used on `day` by a player's picks map, not counting `exceptRound` (a re-pick is free). */
export function callsUsed(picks, day, exceptRound) {
  return Object.keys(picks || {}).filter((k) => Number(k) !== exceptRound && roundDay(Number(k)) === day).length;
}
export const callsLeft = (picks, day) => Math.max(0, DAILY_CALLS - callsUsed(picks, day));

/**
 * Points table: about 1 / how often each outcome happened, so a blind pick averages ~1 point.
 * `counts` is { nap, jog, zoomies } over the last 7 days of settled, non-void rounds.
 */
export function pointsFromCounts(counts) {
  const total = OUTCOMES.reduce((s, o) => s + (counts?.[o] || 0), 0);
  if (total < POINTS_MIN_SAMPLE) return { ...DEFAULT_POINTS };
  const out = {};
  for (const o of OUTCOMES) {
    const p = ((counts[o] || 0) + 1) / (total + OUTCOMES.length); // +1 so an unseen outcome isn't infinite
    out[o] = Math.min(POINTS_MAX, Math.max(1, Math.round(1 / p)));
  }
  return out;
}

/** Points one pick earns against a settled result. Void rounds score nothing for anyone. */
export function scorePick(pick, result) {
  if (!pick || !result || result.void) return 0;
  return pick.o === result.o ? pick.pts : 0;
}

/** Display handles: optional, unverified, X-style. */
export function cleanHandle(h) {
  if (h == null || h === "") return "";
  const s = String(h).trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}
