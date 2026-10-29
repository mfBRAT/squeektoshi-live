# Squeektoshi Live 🐹🟦

A community-built static dashboard that answers **"Is Squeektoshi running right now?"** It also shows wheel RPM, total work, Squeek block height, difficulty, settlement round and SQK minted. It refreshes every 15 seconds.

This project is not affiliated with Squeekchain. It only uses the public read-only API and the public Sepolia contracts.

## Files
- `index.html`, `styles.css`, `app.js`: the whole site. There is no build step and there are no dependencies.
- `favicon.svg`: an original mark. The dot-matrix hamster is drawn in code and is not a copy of the Squeekchain logo.
- `netlify.toml`: publishes the root folder and sets security headers, including a CSP that allows only the API, Sepolia RPCs and Google Fonts. `vercel.json` is optional.
- `SUBMISSION.txt`: the answer for the Genesis "Submit project" form.

## Data
1. `https://api.squeekchain.com/v1/status` and `/v1/economy/state` (CORS `*`).
2. Fallback when the API fails: `SqueekCore.state()` (`0xc19d93fb`) and `SqueekToken.totalSupply()` over `ethereum-sepolia-rpc.publicnode.com`, with drpc and rpc.sepolia.org as backups. In this mode the live RPM can't be shown, so the banner reads "Can't tell".

Banner logic:
- **Running:** the data is fresh (`freshness=online` and observed within `staleAfterSeconds`) and either coreStatus is `ACTIVE` or the RPM is above 0.
- **Napping:** coreStatus is `IDLE`.
- **Offline:** the data is stale.
- **Unknown:** coreStatus is `COUNTER_FAULT`, or the API is unreachable.

## Ping SQK (testnet)
This button runs only when a visitor clicks it. It connects an injected wallet and switches to or adds Sepolia (`0xaa36a7`). Then it sends `approve(<own address>, 0)` to the SQK token, which moves no tokens and grants no allowance. The visitor needs Sepolia ETH for gas.

## Run locally
```
python3 -m http.server 8787   # open http://localhost:8787
```

## Deploy on Netlify at squeek.mfbrat.com
1. Netlify → Add new site → Deploy manually. Drag in this folder or the zip. You can also connect a Git repo, with publish directory `.` and no build command.
2. Site settings → Domain management → Add custom domain `squeek.mfbrat.com`.
3. At the DNS host for mfbrat.com, add `CNAME squeek → <your-site>.netlify.app`. Netlify then issues HTTPS automatically.
4. For the Squeekchain "Website" attribution route, add the TXT record that the Submit-project form gives you, at `_squeekchain.squeek.mfbrat.com`. Leave it in place, because it's rechecked daily.
