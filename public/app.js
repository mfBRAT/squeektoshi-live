/* Squeektoshi Live: community-built, not affiliated with Squeekchain. No build step, no dependencies. */
(() => {
  "use strict";
  const API = "https://api.squeekchain.com/v1";
  const RPCS = ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.drpc.org", "https://rpc.sepolia.org"];
  const CHAIN_ID_HEX = "0xaa36a7"; // Sepolia 11155111
  // Fixed contract addresses (Sepolia release stream-game-sepolia-test-20261026-01, checked on-chain 2026-10-29).
  // Never taken from the API: the docs say API data is for display only and must not feed a transaction.
  const ADDR = Object.freeze({ core: "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44", token: "0x5501e1fa81be1c3f49225fa7668da0245d07db60" });
  const SEL = { state: "0xc19d93fb", totalSupply: "0x18160ddd", approve: "0x095ea7b3" };
  const REFRESH_MS = 15000;
  const BLOCK_UNIT = 1_000_000_000n; // blockProgress scale (cumulativeBlockUnits = height * 1e9 + progress)
  let cap = null;
  let lastEcon = null; // last successful /economy/state response

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtSqk = (base) => { const b = BigInt(base); const whole = b / 10n ** 18n; const frac = Number((b % 10n ** 18n) / 10n ** 16n); return fmt(whole.toString()) + (whole < 1000000n ? "." + String(frac).padStart(2, "0") : ""); };
  const ago = (iso) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 90 ? s + "s ago" : s < 5400 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };

  async function getJSON(path) {
    const r = await fetch(API + path, { cache: "no-store" });
    if (!r.ok) throw new Error(path + " HTTP " + r.status);
    return r.json();
  }
  async function rpc(method, params) {
    let last;
    for (const url of RPCS) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      } catch (e) { last = e; }
    }
    throw last;
  }
  // Builds an Etherscan link with DOM methods (never innerHTML) and only for a well-formed tx hash.
  const TX_RE = /^0x[0-9a-fA-F]{64}$/;
  function txLink(hash, label) {
    if (typeof hash !== "string" || !TX_RE.test(hash)) return null;
    const a = document.createElement("a");
    a.href = "https://sepolia.etherscan.io/tx/" + hash; a.target = "_blank"; a.rel = "noopener";
    a.textContent = label;
    return a;
  }
  const words = (hex) => hex.slice(2).match(/.{64}/g).map((w) => BigInt("0x" + w));

  /* Normalised snapshot used by render() */
  async function fromApi() {
    const [status, fresh] = await Promise.all([getJSON("/status"), getJSON("/economy/state").catch(() => null)]);
    // If the economy read fails, keep showing the last good one instead of blanking the tiles.
    if (fresh && fresh.status !== "unavailable") lastEcon = fresh;
    const econ = lastEcon;
    const m = status.measurement || {};
    const b = (status.builder && status.builder.status === "available") ? (status.builder.projected || status.builder.anchor) : null;
    const sup = econ?.supply || {};
    if (sup.capBaseUnits || sup.cap) cap = sup.capBaseUnits || sup.cap;
    return {
      source: "Squeekchain API",
      live: true,
      freshness: m.freshness, observedAt: m.observedAt, staleAfter: m.staleAfterSeconds || 120,
      coreStatus: m.coreStatus, rpm: typeof m.rpmMilli === "number" ? m.rpmMilli / 1000 : null,
      speed: m.speedMmPerSecond, work: b?.cumulativeWork ?? m.cumulativeWorkUnits,
      height: b?.blockHeight, progress: b?.blockProgress, difficulty: b?.workPerThousandBlocks,
      round: status.builder?.anchor?.settledThroughRound ?? econ?.lifecycle?.currentRound,
      settledAt: status.settlementQueue?.latestSubmission?.confirmedAt || status.builder?.anchor?.confirmedAt,
      settleTx: status.settlementQueue?.latestSubmission?.transactionHash || status.builder?.anchor?.transactionHash,
      minted: sup.totalMintedBaseUnits ?? null,
      paused: econ?.lifecycle?.paused,
    };
  }
  async function fromChain() {
    const [st, ts] = await Promise.all([
      rpc("eth_call", [{ to: ADDR.core, data: SEL.state }, "latest"]),
      rpc("eth_call", [{ to: ADDR.token, data: SEL.totalSupply }, "latest"]),
    ]);
    const w = words(st);
    return {
      source: "Sepolia RPC (API unreachable)", live: false,
      coreStatus: null, rpm: null, speed: null,
      round: w[0].toString(), work: w[1].toString(), height: w[3].toString(), progress: w[4].toString(),
      difficulty: w[5].toString(), paused: w[7] === 1n, minted: BigInt(ts).toString(),
    };
  }

  function verdict(s) {
    if (!s.live) return { state: "unknown", h: "Can't tell", sub: "Live wheel feed is unreachable. Showing settled on-chain numbers from Sepolia." };
    const age = s.observedAt ? (Date.now() - Date.parse(s.observedAt)) / 1000 : Infinity;
    const fresh = s.freshness === "online" && age <= s.staleAfter;
    if (!fresh) return { state: "offline", h: "Wheel offline", sub: "No fresh reading from the WHEELY9000" + (s.observedAt ? " since " + ago(s.observedAt) : "") + "." };
    if (s.coreStatus === "COUNTER_FAULT") return { state: "unknown", h: "Sensor hiccup", sub: "The wheel counter reports a fault, so the reading is unknown." };
    if (s.coreStatus === "ACTIVE" || (s.rpm ?? 0) > 0) return { state: "running", h: "Yes! 🐹💨", sub: "Squeektoshi is on the wheel at " + fmt(s.rpm ?? 0, 1) + " RPM, mining SQK right now." };
    return { state: "idle", h: "Napping 💤", sub: "The wheel is still. Squeektoshi is resting. Reading " + ago(s.observedAt) + "." };
  }

  const pulse = [];
  function render(s, err) {
    const banner = $("banner"), fresh = $("fresh");
    if (!s) {
      banner.dataset.state = "unknown"; $("answer").textContent = "Can't tell"; $("subline").textContent = "Couldn't reach the API or Sepolia RPC: " + (err?.message || err);
      fresh.textContent = "offline"; fresh.dataset.ok = "false"; pushPulse("err"); return;
    }
    const v = verdict(s);
    banner.dataset.state = v.state; $("answer").textContent = v.h; $("subline").textContent = v.sub;
    fresh.textContent = s.live ? (s.freshness === "online" ? "● live" : "● stale") : "● on-chain fallback"; fresh.dataset.ok = String(v.state === "running" || v.state === "idle");
    $("rpm").textContent = s.rpm == null ? "—" : fmt(s.rpm, 1);
    $("speed").textContent = s.speed == null ? "Live wheel speed needs the API" : fmt(s.speed / 1000, 2) + " m/s at the wheel rim";
    // Settled totals only grow, so a missing value keeps the last one shown instead of blanking to "—".
    const keep = (id, v, f) => { if (v != null) $(id).textContent = f(v); };
    keep("work", s.work, (v) => fmt(v));
    keep("height", s.height, (v) => fmt(v));
    if (s.progress != null) { const p = Number(BigInt(s.progress) * 10000n / BLOCK_UNIT) / 100; $("progress").style.width = Math.min(100, p) + "%"; $("progressText").textContent = fmt(p, 1) + "% toward block " + fmt(BigInt(s.height) + 1n); }
    keep("difficulty", s.difficulty, (v) => fmt(v));
    keep("minted", s.minted, (v) => fmtSqk(v));
    $("cap").textContent = cap ? "of " + fmtSqk(cap) + " SQK cap · testnet" : "Testnet SQK · Sepolia";
    keep("round", s.round, (v) => "Round " + fmt(v));
    const settleLink = txLink(s.settleTx, "tx ↗");
    if (settleLink) $("settled").replaceChildren("Last settled " + (s.settledAt ? ago(s.settledAt) : "recently") + " · ", settleLink);
    else $("settled").textContent = s.paused ? "Core paused" : "Settled on Sepolia";
    $("updated").textContent = new Date().toLocaleTimeString();
    $("source").textContent = s.source;
    setRunning(v.state === "running");
    pushPulse(v.state === "running" ? "on" : "");
  }
  function pushPulse(cls) {
    pulse.push(cls); if (pulse.length > 120) pulse.shift();
    $("pulse").innerHTML = pulse.map((c) => '<i class="' + c + '"></i>').join("");
  }

  async function refresh() {
    try { render(await fromApi()); }
    catch (apiErr) {
      console.warn("API failed, trying RPC", apiErr);
      try { render(await fromChain()); } catch (e) { render(null, e); }
    }
  }

  /* ---------- Original dot-matrix hamster (drawn in code, not a copied logo) ---------- */
  const H = [
    "...XX..........XX...",
    "..XXXX........XXXX..",
    "..XEEXXXXXXXXXXEEX..",
    "..XXXXXXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXXXXXX.",
    ".XXXXOOXXXXXXOOXXXX.",
    "XXXXXOOXXXXXXOOXXXXX",
    "XXXXXXXXXNNXXXXXXXXX",
    "XCCXXXXXXNNXXXXXXCCX",
    "XCCCXXXXXXXXXXXXCCCX",
    "XXCCXXXXXTTXXXXXCCXX",
    ".XXXXXXXXTTXXXXXXXX.",
    "..XXXXXXXXXXXXXXXX..",
    "...XXXXXXXXXXXXXX...",
    ".....XXXXXXXXXX.....",
  ];
  const COL = { X: "#f2c230", E: "#c07e72", C: "#ffc048", O: "#0b0b0d", N: "#c07e72", T: "#f2f2f4" };
  let running = false, t = 0;
  function setRunning(r) { running = r; }
  function drawHamster() {
    const c = $("hamster"), x = c.getContext("2d"), cell = 12;
    x.clearRect(0, 0, c.width, c.height);
    const ox = 12, oy = 18;
    H.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      let col = COL[ch];
      if (ch === "C") col = running ? "#ff9f6b" : "#e8b24a";
      if (ch === "O" && !running && Math.floor(t / 40) % 6 === 0) col = COL.X; // blink when napping
      x.fillStyle = col; x.beginPath(); x.arc(ox + i * cell + cell / 2, oy + j * cell + cell / 2, cell * 0.42, 0, Math.PI * 2); x.fill();
    }));
    // blue tile "wheel" strip underneath
    const n = 20, off = running ? Math.floor(t / 3) % 4 : 0;
    for (let i = 0; i < n; i++) { x.fillStyle = (i + off) % 4 === 0 ? "#a8baff" : "#5b7cfa"; x.fillRect(ox + i * cell + 1, oy + 16 * cell, cell - 2, cell - 2); }
    t++; requestAnimationFrame(drawHamster);
  }
  function drawMark() {
    const c = $("mark"), x = c.getContext("2d");
    const m = ["X..X", "XXXX", "XOXO".replace(/O/g, "o"), "XXXX"];
    m.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === ".") return; x.fillStyle = ch === "o" ? "#0b0b0d" : "#f2c230"; x.beginPath(); x.arc(4 + i * 9 + 4, 4 + j * 9 + 4, 4, 0, 7); x.fill(); }));
    x.fillStyle = "#5b7cfa"; x.fillRect(34, 34, 10, 10);
  }

  /* ---------- Ping SQK (Sepolia testnet only, user-initiated) ---------- */
  async function ping() {
    const btn = $("pingBtn"), out = $("pingStatus"), eth = window.ethereum;
    if (!eth) { out.textContent = "No browser wallet found. Install MetaMask or Rabby, then reload."; return; }
    btn.disabled = true;
    try {
      out.textContent = "Requesting wallet connection…";
      const [from] = await eth.request({ method: "eth_requestAccounts" });
      let chain = await eth.request({ method: "eth_chainId" });
      if (chain !== CHAIN_ID_HEX) {
        out.textContent = "Switching to Sepolia testnet…";
        try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] }); }
        catch (e) {
          if (e.code === 4902) await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_ID_HEX, chainName: "Sepolia", nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 }, rpcUrls: [RPCS[0]], blockExplorerUrls: ["https://sepolia.etherscan.io"] }] });
          else throw e;
        }
        chain = await eth.request({ method: "eth_chainId" });
        if (chain !== CHAIN_ID_HEX) throw new Error("Wallet is not on Sepolia. Ping cancelled.");
      }
      // approve(spender = your own address, amount = 0): a no-op allowance reset. Moves no tokens.
      const data = SEL.approve + from.toLowerCase().replace(/^0x/, "").padStart(64, "0") + "0".repeat(64);
      out.textContent = "Confirm the testnet tx in your wallet…";
      const hash = await eth.request({ method: "eth_sendTransaction", params: [{ from, to: ADDR.token, data, value: "0x0" }] });
      const sentLink = txLink(hash, String(hash).slice(0, 12) + "… ↗");
      out.replaceChildren("🐹 Squeek! Sent on Sepolia: ", sentLink || String(hash));
    } catch (e) {
      out.textContent = e.code === 4001 ? "You rejected the request. Nothing was sent." : "Ping failed: " + (e.message || e);
    } finally { btn.disabled = false; }
  }

  $("pingBtn").addEventListener("click", ping);
  drawMark(); drawHamster();
  refresh(); setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.__squeek = { fromApi, fromChain }; // handy for debugging in the console
})();
