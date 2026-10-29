// Which livestream (if any) the game should embed. Squeekchain goes live each night on X, YouTube
// or Twitch and publishes the current broadcast at media.squeekchain.com/live/current.json.
// When that file is missing (it sometimes is, even mid-stream) an admin can set tonight's
// broadcast by hand; that override expires on its own.
// IDs are checked with the same patterns Squeekchain's own site uses, so nothing else can be framed.

export const DESCRIPTOR_URL = "https://media.squeekchain.com/live/current.json";
export const OVERRIDE_KEY = "meta/stream";
export const OVERRIDE_HOURS = 12;

const ID = {
  x: /^[A-Za-z0-9]{13,16}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
  twitch: /^[a-z0-9_]{4,25}$/,
};
const LABEL = { x: "X", youtube: "YouTube", twitch: "Twitch" };

export const validId = (kind, id) => Object.hasOwn(ID, kind) && typeof id === "string" && ID[kind].test(id);

/** A pasted watch link -> { kind, id }, or null if it isn't one we can embed. */
export function parseStreamUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  let kind = null, id = null;
  if ((host === "x.com" || host === "twitter.com") && parts[0] === "i" && parts[1] === "broadcasts") [kind, id] = ["x", parts[2]];
  else if (host === "studio.x.com" && parts[0] === "embed" && parts[1] === "broadcast") [kind, id] = ["x", parts[2]];
  else if (host === "youtube.com" && parts[0] === "watch") [kind, id] = ["youtube", u.searchParams.get("v")];
  else if (host === "youtube.com" && (parts[0] === "live" || parts[0] === "embed")) [kind, id] = ["youtube", parts[1]];
  else if (host === "youtu.be") [kind, id] = ["youtube", parts[0]];
  else if (host === "twitch.tv" && parts.length === 1) [kind, id] = ["twitch", parts[0].toLowerCase()];
  return kind && validId(kind, id) ? { kind, id } : null;
}

// Twitch only plays on sites named as parent=, so the game and the dashboard are always listed.
export const TWITCH_PARENTS = ["squeekorsleep.mfbrat.com", "squeek.mfbrat.com"];

/** { kind, id } -> what the page needs. `host` is the requesting site's hostname. */
export function playerFor({ kind, id }, host) {
  if (!validId(kind, id)) return null;
  const e = encodeURIComponent;
  const parents = [...new Set([host, ...TWITCH_PARENTS].filter(Boolean))].map((h) => "&parent=" + e(h)).join("");
  const urls = {
    x: [`https://studio.x.com/embed/broadcast/${e(id)}?dnt=true`, `https://x.com/i/broadcasts/${e(id)}`],
    youtube: [`https://www.youtube-nocookie.com/embed/${e(id)}?autoplay=1&mute=1&playsinline=1`, `https://www.youtube.com/watch?v=${e(id)}`],
    twitch: [`https://player.twitch.tv/?channel=${e(id)}${parents}&muted=true`, `https://www.twitch.tv/${e(id)}`],
  }[kind];
  return { kind, id, label: LABEL[kind], embed: urls[0], watch: urls[1] };
}

/** Squeekchain's descriptor -> { kind, id } while it says live and hasn't expired. */
export function fromDescriptor(d, nowMs) {
  if (!d || d.state !== "live" || !d.playback) return null;
  if (!(Date.parse(d.validUntil) > nowMs)) return null;
  const { kind } = d.playback;
  const id = kind === "x" ? d.playback.broadcastId : d.playback.publicId;
  return validId(kind, id) ? { kind, id } : null;
}

/** Stored override -> { kind, id } until it expires. */
export function fromOverride(o, nowMs) {
  if (!o || !(o.until > nowMs)) return null;
  return validId(o.kind, o.id) ? { kind: o.kind, id: o.id } : null;
}

/** The descriptor wins; the override covers nights it's missing. */
export function chooseStream({ descriptor, override, nowMs, host }) {
  const d = fromDescriptor(descriptor, nowMs);
  if (d) return { live: true, source: "squeekchain", ...playerFor(d, host) };
  const o = fromOverride(override, nowMs);
  if (o) return { live: true, source: "manual", ...playerFor(o, host) };
  return { live: false };
}
