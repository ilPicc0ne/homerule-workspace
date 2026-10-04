// MCP website parity: each tool's fields equal what the page builder returns (lib/address-page-data.ts,
// lib/changes/*, lib/impact.ts, lib/jurisdiction-view.ts). Offline: Census answers from recorded fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureFetch, repoRoot } from "./helpers.ts";
import { addressPageData } from "../lib/address-page-data.ts";
import { TILE_STATUS_WORDS } from "../lib/address-view.ts";
import { changes } from "../lib/changes/data.ts";
import { changeLine, entryHeading, resultWords, ruleName } from "../lib/changes/wording.ts";
import { IMPACT_WORDS, impactCounts, ruleImpact } from "../lib/impact.ts";
import { jurisdictionPageData, rulesByQuestion } from "../lib/jurisdiction-view.ts";
import { datesLine, STATUS_WORDS } from "../lib/law.ts";
import { CAPS, getAddress, getChanges, getJurisdiction, getRule, getRules, INSTRUCTIONS, type ToolAnswer, type ToolDeps } from "../lib/mcp/tools.ts";
import { resolveQuery } from "../lib/resolve/resolve.ts";
import { sampleIndex } from "../lib/resolve/samples.ts";
import { flagGap, typedAddress } from "../lib/typed-address.ts";
import type { Dataset } from "../lib/types.ts";

const live = (f: string) => JSON.parse(readFileSync(join(repoRoot, "web/data/live", f), "utf8"));
const data: Dataset = {
  meta: live("meta.json"),
  rules: live("rules.json"),
  lookups: live("lookups.json"),
  addresses: live("addresses.json"),
  excerpts: live("excerpts.json"),
  findings: live("findings.json"),
};
const deps = (): ToolDeps => ({ data, resolve: { fetch: fixtureFetch(), samples: sampleIndex(), today: "2026-10-04" } });

/** SF, Hoboken 327 Jackson St, Newark. */
const SAMPLES = ["A0016", "A0256", "A0003"];
const TYPED = "4801 E 3rd St, Los Angeles, CA 90022";
const MAX_CHARS = 60_000;

