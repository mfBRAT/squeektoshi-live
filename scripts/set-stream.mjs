// Sets (or clears) tonight's livestream on the game when Squeekchain's live descriptor is missing.
//   npm run stream -- https://x.com/i/broadcasts/1dGYlaqYqXNKX
//   npm run stream -- --clear
//   add --site https://<preview>.netlify.app to target a preview instead of the live game
// Reads ADMIN_KEY from .env; the key is never printed.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const site = (flag("--site") || "https://squeekorsleep.mfbrat.com").replace(/\/$/, "");
const clear = args.includes("--clear");
const url = args.find((a) => a.startsWith("https://"));
if (!clear && !url) { console.error("Usage: npm run stream -- <broadcast link> | --clear  [--site <url>]"); process.exit(1); }

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const key = (env.match(/^ADMIN_KEY=(.+)$/m) || [])[1]?.trim();
if (!key) { console.error("ADMIN_KEY missing from .env"); process.exit(1); }

const r = await fetch(site + "/api/admin/stream", {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-key": key },
  body: JSON.stringify(clear ? { clear: true } : { url }),
});
console.log(r.status, await r.text());
if (!r.ok) process.exit(1);
