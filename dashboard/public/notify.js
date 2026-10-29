/* "Notify me when he runs": a browser notification when Squeektoshi goes from napping to running,
   while this page is open (it can be in a background tab). No server, no push subscription.
   The page's own wheel-state element is watched, so this file doesn't touch the page's code.
   Button attributes: data-watch (selector), data-attr (attribute holding the state),
   data-rpm (optional selector whose text holds the RPM). Same file on the game and the dashboard. */
(() => {
  "use strict";
  const btn = document.getElementById("notifyBtn");
  if (!btn) return;
  const note = document.getElementById("notifyNote");
  const KEY = "sq-notify";
  const COOLDOWN_MS = 15 * 60 * 1000; // one alert per 15 min, so a stop-start burst doesn't spam
  const store = {
    get() { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } },
    set(on) { try { on ? localStorage.setItem(KEY, "on") : localStorage.removeItem(KEY); } catch { /* private mode */ } },
  };

  if (!("Notification" in window)) {
    btn.hidden = true;
    if (note) { note.hidden = false; note.textContent = "This browser can't show notifications from a web page."; }
    return;
  }

  let on = store.get() && Notification.permission === "granted";
  function paint() {
    const blocked = Notification.permission === "denied";
    btn.textContent = on ? "🔔 Alerts on · turn off" : "🔔 Notify me when he runs";
    btn.setAttribute("aria-pressed", String(on));
    btn.disabled = blocked && !on;
    if (note) {
      note.hidden = !(on || blocked);
      note.textContent = blocked ? "Notifications are blocked for this site in your browser settings."
        : "You'll get an alert when he starts running, as long as this page stays open.";
    }
  }
  btn.addEventListener("click", async () => {
    if (on) { on = false; store.set(false); paint(); return; }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    on = p === "granted"; store.set(on); paint();
  });
  paint();

  const target = document.querySelector(btn.dataset.watch || "");
  const attr = btn.dataset.attr;
  if (!target || !attr) return;
  // Only a change from a known non-running state counts, so the first reading after the page
  // loads (null / "unknown" -> running) never alerts: you're already looking at it.
  let last = target.getAttribute(attr);
  let lastAlert = 0;
  new MutationObserver(() => {
    const now = target.getAttribute(attr);
    const started = now === "running" && (last === "idle" || last === "offline");
    last = now;
    if (!started || !on || Notification.permission !== "granted" || Date.now() - lastAlert < COOLDOWN_MS) return;
    lastAlert = Date.now();
    const rpmEl = btn.dataset.rpm ? document.querySelector(btn.dataset.rpm) : null;
    const rpm = rpmEl ? (rpmEl.textContent.match(/\d+(\.\d+)?/) || [])[0] : null;
    try {
      const n = new Notification("Squeektoshi is running! 🐹💨", {
        body: (rpm ? `Wheel at ${Math.round(Number(rpm))} RPM. ` : "") + "Come watch the wheel cam.",
        icon: "favicon.svg", tag: "sq-running",
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }).observe(target, { attributes: true, attributeFilter: [attr] });
})();
