import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStreamUrl, playerFor, chooseStream, fromDescriptor } from "../lib/stream.js";

const NOW = Date.parse("2026-10-29T22:00:00Z");

test("parses X, YouTube and Twitch watch links", () => {
  assert.deepEqual(parseStreamUrl("https://x.com/i/broadcasts/1dGYlaqYqXNKX"), { kind: "x", id: "1dGYlaqYqXNKX" });
  assert.deepEqual(parseStreamUrl("https://twitter.com/i/broadcasts/1dGYlaqYqXNKX?s=20"), { kind: "x", id: "1dGYlaqYqXNKX" });
  assert.deepEqual(parseStreamUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseStreamUrl("https://youtu.be/dQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseStreamUrl("https://www.twitch.tv/SqueekChain"), { kind: "twitch", id: "squeekchain" });
});

test("rejects anything it can't safely embed", () => {
  for (const bad of ["http://x.com/i/broadcasts/1dGYlaqYqXNKX", "https://evil.com/i/broadcasts/1dGYlaqYqXNKX",
    "https://x.com/i/broadcasts/abc", "https://x.com/i/broadcasts/1dGYl\"><script", "https://www.youtube.com/watch?v=short",
    "https://www.twitch.tv/a/b", "javascript:alert(1)", "", null]) assert.equal(parseStreamUrl(bad), null, String(bad));
});

test("builds player links, Twitch with this site as parent", () => {
  assert.equal(playerFor({ kind: "x", id: "1dGYlaqYqXNKX" }, "h").embed, "https://studio.x.com/embed/broadcast/1dGYlaqYqXNKX?dnt=true");
  const tw = playerFor({ kind: "twitch", id: "squeekchain" }, "preview.netlify.app").embed;
  for (const h of ["preview.netlify.app", "squeekorsleep.mfbrat.com", "squeek.mfbrat.com"]) assert.ok(tw.includes("parent=" + h), h);
  assert.equal(playerFor({ kind: "twitch", id: "squeekchain" }, "squeek.mfbrat.com").embed.match(/parent=/g).length, 2);
  assert.equal(playerFor({ kind: "x", id: "bad id" }, "h"), null);
});

test("descriptor only counts while live and unexpired", () => {
  const live = { schemaVersion: 2, state: "live", playback: { kind: "x", broadcastId: "1dGYlaqYqXNKX" }, validUntil: "2026-10-29T22:05:00Z" };
  assert.deepEqual(fromDescriptor(live, NOW), { kind: "x", id: "1dGYlaqYqXNKX" });
  assert.equal(fromDescriptor({ ...live, validUntil: "2026-10-29T21:59:00Z" }, NOW), null);
  assert.equal(fromDescriptor({ ...live, state: "idle" }, NOW), null);
});

test("descriptor beats the manual override, which expires on its own", () => {
  const descriptor = { state: "live", playback: { kind: "youtube", publicId: "dQw4w9WgXcQ" }, validUntil: "2026-10-29T23:00:00Z" };
  const override = { kind: "x", id: "1dGYlaqYqXNKX", until: NOW + 3600_000 };
  assert.equal(chooseStream({ descriptor, override, nowMs: NOW, host: "h" }).source, "squeekchain");
  const manual = chooseStream({ descriptor: null, override, nowMs: NOW, host: "h" });
  assert.equal(manual.source, "manual"); assert.equal(manual.label, "X"); assert.equal(manual.live, true);
  assert.deepEqual(chooseStream({ descriptor: null, override: { ...override, until: NOW - 1 }, nowMs: NOW, host: "h" }), { live: false });
});
