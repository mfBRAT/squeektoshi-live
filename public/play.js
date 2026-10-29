/* Squeek or Sleep: community-built, not affiliated with Squeekchain. No build step, no dependencies.
   Everything is rendered with DOM methods and textContent; nothing from the network goes into innerHTML. */
(() => {
  "use strict";
  const LIVE_API = "https://api.squeekchain.com/v1/status"; // display only
  const OUT = { nap: { e: "💤", l: "Nap" }, jog: { e: "🐾", l: "Jog" }, zoomies: { e: "🔥", l: "Zoomies" } };
  const TX_RE = /^0x[0-9a-fA-F]{64}$/;
  let view = null, skew = 0, busy = false, loadedFor = 0;

  const $ = (id) => document.getElementById(id);
  const nowSec = () => Math.floor((Date.now() + skew) / 1000);
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const clock = (unix) => new Date(unix * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mmss = (s) => { s = Math.max(0, s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const dayOf = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c);
    return n;
  }
  const txLink = (hash) => (TX_RE.test(hash || "") ? el("a", { href: "https://sepolia.etherscan.io/tx/" + hash, target: "_blank", rel: "noopener", text: "tx ↗" }) : null);
  function say(text, kind) { const m = $("msg"); m.textContent = text || ""; if (kind) m.dataset.kind = kind; else delete m.dataset.kind; }

  async function api(path, body) {
    const opt = body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const r = await fetch(path, opt);
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) throw new Error((j && j.error) || "Request failed (" + r.status + ")");
    return j;
  }

  async function load() {
    try { setView(await api("/api/game")); }
    catch (e) { say("Couldn't load the game: " + e.message, "err"); }
  }
  function setView(v) { view = v; skew = v.now * 1000 - Date.now(); loadedFor = v.current.round; render(); }

  /* ---------- rendering ---------- */
  function render() {
    if (!view) return;
    const me = view.me;
    $("signedOut").hidden = !!me; $("signedIn").hidden = !me;
    if (me) {
      $("meName").textContent = me.handle ? "@" + me.handle : short(me.address);
      $("meAddr").textContent = me.handle ? short(me.address) : "";
      if (document.activeElement !== $("handleInput")) $("handleInput").value = me.handle || "";
      const s = me.season;
      $("meStats").textContent = s ? `This week: #${s.rank} · ${s.pts} pts · ${s.hits}/${s.picks} hits` : "No settled calls yet this week.";
    }
    $("curRound").textContent = "Round " + view.current.round.toLocaleString();
    const today = dayOf(view.upcoming[0].start);
    $("callsLeft").textContent = me ? String(me.callsLeft[today] ?? view.rules.dailyCalls) : "—";
    $("callsNote").textContent = `${view.rules.dailyCalls} per day (UTC ${today})`;
    $("pointsLine").textContent = Object.keys(OUT).map((o) => `${OUT[o].l} ${view.points[o]}`).join(" · ");
    $("voidRule").textContent = view.voidCheck
      ? "If the wheel feed goes offline during a round, that round is void and scores nothing for anyone."
      : "Offline checks are paused right now, so every settled round counts as recorded on-chain (a stopped wheel settles as a nap).";
    renderRounds(); renderMine(); renderRecent(); renderBoard(); tick();
  }

  function renderRounds() {
    const me = view.me, mine = new Map((me?.picks || []).map((p) => [p.round, p]));
    $("rounds").replaceChildren(...view.upcoming.map((u) => {
      const picked = mine.get(u.round);
      const left = me ? (me.callsLeft[dayOf(u.start)] ?? 0) : 1;
      return el("article", { class: "round", "data-picked": String(!!picked), "data-start": u.start },
        el("div", { class: "round__head" },
          el("span", { class: "round__num", text: "Round " + u.round.toLocaleString() }),
          el("span", { class: "round__time" }, "starts " + clock(u.start), el("br"), "locks in ", el("b", { class: "lock", text: mmss(u.start - nowSec()) }))),
        el("div", { class: "choices", role: "group", "aria-label": "Your call for round " + u.round },
          Object.keys(OUT).map((o) => el("button", {
            class: "choice", type: "button", "aria-pressed": String(picked?.o === o),
            disabled: busy || (me && !picked && left <= 0),
            title: me && !picked && left <= 0 ? "No calls left for this day" : null,
            onclick: () => choose(u.round, o),
          }, el("span", { class: "choice__emoji", text: OUT[o].e }), el("span", { text: OUT[o].l }), el("span", { class: "choice__pts", text: "+" + view.points[o] })))));
    }));
  }

  function statusTag(p) {
    const cur = view.current.round;
    if (p.result) {
      if (p.void) return el("span", { class: "tag tag--void", text: "void" });
      return p.earned > 0 ? el("span", { class: "tag tag--hit", text: "hit +" + p.earned }) : el("span", { class: "tag tag--miss", text: "miss · was " + OUT[p.result].l.toLowerCase() });
    }
    const t = p.round > cur ? "upcoming" : p.round === cur ? "in play" : "settling…";
    return el("span", { class: "tag tag--wait", text: t });
  }
  function renderMine() {
    const picks = view.me?.picks || [];
    $("myEmpty").hidden = picks.length > 0;
    $("myPicks").replaceChildren(...picks.slice(0, 12).map((p) =>
      el("li", {}, el("span", { class: "r", text: "#" + p.round }), el("span", { class: "o", text: `${OUT[p.o].e} ${OUT[p.o].l}` }), statusTag(p))));
  }
  function renderRecent() {
    $("recent").replaceChildren(...view.recent.map((x) =>
      el("li", {}, el("span", { class: "r", text: "#" + x.round }),
        el("span", { class: "o", text: `${OUT[x.o].e} ${OUT[x.o].l}` }, el("span", { class: "r", text: " · " + Number(x.w).toLocaleString() + " passes" })),
        x.void ? el("span", { class: "tag tag--void", text: "void" }) : (txLink(x.tx) || el("span")))));
    const behind = view.current.round - 1 - view.settledThrough;
    $("settledNote").textContent = view.settledThrough ? (behind > 0 ? `through #${view.settledThrough} · ${behind} settling` : `through #${view.settledThrough}`) : "waiting for the first check";
  }
  function renderBoard() {
    const me = view.me?.address;
    $("seasonNote").textContent = `Week of ${view.season} (UTC) · ${view.players} player${view.players === 1 ? "" : "s"}`;
    $("boardEmpty").hidden = view.board.length > 0;
    $("board").replaceChildren(...view.board.map((p) =>
      el("tr", { "data-me": String(p.addr === me) },
        el("td", { text: String(p.rank) }),
        el("td", { class: "who" }, p.handle ? "@" + p.handle : short(p.addr), p.addr === me ? el("small", { text: "you" }) : null),
        el("td", { class: "num", text: String(p.pts) }),
        el("td", { class: "num", text: `${p.hits} / ${p.picks}` }))));
  }

  /* Countdowns run locally every second; the page refetches when a round rolls over. */
  function tick() {
    if (!view) return;
    const now = nowSec();
    $("curLeft").textContent = mmss(view.current.end - now);
    for (const card of document.querySelectorAll(".round")) {
      const lock = card.querySelector(".lock");
      if (lock) lock.textContent = mmss(Number(card.dataset.start) - now);
    }
    if (now >= view.current.end && loadedFor === view.current.round) { loadedFor = -1; load(); }
  }

  /* ---------- actions ---------- */
  async function choose(round, outcome) {
    if (!view.me) { await signIn(); if (!view?.me) return; }
    busy = true; renderRounds(); say("Saving your call…");
    try { setView(await api("/api/pick", { round, outcome })); say(`Called ${OUT[outcome].l} for round ${round}.`); }
    catch (e) { say(e.message, "err"); }
    finally { busy = false; renderRounds(); }
  }

  const utf8Hex = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
  async function signIn() {
    const eth = window.ethereum;
    if (!eth) { say("No browser wallet found. Install MetaMask or Rabby, then reload.", "err"); return; }
    const btn = $("signIn"); btn.disabled = true;
    try {
      say("Connect your wallet…");
      const [address] = await eth.request({ method: "eth_requestAccounts" });
      const { message } = await api("/api/auth/nonce?address=" + encodeURIComponent(address));
      say("Sign the message in your wallet. It's free and sends nothing.");
      const signature = await eth.request({ method: "personal_sign", params: [utf8Hex(message), address] });
      await api("/api/auth/verify", { message, signature });
      say("Signed in. Make your calls!");
      await load();
    } catch (e) {
      say(e && e.code === 4001 ? "You cancelled the request." : "Sign-in failed: " + (e.message || e), "err");
    } finally { btn.disabled = false; }
  }
  async function signOut() {
    try { await api("/api/auth/logout", {}); } catch { /* still reload */ }
    say(""); await load();
  }
  async function saveHandle(ev) {
    ev.preventDefault();
    try { await api("/api/handle", { handle: $("handleInput").value }); say("Saved."); await load(); }
    catch (e) { say(e.message, "err"); }
  }

  /* Live wheel state from the public API, display only. */
  async function live() {
    const pill = $("live"), st = $("nowState");
    try {
      const r = await fetch(LIVE_API, { cache: "no-store" });
      const m = (await r.json()).measurement || {};
      const age = (Date.now() - Date.parse(m.observedAt)) / 1000;
      const fresh = m.freshness === "online" && age <= (m.staleAfterSeconds || 120);
      const rpm = typeof m.rpmMilli === "number" ? m.rpmMilli / 1000 : 0;
      const s = !fresh ? "offline" : (m.coreStatus === "ACTIVE" || rpm > 0) ? "running" : "idle";
      st.dataset.s = s;
      st.textContent = s === "running" ? `Running · ${rpm.toFixed(0)} RPM` : s === "idle" ? "Napping 💤" : "Feed offline";
      pill.textContent = fresh ? "● live" : "● stale"; pill.dataset.ok = String(fresh);
    } catch { st.textContent = "Can't tell"; pill.textContent = "offline"; pill.dataset.ok = "false"; }
  }

  /* Wheel cam: Squeekchain's own livestream in the official X / YouTube / Twitch player.
     The iframe is only replaced when the broadcast changes, so polling never restarts the video. */
  const EMBED_OK = /^https:\/\/(studio\.x\.com\/embed\/broadcast\/|www\.youtube-nocookie\.com\/embed\/|player\.twitch\.tv\/\?)/;
  const WATCH_OK = /^https:\/\/(x\.com\/i\/broadcasts\/|www\.youtube\.com\/watch\?|www\.twitch\.tv\/)/;
  const STREAM_PAGE = "https://sepolia.squeekchain.com/#stream-game";
  let streamSrc = null;
  async function stream() {
    let s = null;
    try { s = await api("/api/stream"); } catch { /* treat as off air */ }
    const live = !!(s && s.live && EMBED_OK.test(s.embed || ""));
    const frame = $("streamFrame"), tag = $("streamState");
    frame.hidden = !live; $("streamOff").hidden = live;
    tag.textContent = live ? "● live on " + s.label : "off air";
    tag.className = "tag " + (live ? "tag--live" : "tag--wait");
    $("streamWatch").href = live && WATCH_OK.test(s.watch || "") ? s.watch : STREAM_PAGE;
    $("streamWatch").textContent = live ? "Open on " + s.label + " ↗" : "Open the stream ↗";
    if (!live) { if (streamSrc) { frame.replaceChildren(); streamSrc = null; } return; }
    if (s.embed === streamSrc) return;
    streamSrc = s.embed;
    frame.replaceChildren(el("iframe", {
      src: s.embed, title: "Squeekchain livestream of Squeektoshi's wheel",
      allow: "autoplay; fullscreen; picture-in-picture", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin",
    }));
  }

  $("signIn").addEventListener("click", signIn);
  $("signOut").addEventListener("click", signOut);
  $("handleForm").addEventListener("submit", saveHandle);
  load(); live(); stream();
  setInterval(tick, 1000);
  setInterval(load, 60000);
  setInterval(live, 20000);
  setInterval(stream, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { load(); live(); stream(); } });
})();
