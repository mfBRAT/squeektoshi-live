# squeektoshi-live

Source for **https://squeek.mfbrat.com**, a separate Netlify site (`squeektoshi-live`, id `3e763fc0-a63f-4f12-a5d1-9076e46d6be2`). It is not part of mfbrat.com.

- `/`: Squeektoshi Live, the static dashboard (`public/index.html`, `app.js`, `styles.css`).
- `/play/`: **Squeek or Sleep**, the prediction game (`public/play/`).
- `netlify/functions/`: the game's API and the resolver that runs every 5 minutes.
- `lib/`: shared game logic (rules, scoring, storage, chain reads).

Only `public/` is published. Server code and `node_modules` are never served.

## How the game works
- Players sign in with Sign-In with Ethereum (a free signed message, no transaction) and get an HttpOnly session cookie for this host only.
- They call 💤 nap (0 passes), 🐾 jog (1–499) or 🔥 zoomies (500+) for any of the next 6 ten-minute rounds, with 12 calls per UTC day. Each call locks when its round starts.
- `netlify/functions/resolve.mjs` runs every 5 minutes on production. It reads `RoundRecorded` and `BatchSettled` events from SqueekCore on Sepolia (12 confirmations) and scores picks into weekly and all-time boards. Results never come from the Squeekchain API.
- Points are about 1 ÷ how often each outcome happened, recalculated each Monday from the last 7 days.
- Data lives in Netlify Blobs: store `game` for production and `game-preview` for every preview deploy. Layout notes are at the top of `lib/resolver.js`.

## Known limits
- Squeekchain's API returns 403 to Netlify's servers, so the "void a round if the feed was offline" check can't sample from here. The page says offline checks are paused, and every settled round counts.
- Wallet sign-ins are free, so one person could run many wallets. The daily call limit and weekly totals reduce the effect but don't stop it.

## Develop and deploy
```bash
npm install
npm test
```
`~/.netlify/state.json` in the home folder links to **mfbrat.com**. This folder has its own `.netlify/state.json`, but always pass `--site` anyway:
```bash
netlify deploy --no-build --site 3e763fc0-a63f-4f12-a5d1-9076e46d6be2           # private preview
netlify deploy --no-build --prod --site 3e763fc0-a63f-4f12-a5d1-9076e46d6be2    # live
```
Secrets (`SESSION_SECRET`, `ADMIN_KEY`) are set on the Netlify site and copied in `.env` (git-ignored). To run the resolver by hand on any deploy:
```bash
curl -X POST -H "x-admin-key: $ADMIN_KEY" https://<deploy-host>/api/admin/resolve
```

## Protected DNS
The Squeekchain attribution TXT record at `_squeekchain.squeek.mfbrat.com` must never be removed.
