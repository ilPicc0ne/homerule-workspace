// MCP tools (lib/mcp/tools.ts): thin wrappers over the resolver and the live data. Offline: Census
// answers come from the recorded fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureFetch, repoRoot } from "./helpers.ts";
import { coverage, findPlace, getRules, HOW_TO_PRESENT, INSTRUCTIONS, type ToolAnswer, type ToolDeps } from "../lib/mcp/tools.ts";
import { sampleIndex } from "../lib/resolve/samples.ts";
import type { Dataset } from "../lib/types.ts";

const live = (f: string) => JSON.parse(readFileSync(join(repoRoot, "web/data/live", f), "utf8"));
const data: Dataset = {
  meta: live("meta.json"),
  rules: live("rules.json"),
  lookups: live("lookups.json"),
  addresses: live("addresses.json"),
  excerpts: {},
  findings: live("findings.json"),
};
const deps = (): ToolDeps => ({ data, resolve: { fetch: fixtureFetch(), samples: sampleIndex(), today: "2026-10-04" } });

function assertEnvelope(a: ToolAnswer) {
  const p = a.payload;
  assert.equal(p.not_legal_advice, true);
  assert.match(String(p.as_of), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.retrieved, "retrieved dates");
  assert.match(String(p.how_to_present), /never say compliant or illegal/);
  assert.match(String(p.disclaimer), /Not legal advice/);
  const text = `${a.summary} ${JSON.stringify(p)}`;
  assert.doesNotMatch(a.summary, /\b(compliant|illegal)\b/i);
  assert.ok(text.length > 0);
}

test("find_place: a sample address gives its address_id, legal city and a link to its page", async () => {
  const a = await findPlace(deps(), "471 Columbia Rd, Dorchester, MA");
  assertEnvelope(a);
  assert.equal(a.payload.sample_address_id, "A0258");
  assert.equal(a.payload.legal_city, "Boston");
  assert.equal(a.payload.rules_jurisdiction_id, "MA-BOSTON");
  assert.equal(a.payload.link, "https://yourhomerule.com/a/A0258");
  assert.match(a.summary, /postal city is Dorchester, but the legal city is Boston/);
  assert.equal(a.log.address_id, "A0258");
  assert.ok(!("query" in a.log), "no query text in the audit log");
});

test("find_place: a covered city address that isn't a sample points to the city rules", async () => {
  const a = await findPlace(deps(), "280 Grove St, Jersey City, NJ");
  assertEnvelope(a);
  assert.equal(a.payload.coverage, "covered");
  assert.equal(a.payload.sample_address_id, null);
  assert.equal(a.payload.rules_jurisdiction_id, "NJ-JERSEY-CITY");
  assert.match(String(a.payload.link), /\/a\/at\?q=/);
});

test("find_place: an uncovered place says so and gives no jurisdiction to query", async () => {
  const a = await findPlace(deps(), "Austin, TX");
  assertEnvelope(a);
  assert.equal(a.payload.coverage, "not_covered");
  assert.equal(a.payload.rules_jurisdiction_id, null);
  assert.match(a.summary, /does not cover/);
});

test("find_place: an over-long query is a tool error", async () => {
  const a = await findPlace(deps(), "x".repeat(201));
  assert.equal(a.error, true);
  assert.equal(a.payload.not_legal_advice, true);
});

test("get_rules by address_id: the same results as /api/address/[id], with link", () => {
  const a = getRules(deps(), { address_id: "A0016" });
  assertEnvelope(a);
  assert.equal(a.payload.as_of, data.meta.default_as_of);
  const results = a.payload.results as { rule_id: string; result: string; rule?: { quoted_span: string | null } }[];
  assert.deepEqual(
    results.map((r) => r.rule_id),
    data.lookups[data.meta.default_as_of].A0016.map((r) => r.rule_id),
  );
  assert.ok(results.some((r) => r.rule_id === "CA-SAN-FRANCISCO-RENT-37.3" && r.result === "applies"));
  assert.equal(a.payload.link, "https://yourhomerule.com/a/A0016");
});

type ContactOut = { category: string; topic: string; name: string; phone: string | null; url: string; checked: boolean; check_note?: string; source_url: string };