function assertEnvelope(a: ToolAnswer) {
  assert.ok(!a.error, String(a.payload.error ?? ""));
  assert.equal(a.payload.not_legal_advice, true);
  assert.match(String(a.payload.as_of), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(String(a.payload.disclaimer), /Not legal advice/);
  assert.match(a.summary, /Not legal advice\.$/);
  // Our own words only (quotes are the law's words, and how_to_present names the banned words).
  assert.doesNotMatch(a.summary.replace(/"[^"]*"/g, ""), /\b(compliant|illegal)\b/i);
  assert.ok(JSON.stringify(a.payload).length < MAX_CHARS, `payload under ${MAX_CHARS} chars`);
}

type TopicOut = {
  topic: string;
  status: string;
  status_label: string;
  answer: string;
  explanation: string;
  notes: string[];
  missing_facts: unknown[];
  conflict: unknown;
  contact: { name: string; source_url: string; retrieved_at: string | null } | null;
  helpers: unknown[];
  next_steps: unknown[];
  rules: { rule_id: string; status: string; quote: string | null; citation: string; official_source: string | null; rule_page: string }[];
};

function assertAddressParity(a: ToolAnswer, core: ReturnType<typeof addressPageData>) {
  const p = a.payload as Record<string, unknown> & { topics: TopicOut[]; timeline: Record<string, unknown>; jurisdiction: Record<string, unknown> };
  assert.equal(p.topics.length, 6);
  core.view.tiles.forEach((t, i) => {
    const o = p.topics[i];
    assert.equal(o.topic, t.title);
    assert.equal(o.status, t.status);
    assert.equal(o.status_label, TILE_STATUS_WORDS[t.status]);
    assert.equal(o.answer, t.line);
    assert.equal(o.explanation, t.expl);
    assert.deepEqual(o.notes, t.notes.map((n) => n.text));
    assert.deepEqual(o.missing_facts, t.missing);
    assert.equal(!!o.conflict, !!t.flag);
    assert.deepEqual(o.helpers, t.helpers);
    assert.deepEqual(o.next_steps, t.next);
    assert.equal(o.contact?.name ?? null, t.contact?.name ?? null);
    if (o.contact) {
      assert.match(o.contact.source_url, /^https:\/\//);
      assert.match(String(o.contact.retrieved_at), /^\d{4}-\d{2}-\d{2}/);
    }
    assert.deepEqual(
      o.rules.map((r) => [r.rule_id, r.status, r.quote, r.citation, r.official_source]),
      t.rules.map((r) => [r.rule_id, r.stWord, r.quote, r.citation, r.sourceUrl]),
    );
    for (const r of o.rules) {
      const rule = data.rules.find((x) => x.rule_id === r.rule_id)!;
      assert.equal(r.quote, rule.quoted_span, "quote is the rule's verbatim span");
      assert.match(r.rule_page, /^https:\/\/yourhomerule\.com\/r\//);
    }
  });
  assert.deepEqual((p.timeline.coming_up as { rule_id: string }[]).map((e) => e.rule_id), core.view.future.map((e) => e.ruleId));
  assert.deepEqual((p.timeline.recently_changed as { rule_id: string }[]).map((e) => e.rule_id), core.view.past.map((e) => e.ruleId));
  assert.match(String(p.timeline.renter_impact), /no renter-impact verdict/);
  assert.deepEqual((p.proposed_bills as { rule_id: string }[]).map((b) => b.rule_id), core.view.proposed.map((b) => b.rule_id));
  assert.deepEqual(p.jurisdiction.crumb, core.hero.crumb);
  assert.equal(p.jurisdiction.where, core.hero.cap);
  assert.equal(p.jurisdiction.legal_vs_postal, core.hero.capSub);
  assert.deepEqual((p.building_facts as { shown: string[] }).shown, core.hero.facts.map((f) => f.text));
}

for (const id of SAMPLES) {
  test(`get_address ${id}: every tile, rule row, timeline item and the hero equal the address page's builder`, async () => {
    const a = await getAddress(deps(), { address_id: id });
    assertEnvelope(a);
    const address = data.addresses.find((x) => x.address_id === id)!;
    const core = addressPageData(data, address, data.lookups[data.meta.default_as_of][id]);
    assertAddressParity(a, core);
    assert.equal((a.payload.links as { page: string }).page, `https://yourhomerule.com/a/${id}`);
    if (core.changeLog) assert.equal((a.payload.links as { change_log: string }).change_log, `https://yourhomerule.com${core.changeLog.href}`);
  });
}

test("get_address by query of a sample address gives the sample's page", async () => {
  const a = await getAddress(deps(), { query: "327 Jackson St, Hoboken, NJ 07017" });
  assertEnvelope(a);
  assert.equal((a.payload.address as { address_id: string }).address_id, "A0256");
});

test("get_address typed (outside the 500): same provisional view as /a/at, labelled", async () => {
  const a = await getAddress(deps(), { query: TYPED });
  assertEnvelope(a);
  const r = await resolveQuery(TYPED, { fetch: fixtureFetch(), samples: sampleIndex(), today: "2026-10-04" });
  assert.equal(r.kind, "address");
  const t = typedAddress(r as Extract<typeof r, { kind: "address" }>, data.rules, TYPED)!;
  const core = addressPageData(data, t.address, t.results, { typed: true, legalNote: t.legalNote });
  flagGap(core.view, t.gap);
  assertAddressParity(a, core);
  const addr = a.payload.address as { typed: boolean; provisional: string; address_id: null };
  assert.equal(addr.typed, true);
  assert.equal(addr.address_id, null);
  assert.match(addr.provisional, /building fact is unknown/);
  assert.match(a.summary, /provisional/);
  assert.match(String((a.payload.links as { page: string }).page), /\/a\/at\?q=/);
});

test("get_address: a place, an uncovered address and bad input are answered, not thrown", async () => {
  const place = await getAddress(deps(), { query: "Hoboken, NJ" });
  assert.match(String(place.payload.next_step), /get_jurisdiction/);
  const out = await getAddress(deps(), { query: "350 5th Ave, New York, NY" });
  assert.equal(out.payload.not_legal_advice, true);
  assert.equal((await getAddress(deps(), {})).error, true);
  assert.equal((await getAddress(deps(), { address_id: "Z9999" })).error, true);
  assert.equal((await getAddress(deps(), { address_id: "A0016", as_of: "soon" })).error, true);
  const other = await getAddress(deps(), { address_id: "A0016", as_of: "2025-06-01" });
  assert.match(String(other.payload.as_of_note), /you asked for 2025-06-01/);
});

for (const id of SAMPLES) {
  test(`get_changes ${id}: the change log entries, in the page's words`, async () => {
    const a = await getChanges(deps(), { address_id: id });
    assertEnvelope(a);
    const rec = changes.addresses[id];
    type E = { when: string; title: string; changes: { rule_id: string; rule: string; change: string; before: string; after: string; quote: string | null; citation: string; link: string }[] };
    const entries = a.payload.entries as E[];
    assert.equal(entries.length, rec?.entries.length ?? 0);
    rec?.entries.forEach((e, i) => {
      assert.equal(entries[i].when, entryHeading(e));
      assert.equal(entries[i].title, e.title);
      assert.deepEqual(
        entries[i].changes.map((c) => [c.rule_id, c.rule, c.change, c.before, c.after, c.quote]),
        e.changes.map((c) => [c.team_rule_id, ruleName(c), changeLine(c), resultWords(c.before), resultWords(c.after), c.requirement_quote]),
      );
      for (const c of entries[i].changes) assert.match(c.link, new RegExp(`/changes/${id}#c-`));
    });
    assert.equal(a.payload.link, `https://yourhomerule.com/changes/${id}`);
  });
}

test("get_changes for Newark: aggregate over its sample addresses, grouped by rule, with affected counts", async () => {
  const a = await getChanges(deps(), { jurisdiction_id: "NJ-NEWARK" });
  assertEnvelope(a);
  const ids = Object.entries(changes.addresses).filter(([, x]) => x.jurisdictions.city === "NJ-NEWARK").map(([k]) => k);
  const perRule = new Map<string, Set<string>>();
  for (const id of ids) for (const e of changes.addresses[id].entries) for (const c of e.changes) perRule.set(c.team_rule_id, (perRule.get(c.team_rule_id) ?? new Set()).add(id));
  const out = a.payload.changes_by_rule as { rule_id: string; affected: number; example_address_ids: string[]; quote: string | null }[];
  assert.deepEqual(new Set(out.map((r) => r.rule_id)), new Set(perRule.keys()));
  for (const r of out) {
    assert.equal(r.affected, perRule.get(r.rule_id)!.size);
    assert.ok(r.example_address_ids.length <= CAPS.addressIds);
  }
  assert.equal(a.payload.sample_addresses, data.addresses.filter((x) => x.jurisdictions.city === "NJ-NEWARK").length);
  // A query for a place resolves to the same aggregate.
  const q = await getChanges(deps(), { query: "920 Broad St, Newark, NJ" });
  assert.deepEqual(q.payload.changes_by_rule, a.payload.changes_by_rule);
  assert.match(q.summary, /not one of HomeRule's sample addresses/);
});

test("get_changes: date window and bad input", async () => {
  // before the first change source (#71 adds Newark version ends from 2017-09-25)
  const none = await getChanges(deps(), { address_id: "A0003", to: "2017-01-01" });
  assert.equal((none.payload.entries as unknown[]).length, 0);
  assert.match(String(none.payload.empty), /No change recorded/);
  assert.equal((await getChanges(deps(), {})).error, true);
  assert.equal((await getChanges(deps(), { address_id: "A0003", jurisdiction_id: "NJ" })).error, true);
  assert.equal((await getChanges(deps(), { jurisdiction_id: "TX" })).error, true);
  assert.equal((await getChanges(deps(), { address_id: "A0003", from: "July" })).error, true);
});

test("get_rule: rule page fields and impact counts equal the rule page's builders", () => {
  for (const id of ["NJ-ALG-56:9-23", "CA-SAN-FRANCISCO-RENT-37.3"]) {
    const rule = data.rules.find((r) => r.rule_id === id)!;
    const a = getRule(deps(), { rule_id: id });
    assertEnvelope(a);
    const p = a.payload as Record<string, unknown> & { impact: { by_date: { date: string; counts: Record<string, number> }[] } };
    assert.equal(p.quote, rule.quoted_span);
    assert.equal(p.citation, rule.citation);
    assert.equal(p.dates, datesLine(rule, data.meta.default_as_of));
    assert.equal(p.covers, rule.coverage_in_words);
    assert.equal(p.exemptions, rule.exemptions);
    assert.equal(p.status_on_as_of, STATUS_WORDS[rule.status]);
    const imp = ruleImpact(data, rule, id.slice(0, 2));
    const d = data.meta.default_as_of;
    assert.deepEqual(
      p.impact.by_date.find((x) => x.date === d)!.counts,
      Object.fromEntries(impactCounts(imp.classes[d]).map((c) => [IMPACT_WORDS[c.cls], c.count])),
    );
    assert.equal(p.link, `https://yourhomerule.com/r/${encodeURIComponent(id)}`);
  }
  assert.equal(getRule(deps(), { rule_id: "NOPE" }).error, true);
});

test("get_jurisdiction: the six questions with the page's rules and statuses", () => {
  for (const id of ["CA-SAN-FRANCISCO", "NJ-HOBOKEN", "NJ-NEWARK", "NJ"]) {
    const a = getJurisdiction(deps(), { jurisdiction_id: id });
    assertEnvelope(a);
    const pd = jurisdictionPageData(data, id)!;
    const q = rulesByQuestion(pd.rules, data.meta.default_as_of);
    const out = a.payload.questions as { rules: { rule_id: string; status: string }[] }[];
    assert.deepEqual(
      out.map((x) => x.rules.map((r) => [r.rule_id, r.status])),
      q.map((x) => x.list.map(({ r, st }) => [r.rule_id, STATUS_WORDS[st]])),
    );
    assert.equal(a.payload.sample_addresses, pd.inPlace.length);
    assert.equal(a.payload.link, `https://yourhomerule.com/j/${id}`);
  }
  assert.equal(getJurisdiction(deps(), { jurisdiction_id: "TX" }).error, true);
});

test("get_rules stays available (compatibility alias)", () => {
  assertEnvelope(getRules(deps(), { jurisdiction_id: "NJ-NEWARK" }));
});

test("instructions name every tool and the presentation rules", () => {
  for (const t of ["find_place", "get_address", "get_changes", "get_rule", "get_jurisdiction"]) assert.match(INSTRUCTIONS, new RegExp(t));
  assert.match(INSTRUCTIONS, /flagged, not decided/);
  assert.match(INSTRUCTIONS, /not real law/);
  assert.match(INSTRUCTIONS, /provisional/);
});
