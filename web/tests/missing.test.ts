// "What we don't know yet" (J2): the approval date when the build year can't settle a cutoff,
// one line per fact, the lead rule's fact first. Checked on the live engine results.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import { cutoffLine, missingFacts } from "../lib/missing.ts";
import type { Result, Rule } from "../lib/types.ts";

const live = (f: string) => JSON.parse(readFileSync(join(repoRoot, "web/data/live", f), "utf8"));
const raw = live("rules.json");
const list: Rule[] = Array.isArray(raw) ? raw : Object.values(raw.rules ?? raw);
const rules = Object.fromEntries(list.map((r) => [r.rule_id, r]));
const lookups: Record<string, Record<string, Result[]>> = live("lookups.json");
const asOf = Object.keys(lookups)[0];

/** The tile's unknown results in the page's order: city rule first. */
function unknownRent(id: string): Result[] {
  return lookups[asOf][id]
    .filter((r) => r.category === "rent_increase_limits" && r.result === "unknown")
    .sort((a, b) => (rules[a.rule_id].level === "city" ? 0 : 1) - (rules[b.rule_id].level === "city" ? 0 : 1));
}

test("LA, built in the cutoff year: the approval date comes first, no 'exception in the text'", () => {
  const lines = missingFacts(unknownRent("A0107"), rules, "Los Angeles Housing Department");
  assert.equal(lines[0].fact, "When the city first approved the building for living in");
  assert.match(lines[0].why, /^Built in 1978\. The rule depends on whether the city first approved it on or before October 1, 1978/);
  assert.match(lines[0].why, /Los Angeles Housing Department or your landlord can tell you/);
  assert.ok(!lines.some((l) => l.fact.startsWith("An exception")), JSON.stringify(lines));
  assert.equal(new Set(lines.map((l) => l.fact)).size, lines.length);
});

test("SF, no year built: the year is one line, not two", () => {
  const lines = missingFacts(unknownRent("A0106"), rules, "San Francisco Rent Board");
  const year = lines.filter((l) => l.fact === "The year the building was built");
  assert.equal(year.length, 1, JSON.stringify(lines));
  assert.equal(lines[0].fact, "The year the building was built");
  assert.equal(year[0].why, "More than one rule here depends on it, and our data doesn't say.");
});

test("an open condition in the text still says so", () => {
  const evict = lookups[asOf]["A0258"].filter((r) => r.category === "just_cause_eviction" && r.result === "unknown");
  const lines = missingFacts(evict, rules, null);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].fact, "An exception in the law’s text");
});

test("the cutoff sentence is read from the engine's explanation", () => {
  assert.equal(cutoffLine("Unknown whether X covers this address: depends on built 2001 (src).", null), null);
  const l = cutoffLine("depends on built 1979 (year_built, DataSF), but the cutoff is on or before June 13, 1979 and the year alone can't settle it.", null);
  assert.ok(l && l.why.startsWith("Built in 1979. The rule depends on whether the city first approved it on or before June 13, 1979"));
  assert.match(l!.why, /Your landlord or the city's building department can tell you/);
});
