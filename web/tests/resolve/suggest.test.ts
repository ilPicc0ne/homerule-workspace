import test from "node:test";
import assert from "node:assert/strict";
import { SUGGESTIONS, suggest } from "../../lib/resolve/suggest.ts";
import { resolveQuery } from "../../lib/resolve/resolve.ts";
import { sampleIndex } from "../../lib/resolve/samples.ts";
import type { FetchLike } from "../../lib/resolve/census.ts";

const labels = (q: string) => suggest(SUGGESTIONS, q).map((s) => `${s.label} · ${s.detail}`);

test("'3515 Fill' → 3515 Fillmore St, San Francisco first (PRD J1)", () => {
  assert.equal(labels("3515 Fill")[0], "3515 Fillmore St · San Francisco, CA");
});

test("street words in any order and spelled out: 'fillmore street' finds both Fillmore samples", () => {
  const l = labels("fillmore street");
  assert.ok(l.includes("3515 Fillmore St · San Francisco, CA"), l.join("\n"));
  assert.ok(l.includes("2118 Fillmore St · San Francisco, CA"), l.join("\n"));
});

test("place names come first for words: 'Dorch' → Dorchester, part of Boston", () => {
  const [first] = suggest(SUGGESTIONS, "Dorch");
  assert.equal(first.label, "Dorchester");
  assert.equal(first.kind, "place");
  assert.match(first.detail, /Boston/);
});

test("'hob' → Hoboken, then Hoboken addresses", () => {
  const s = suggest(SUGGESTIONS, "hob");
  assert.equal(s[0].label, "Hoboken");
  assert.ok(s.slice(1).every((x) => x.detail.includes("Hoboken")));
});

test("counties and states are suggested: 'hudson', 'massa'", () => {
  assert.equal(suggest(SUGGESTIONS, "hudson")[0].label, "Hudson County");
  assert.equal(suggest(SUGGESTIONS, "massa")[0].label, "Massachusetts");
});

test("at most 8, nothing for one character or nonsense", () => {
  assert.equal(suggest(SUGGESTIONS, "1").length, 0);
  assert.equal(suggest(SUGGESTIONS, "zzzq").length, 0);
  assert.ok(suggest(SUGGESTIONS, "st").length <= 8);
});

test("every dataset address with a house number is suggestible", () => {
  const addresses = SUGGESTIONS.filter((s) => s.kind === "address");
  assert.ok(addresses.length >= 490, String(addresses.length));
});

test("every address suggestion resolves to its own sample record, without Census", async () => {
  const noCensus: FetchLike = async () => {
    throw new Error("Census must not be called for a sample address");
  };
  const samples = sampleIndex();
  for (const s of SUGGESTIONS.filter((x) => x.kind === "address")) {
    const r = await resolveQuery(s.q, { fetch: noCensus, samples, retries: 0 });
    assert.equal(r.kind, "address", `${s.q}: ${r.kind}`);
    if (r.kind === "address") assert.equal(r.sample?.address_id, s.id, s.q);
  }
});

test("every place suggestion resolves to a place", async () => {
  for (const s of SUGGESTIONS.filter((x) => x.kind === "place")) {
    const r = await resolveQuery(s.q, { fetch: globalThis.fetch, samples: sampleIndex() });
    assert.equal(r.kind, "place", s.q);
  }
});