test("get_rules by address_id: per-topic contacts as on the address page, also in the text summary", () => {
  const a = getRules(deps(), { address_id: "A0016" });
  assertEnvelope(a);
  assert.match(a.summary, /Not legal advice\.$/);
  const contacts = a.payload.contacts as ContactOut[];
  const rent = contacts.find((c) => c.category === "rent_increase_limits");
  assert.ok(rent, "SF rent topic has a contact");
  assert.equal(rent.name, "San Francisco Rent Board");
  assert.equal(rent.checked, false);
  assert.match(String(rent.check_note), /not yet checked by us/);
  assert.match(rent.source_url, /^https:\/\//);
  // Only topics in the answer, each once.
  const cats = new Set((a.payload.results as { rule_id: string }[]).map((r) => data.rules.find((x) => x.rule_id === r.rule_id)!.category));
  assert.deepEqual(new Set(contacts.map((c) => c.category)), cats);
  assert.match(a.summary, /To confirm before acting, ask: .*San Francisco Rent Board/);
  assert.match(a.summary, /not yet checked by us/);
});

test("get_rules by jurisdiction carries contacts too; state-only answers use state contacts", () => {
  const sf = getRules(deps(), { jurisdiction_id: "CA-SAN-FRANCISCO" });
  assert.equal((sf.payload.contacts as ContactOut[]).find((c) => c.category === "rent_increase_limits")?.name, "San Francisco Rent Board");
  const ca = getRules(deps(), { jurisdiction_id: "CA" });
  assertEnvelope(ca);
  const names = new Set((ca.payload.contacts as ContactOut[]).map((c) => c.name));
  assert.ok(!names.has("San Francisco Rent Board"));
  assert.match(ca.summary, /To confirm before acting, ask:/);
});

test("instructions: end with not legal advice, point to the topic contact, no ranking, old rules kept", () => {
  for (const t of [HOW_TO_PRESENT, INSTRUCTIONS]) {
    assert.match(t, /End every answer with: 'Not legal advice\.'/);
    assert.match(t, /confirm with the contact HomeRule returns for that topic/);
    assert.match(t, /not yet checked, say so/);
    assert.match(t, /Don't rank places or say one is better protected; report each address's rules side by side/);
    assert.match(t, /Quote the law and give its date/);
    assert.match(t, /never say compliant or illegal/);
    assert.match(t, /compare the user's own numbers/);
  }
  assert.match(INSTRUCTIONS, /never fill a gap from memory/);
});

test("get_rules by address_id names the missing facts when a result is unknown", () => {
  const a = getRules(deps(), { address_id: "A0107" });
  const results = a.payload.results as { result: string }[];
  assert.ok(results.some((r) => r.result === "unknown"));
  assert.match(a.summary, /unknown/);
});

test("get_rules by jurisdiction: state + city stack, verbatim quotes, status changes with as_of", () => {
  const before = getRules(deps(), { jurisdiction_id: "CA-SAN-FRANCISCO", as_of: "2025-06-01" });
  const after = getRules(deps(), { jurisdiction_id: "CA-SAN-FRANCISCO", as_of: "2026-10-01" });
  assertEnvelope(before);
  assert.equal(before.payload.as_of, "2025-06-01");
  type Entry = { rule_id: string; jurisdiction_id: string; status_on_as_of: string; quote: string | null; citation: string; source_url: string | null };
  const rb = before.payload.rules as Entry[];
  const ra = after.payload.rules as Entry[];
  assert.deepEqual(new Set(rb.map((r) => r.jurisdiction_id)), new Set(["CA", "CA-SAN-FRANCISCO"]));
  // AB 325 (pricing algorithms): enacted, in force from 2026-01-01.
  assert.equal(rb.find((r) => r.rule_id === "CA-ALG-16729")?.status_on_as_of, "not_yet_effective");
  assert.equal(ra.find((r) => r.rule_id === "CA-ALG-16729")?.status_on_as_of, "in_force");
  for (const r of ra) {
    const rule = data.rules.find((x) => x.rule_id === r.rule_id)!;
    assert.equal(r.quote, rule.quoted_span, "quote is the rule's verbatim span");
    assert.equal(r.citation, rule.citation);
  }
  assert.equal(after.payload.link, "https://yourhomerule.com/j/CA-SAN-FRANCISCO");
});

test("get_rules by address with an as_of the engine didn't compute says which date it answers for", () => {
  const a = getRules(deps(), { address_id: "A0016", as_of: "2025-06-01" });
  assert.equal(a.payload.as_of, data.meta.default_as_of);
  assert.match(String(a.payload.as_of_note), /you asked for 2025-06-01/);
  const alg = (a.payload.results as { rule_id: string; rule_status_on_requested_date?: string }[]).find((r) => r.rule_id === "CA-ALG-16729");
  if (alg) assert.equal(alg.rule_status_on_requested_date, "not_yet_effective");
});

test("get_rules: bad input is a tool error, not a throw", () => {
  assert.equal(getRules(deps(), {}).error, true);
  assert.equal(getRules(deps(), { address_id: "A0016", jurisdiction_id: "CA" }).error, true);
  assert.equal(getRules(deps(), { address_id: "Z9999" }).error, true);
  assert.equal(getRules(deps(), { jurisdiction_id: "TX" }).error, true);
  assert.equal(getRules(deps(), { jurisdiction_id: "CA", as_of: "June 2025" }).error, true);
});

test("coverage: 3 states, 10 cities, as-of date, what's not covered", () => {
  const a = coverage(deps());
  assertEnvelope(a);
  const states = a.payload.states as { cities: unknown[] }[];
  assert.equal(states.length, 3);
  assert.equal(states.flatMap((s) => s.cities).length, 10);
  assert.ok((a.payload.not_covered as string[]).length >= 3);
  assert.match(a.summary, /Data as of \d{4}-\d{2}-\d{2}/);
});
