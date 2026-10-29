// Fixed settings for Squeek or Sleep. Contract values were checked on-chain on 2026-10-29
// against the live Sepolia release (stream-game-sepolia-test-20261026-01).

export const CHAIN_ID = 11155111; // Sepolia
export const CORE = "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44"; // SqueekCore proxy
export const CORE_DEPLOY_BLOCK = 11998937n;
export const GENESIS = 1793022600; // SqueekCore configuration().genesisTimestamp (2026-10-26 13:50 UTC)
export const ROUND_SECONDS = 600; // configuration().roundDuration
export const CONFIRMATIONS = 12n; // match Squeekchain's public views

// Checked 2026-10-29: publicnode serves 5,000-block eth_getLogs but some of its servers have pruned
// older history; Tenderly's public gateway served every historical query; drpc's free plan refuses
// log queries but is a backup for simple reads. rpc.sepolia.org was timing out, so it's left out.
export const RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
  "https://sepolia.drpc.org",
];
export const API = "https://api.squeekchain.com/v1";

export const OUTCOMES = ["nap", "jog", "zoomies"];
export const ZOOMIES_MIN = 500; // passes in one round
export const PICK_AHEAD = 6; // you can pick the next 6 rounds (one hour)
export const DAILY_CALLS = 12; // picks per UTC day, counted by the day the round starts
export const POINTS_MAX = 25;
// Starting table, from the first 447 settled rounds: 84% nap, 7% jog, 9% zoomies.
export const DEFAULT_POINTS = Object.freeze({ nap: 1, jog: 15, zoomies: 11 });
export const POINTS_MIN_SAMPLE = 288; // need two days of rounds before replacing the table

export const SESSION_COOKIE = "sq_session";
export const SESSION_DAYS = 7;
export const NONCE_MINUTES = 10;
