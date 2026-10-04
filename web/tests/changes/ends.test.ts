// Rules ending (sunset / repeal) in the history column and the alert email: lib/changes/ends.ts, impact.ts endBadge,
// email.ts wording. Live engine data (web/data/live, web/data/changes.full.json) plus small edits of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../helpers.ts";
import { changes } from "../../lib/changes/data.ts";
import { endingRuleIds, ruleEnds } from "../../lib/changes/ends.ts";
import type { EndRule, EndResult } from "../../lib/changes/ends.ts";
import { endBadge, eventBadge, firstLine } from "../../lib/changes/impact.ts";
import { addressChange, plainChange, render } from "../../lib/changes/email.ts";
import { formatDate } from "../../lib/format.ts";
import type { AddressChanges } from "../../lib/changes/types.ts";

const live = (f: string) => JSON.parse(readFileSync(join(repoRoot, "web/data/live", f), "utf8"));
const RULES: Record<string, EndRule> = Object.fromEntries((live("rules.json") as EndRule[]).map((r) => [r.rule_id, r]));
const LOOKUPS: Record<string, EndResult[]> = live("lookups.json")["2026-10-01"];
const AS_OF = "2026-10-01";
const SUNSET = "asof:2029-12-31..2030-01-02";
const CA = ["CA-EVICT-1946.2", "CA-RENT-1947.12"];

const endsAt = (id: string, asOf = AS_OF, results = LOOKUPS[id] ?? []) =>
  ruleEnds({ asOf, results, rules: RULES, sources: changes.sources, rec: changes.addresses[id] ?? null });

test("the engine marks the CA sunsets and the Newark version ends as ending", () => {
  const ids = endingRuleIds(changes.sources);
  for (const id of [...CA, "NJ-NEWARK-RENT-19:2-22", "NJ-NEWARK-EVICT-19:2-14-2"]) assert.ok(ids.has(id), id);
  assert.deepEqual(changes.sources[SUNSET].ending_rule_ids, CA);
});

test("CA address (San Diego, both rules may apply): 'Ends' on Jan 1, 2030 for the rent cap and the just-cause rule", () => {
  const { ends, swaps } = endsAt("A0019");
  assert.deepEqual(ends.map((e) => [e.ruleId, e.date, e.when]).sort(), CA.map((id) => [id, "2030-01-01", "future"]));
  assert.equal(formatDate(ends[0].date), "Jan 1, 2030");
  assert.deepEqual(swaps, []);
});

test("no end entry for a rule that does not apply here: LA's city rule replaces the state cap; Newark has no CA rule", () => {
  // CA-RENT-1947.12 is superseded at 6238 De Longpre Ave (no end); the just-cause rule may apply there (unknown), so it shows
  assert.deepEqual(endsAt("A0001").ends.map((e) => e.ruleId), ["CA-EVICT-1946.2"]);
  assert.deepEqual(endsAt("A0003").ends, []);                 // Newark: no CA rule, its own version ends are years back
  // a rule in ending_rule_ids but missing from this address's results never shows
  assert.deepEqual(endsAt("A0019", AS_OF, []).ends, []);
  // and a rule with an end date that no source marks as ending does not either
  const noSource = ruleEnds({ asOf: AS_OF, results: LOOKUPS.A0019, rules: RULES, sources: {}, rec: null });
  assert.deepEqual(noSource.ends, []);
});

test("Newark version swap (successor starts the day the old version ends) is not a protection ending", () => {
  // As of 1 March 2025, 8 October 2024 is within the last year: § 19:2-22(a) and § 19:2-14 old versions end that day,
  // their successors start that day at this address. Listed as swaps, never as ends.
  const { ends, swaps } = endsAt("A0003", "2025-03-01", []);
  assert.deepEqual(ends, []);
  assert.deepEqual(
    swaps.map((s) => [s.from, s.to, s.date]).sort(),
    [
      ["NJ-NEWARK-EVICT-19:2-14-2", "NJ-NEWARK-EVICT-19:2-14", "2024-10-08"],
      ["NJ-NEWARK-RENT-19:2-22", "NJ-NEWARK-RENT-19:2-3.1", "2024-10-08"],
    ],
  );
  // without a successor at the address the same diff change is a real end
  const rec = changes.addresses.A0003;
  const alone: AddressChanges = {
    ...rec,
    entries: rec.entries.map((e) => ({ ...e, changes: e.changes.filter((c) => c.team_rule_id !== "NJ-NEWARK-RENT-19:2-3.1") })),
  };
  const r = ruleEnds({ asOf: "2025-03-01", results: [], rules: RULES, sources: changes.sources, rec: alone });
  assert.deepEqual(r.ends.map((e) => [e.ruleId, e.when]), [["NJ-NEWARK-RENT-19:2-22", "past"]]);
});

test("recently ended: from the diff's end change, within the last year only", () => {
  const after = endsAt("A0019", "2030-06-01", []);
  assert.deepEqual(after.ends.map((e) => [e.ruleId, e.when]).sort(), CA.map((id) => [id, "past"]));
  assert.deepEqual(endsAt("A0019", "2031-06-01", []).ends, []);   // more than a year back
});

test("end badge: the verdict of that rule's end change only; no verdict in the data -> no badge", () => {
  const rec = changes.addresses.A0019;
  // with #59 in the data: San Diego's cap end depends on facts we lack (grey), Hoff St's narrows protection (↓)
  assert.equal(endBadge(rec, "CA-RENT-1947.12", "2030-01-01")?.kind, "unclear");
  assert.equal(endBadge(changes.addresses.A0050, "CA-RENT-1947.12", "2030-01-01")?.kind, "narrows");
  const withVerdict: AddressChanges = {
    ...rec,
    entries: rec.entries.map((e) =>
      e.source === SUNSET ? { ...e, changes: e.changes.map((c) => ({ ...c, renter_impact: { verdict: "worse" } })) } : e,
    ),
  };
  assert.equal(endBadge(withVerdict, "CA-RENT-1947.12", "2030-01-01")?.kind, "narrows");
  assert.equal(endBadge(withVerdict, "CA-RENT-1947.12", "2031-01-01"), null);    // other date
  assert.equal(eventBadge(withVerdict, "CA-RENT-1947.12", "2024-04-01"), null);  // a start event never takes the end's verdict
});

test("email: a removed rule at its end date reads 'Ends on <date>', the first line uses the end date", () => {
  const ac = addressChange(changes, "A0019", SUNSET);
  assert.ok(ac, "A0019 has the sunset entry");
  const m = render(ac);
  for (const part of [m.text, m.html]) {
    assert.match(part, /Ends on Jan 1, 2030: California limits yearly rent increases/);
    assert.match(part, /Ends on Jan 1, 2030: After a year, a landlord needs a reason/);
    assert.match(part, /Rules change at 3820 Haines St from Jan 1, 2030\./);
    assert.doesNotMatch(part, /no longer shows|Apr 1, 2024|compliant|illegal/);
    assert.match(part, /Not legal advice/);
  }
  // past tense once the date has passed
  const c = ac.entry.changes[0];
  assert.match(plainChange(c, "2030-06-01", undefined, ac.entry).sentence, /^Ended on Jan 1, 2030: /);
  // a removed change whose end date is outside the source's window keeps the generic wording
  const other = { before_as_of: "2026-10-01", after_as_of: "2027-07-02" };
  assert.match(plainChange(c, AS_OF, undefined, other).sentence, /^This rule no longer shows for your address/);
  assert.equal(firstLine([c], "1 Test St", AS_OF, null, other), "Rules have changed at 1 Test St since Apr 1, 2024.");
});
