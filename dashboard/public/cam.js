/* Wheel cam: Squeekchain's own livestream in the official X / YouTube / Twitch player.
   Which broadcast is live comes from the game site's /api/stream (one source for both sites).
   The iframe is only replaced when the broadcast changes, so polling never restarts the video. */
(() => {
  "use strict";
  const API = "https://squeekorsleep.mfbrat.com/api/stream";
  const STREAM_PAGE = "https://sepolia.squeekchain.com/#stream-game";
  const EMBED_OK = /^https:\/\/(studio\.x\.com\/embed\/broadcast\/|www\.youtube-nocookie\.com\/embed\/|player\.twitch\.tv\/\?)/;
  const WATCH_OK = /^https:\/\/(x\.com\/i\/broadcasts\/|www\.youtube\.com\/watch\?|www\.twitch\.tv\/)/;
  const $ = (id) => document.getElementById(id);
  let current = null;

  async function cam() {
    let s = null;
    try { const r = await fetch(API, { cache: "no-store" }); if (r.ok) s = await r.json(); } catch { /* off air */ }
    const live = !!(s && s.live && EMBED_OK.test(s.embed || ""));
    const frame = $("camFrame"), tag = $("camState"), watch = $("camWatch");
    frame.hidden = !live; $("camOff").hidden = live;
    tag.textContent = live ? "● live on " + s.label : "off air";
    tag.dataset.live = String(live);
    watch.href = live && WATCH_OK.test(s.watch || "") ? s.watch : STREAM_PAGE;
    watch.textContent = live ? "Open on " + s.label + " ↗" : "Open the stream ↗";
    if (!live) { if (current) { frame.replaceChildren(); current = null; } return; }
    if (s.embed === current) return;
    current = s.embed;
    const f = document.createElement("iframe");
    f.src = s.embed;
    f.title = "Squeekchain livestream of Squeektoshi's wheel";
    f.allow = "autoplay; fullscreen; picture-in-picture";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    frame.replaceChildren(f);
  }

  cam();
  setInterval(cam, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cam(); });
})();
