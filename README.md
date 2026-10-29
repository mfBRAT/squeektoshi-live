# squeektoshi-live

Source for two separate Netlify sites. Neither is part of mfbrat.com.

| Site | Domain | Netlify site | Folder |
|---|---|---|---|
| **Squeek or Sleep** (the game) | https://squeekorsleep.mfbrat.com | `squeekorsleep` (`ed7a59a5-9b8a-40ac-89a9-73f1f7c3a4d0`) | repo root: `public/`, `netlify/functions/`, `lib/` |
| **Squeektoshi Live** (the dashboard) | https://squeek.mfbrat.com | `squeektoshi-live` (`3e763fc0-a63f-4f12-a5d1-9076e46d6be2`) | `dashboard/` (static, no functions) |

`squeek.mfbrat.com/play` and `/play/*` redirect (301) to `https://squeekorsleep.mfbrat.com/`.

## How the game works
- Players sign in with Sign-In with Ethereum (a free signed message, no transaction) and get an HttpOnly session cookie for this host only.
- They call 💤 nap (0 passes), 🐾 jog (1–499) or 🔥 zoomies (500+) for any of the next 6 ten-minute rounds, with 12 calls per UTC day. Each call locks when its round starts.
- `netlify/functions/resolve.mjs` runs every 5 minutes on production. It reads `RoundRecorded` and `BatchSettled` events from SqueekCore on Sepolia (12 confirmations) and scores picks into weekly and all-time boards. Results never come from the Squeekchain API.
- Points are about 1 ÷ how often each outcome happened, recalculated each Monday from the last 7 days.
- Data lives in Netlify Blobs on the game site: store `game` for production (squeekorsleep.mfbrat.com, squeekorsleep.netlify.app) and `game-preview` for every preview deploy. Layout notes are at the top of `lib/resolver.js`.

## Known limits
- Squeekchain's API returns 403 to Netlify's servers, so the "void a round if the feed was offline" check can't sample from here. The page says offline checks are paused, and every settled round counts.
- Wallet sign-ins are free, so one person could run many wallets. The daily call limit and weekly totals reduce the effect but don't stop it.

## Develop and deploy
```bash
npm install
npm test
npm run preview:game        # private preview of the game
npm run deploy:game         # tests, then the game goes live
npm run preview:dashboard   # private preview of the dashboard
npm run deploy:dashboard    # the dashboard goes live
```
Use the scripts; don't run `netlify deploy` by hand:
- `~/.netlify/state.json` in the home folder links to **mfbrat.com**, so the scripts always pass `--site`.
- The Netlify CLI treats the git root as the base folder, so a plain deploy from `dashboard/` would publish the game. The dashboard scripts pass `--dir` and an empty `--functions` folder.

Game secrets (`SESSION_SECRET`, `ADMIN_KEY`) are set on the game site and copied in `.env` (git-ignored). To run the resolver by hand:
```bash
curl -X POST -H "x-admin-key: $ADMIN_KEY" https://squeekorsleep.mfbrat.com/api/admin/resolve
```

## Protected DNS
These Squeekchain attribution TXT records must never be removed:
- `_squeekchain.squeek.mfbrat.com` (dashboard)
- `_squeekchain.squeekorsleep.mfbrat.com` (game)
