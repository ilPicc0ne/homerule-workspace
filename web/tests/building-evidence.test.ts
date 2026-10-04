import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceFor } from "../lib/building-evidence.ts";
import { evidenceValue, safeEvidenceUrl } from "../lib/evidence-display.ts";
import type { Dataset } from "../lib/types.ts";
import type { EvidenceSnapshot } from "../lib/building-evidence-types.ts";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../data/${file}.json`, import.meta.url), "utf8"));
const data: Dataset = Object.fromEntries(["meta", "rules", "addresses", "lookups", "excerpts", "findings"].map(k => [k, read(`live/${k}`)])) as Dataset;
const snapshot = read("building-evidence") as EvidenceSnapshot;
const address = data.addresses.find(a => a.address_id === "A0107")!;

test("committed review plans match the current law/address dataset without changing it", () => {
  const before = JSON.stringify(data);
  const view = evidenceFor(data, address);
  assert.equal(view.status, "available");
  if (view.status !== "available") return;
  assert.ok(view.data.questions.some(q => q.fact === "built"));
  assert.ok(view.data.leads.some(l => l.source_id === "la" && evidenceValue(l.value) === "1978"));
  assert.equal(JSON.stringify(data), before);
});

test("different rules, addresses, lookup results or as-of dates withhold stale evidence", () => {
  for (const field of ["rules", "addresses", "lookups"] as const) {
    const changed = structuredClone(data);
    // Deliberately altered serialized data, representing a new pipeline release.
    Object.assign(changed[field], { changed: true });
    if (Array.isArray(changed[field])) changed[field].pop();
    assert.equal(evidenceFor(changed, address).status, "stale", field);
  }
  assert.equal(evidenceFor({ ...data, meta: { ...data.meta, default_as_of: "2030-01-01" } }, address).status, "stale");
});

test("typed/demo/numberless addresses never receive sample building evidence", () => {
  assert.equal(evidenceFor(data, address, true).status, "unavailable");
  assert.equal(evidenceFor({ ...data, meta: { ...data.meta, data_source: "demo" } }, address).status, "unavailable");
  assert.equal(evidenceFor(data, { ...address, street: "Sherman Grove Ave" }).status, "unavailable");
  assert.equal(evidenceFor(data, { ...address, address_id: "unknown" }).status, "unavailable");
  assert.equal(evidenceFor(data, { ...address, street: "999 Sherman Grove Ave" }).status, "unavailable");
});

test("timeline navigation does not show investigation outcomes calculated for another date", () => {
  assert.equal(evidenceFor(data, address, false, snapshot, "2027-07-01").status, "unavailable");
  assert.equal(evidenceFor(data, address, false, snapshot, "2025-01-01").status, "unavailable");
  assert.equal(evidenceFor(data, address, false, snapshot, data.meta.default_as_of).status, "available");
});

test("Boston disagreement keeps the observed and current years plus source limitations", () => {
  const record = snapshot.addresses.A0366;
  const lead = record.leads.find(l => l.fact === "built" && l.source_id === "ma")!;
  assert.equal(lead.comparison, "review_difference");
  assert.equal(evidenceValue(lead.value), "1910");
  assert.equal(evidenceValue(lead.current_value), "2024");
  assert.ok(lead.limitation && lead.retrieved_at && lead.source_period && safeEvidenceUrl(lead.source_url));
});

test("published leads have review provenance but no full raw records or owner names", () => {
  const allowed = new Set(["fact", "meaning", "value", "current_value", "comparison", "limitation", "source_id", "source_record_id", "source_period", "retrieved_at", "source_url", "publisher_url", "match"]);
  for (const a of Object.values(snapshot.addresses)) for (const l of a.leads) {
    assert.ok(Object.keys(l).every(k => allowed.has(k)));
    assert.ok(l.match && l.limitation && safeEvidenceUrl(l.source_url));
  }
});

test("source links reject unsafe schemes and evidence renders uncertainty honestly", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///tmp/a", "not a URL", null]) assert.equal(safeEvidenceUrl(url), null);
  assert.equal(safeEvidenceUrl("https://example.org/record/1"), "https://example.org/record/1");
  assert.equal(evidenceValue({ min: 2, max: null }), "2+");
  assert.equal(evidenceValue(null), "Not recorded");
});
