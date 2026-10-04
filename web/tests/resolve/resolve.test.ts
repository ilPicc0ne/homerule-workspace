// End-to-end: free text → result, the way /api/resolve and /where call it. Census answers from fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuery } from "../../lib/resolve/resolve.ts";
import { sampleIndex } from "../../lib/resolve/samples.ts";
import { fixtureFetch, hangingFetch, statusFetch } from "../helpers.ts";
import type { ResolveResult } from "../../lib/resolve/types.ts";

const run = (q: string, fetch = fixtureFetch()) => resolveQuery(q, { fetch, samples: sampleIndex() });

function as<K extends ResolveResult["kind"]>(r: ResolveResult, kind: K): Extract<ResolveResult, { kind: K }> {
  assert.equal(r.kind, kind, JSON.stringify(r, null, 1));
  return r as Extract<ResolveResult, { kind: K }>;
}

const lastId = (r: { tree: { id: string | null }[] }) => r.tree[r.tree.length - 1].id;

test("every result says not legal advice", async () => {
  for (const q of ["Boston, MA", "asdfgh", "3515 Fillmore St, San Francisco, CA"]) {
    assert.equal((await run(q)).not_legal_advice, true);
  }
});

// Place-only input goes through our list, never Census.
test("'Boston, MA' → Boston via the list, no Census call", async () => {
  const f = fixtureFetch();
  const r = as(await run("Boston, MA", f), "place");
  assert.equal(lastId(r), "MA-BOSTON");
  assert.equal(r.coverage, "covered");
  assert.equal(f.calls.length, 0);
});

test("'Dorchester' → Boston via alias, with a note", async () => {
  const r = as(await run("Dorchester"), "place");
  assert.equal(r.matched.via, "alias");
  assert.equal(lastId(r), "MA-BOSTON");
  assert.ok(r.notes.some((n) => n.includes("Dorchester") && n.includes("Boston")));
});

test("'SF' and 'san francisco' → San Francisco", async () => {
  assert.equal(lastId(as(await run("SF"), "place")), "CA-SAN-FRANCISCO");
  assert.equal(lastId(as(await run("san francisco"), "place")), "CA-SAN-FRANCISCO");
});

test("a county: 'Hudson County, NJ' lists its covered cities", async () => {
  const r = as(await run("Hudson County, NJ"), "place");
  assert.equal(lastId(r), "NJ-HUDSON-COUNTY");
  assert.deepEqual(r.children.map((c) => c.id).sort(), ["NJ-HOBOKEN", "NJ-JERSEY-CITY"]);
});

test("a state: 'California' covered, lists 5 cities", async () => {
  const r = as(await run("California"), "place");
  assert.equal(lastId(r), "CA");
  assert.equal(r.children.length, 5);
});

test("Santa Ana: covered without sample addresses", async () => {
  const r = as(await run("Santa Ana, CA"), "place");
  assert.equal(lastId(r), "CA-SANTA-ANA");
  assert.equal(r.coverage, "covered");
});

test("'90210' → California by ZIP, asks for the street", async () => {
  const f = fixtureFetch();
  const r = as(await run("90210", f), "place");
  assert.equal(r.matched.via, "zip");
  assert.equal(lastId(r), "CA");
  assert.ok(r.notes.some((n) => /street/i.test(n)));
  assert.equal(f.calls.length, 0);
});

test("'Austin, TX' → Texas, not covered", async () => {
  const r = as(await run("Austin, TX"), "place");
  assert.equal(r.coverage, "not_covered");
  assert.equal(r.tree[1].name, "Texas");
});

test("'Brookline, MA' (town not on the list) → state rules only", async () => {
  const r = as(await run("Brookline, MA"), "place");
  assert.equal(r.coverage, "state_only");
  assert.ok(r.notes.some((n) => n.includes("Brookline")));
});

test("nonsense → friendly not-found", async () => {
  const r = as(await run("asdfgh"), "not_found");
  assert.equal(r.reason, "unknown_place");
  assert.match(r.message, /3 states and 10 cities/);
});

test("empty → not-found", async () => {
  assert.equal(as(await run("  "), "not_found").reason, "empty");
});

// Street addresses go through Census.
test("SF address → covered tree from Census", async () => {
  const r = as(await run("3515 Fillmore St, San Francisco, CA"), "address");
  assert.equal(lastId(r), "CA-SAN-FRANCISCO");
  assert.equal(r.coverage, "covered");
});

test("East LA: postal LA, legal unincorporated; the note says LA city law does not apply", async () => {
  const r = as(await run("4801 E 3rd St, Los Angeles, CA 90022"), "address");
  assert.ok(!r.tree.some((l) => l.id === "CA-LOS-ANGELES"));
  assert.equal(r.coverage, "state_only");
  assert.ok(r.notes.some((n) => /City of Los Angeles/.test(n)));
});

test("Dorchester street address → Boston with a postal-city note", async () => {
  const r = as(await run("471 Columbia Rd, Dorchester, MA"), "address");
  assert.equal(lastId(r), "MA-BOSTON");
  assert.ok(r.notes.some((n) => n.includes("Dorchester")));
});

test("Brookline street address → Brookline town, state rules only", async () => {
  const r = as(await run("333 Washington St, Brookline, MA"), "address");
  assert.equal(r.tree[r.tree.length - 1].label, "Town");
  assert.equal(r.coverage, "state_only");
});

test("New York street address → tree shown, not covered", async () => {
  const r = as(await run("350 5th Ave, New York, NY"), "address");
  assert.equal(r.coverage, "not_covered");
});

test("wrong ZIP doesn't break it: Hoboken", async () => {
  assert.equal(lastId(as(await run("327 Jackson St, Hoboken, NJ 07017"), "address")), "NJ-HOBOKEN");
});

test("Census matched a different city than typed → warning, not silence", async () => {
  const r = as(await run("1 Main St, Los Angeles, CA"), "address");
  assert.ok(r.warnings.some((w) => /Los Angeles/.test(w)), JSON.stringify(r.warnings));
});

test("several matches in different towns → ambiguous with candidates", async () => {
  const r = as(await run("100 Main St, MA"), "ambiguous");
  assert.ok(r.candidates.length >= 2 && r.candidates.length <= 8);
  assert.equal(r.total, 50);
  const s = as(await run("100 Main St, Springfield"), "ambiguous");
  assert.ok(new Set(s.candidates.map((c) => c.state)).size > 1);
});

test("unknown street → friendly not-found with a city suggestion", async () => {
  const r = as(await run("1 Harmon Plaza, Weehawken, NJ"), "not_found");
  assert.equal(r.reason, "no_match");
  assert.match(r.message, /street/i);
});

test("Census timeout → unavailable, not a crash", async () => {
  const r = await resolveQuery("3515 Fillmore St, San Francisco, CA", { fetch: hangingFetch, timeoutMs: 50, retries: 0 });
  as(r, "unavailable");
});

test("Census 5xx → retried once, then unavailable", async () => {
  const f = statusFetch(503);
  const r = await resolveQuery("3515 Fillmore St, San Francisco, CA", { fetch: f, retries: 1, retryDelayMs: 1 });
  as(r, "unavailable");
  assert.equal(f.calls, 2);
});

test("Census 4xx → not-found, no retry", async () => {
  const f = statusFetch(400, '{"errors":["Specify House number and Street name."]}');
  const r = await resolveQuery("3515 Fillmore St, San Francisco, CA", { fetch: f, retries: 1, retryDelayMs: 1 });
  as(r, "not_found");
  assert.equal(f.calls, 1);
});

// The 500 sample addresses answer from the batch run, with building facts.
test("sample address unknown to Census still resolves, with facts: 10635 Sherman Grove Ave", async () => {
  const f = fixtureFetch();
  const r = as(await run("10635 Sherman Grove Ave, Los Angeles, CA", f), "address");
  assert.equal(r.source, "sample");
  assert.equal(lastId(r), "CA-LOS-ANGELES");
  assert.deepEqual(r.sample?.facts.built, { from: "1978-01-01", to: "1978-12-31" });
  assert.equal(f.calls.length, 0);
});

test("sample address typed loosely: '3515 fillmore street apt 4b san francisco ca 94123'", async () => {
  const r = as(await run("3515 fillmore street apt 4b san francisco ca 94123"), "address");
  assert.equal(r.source, "sample");
  assert.equal(r.sample?.address_id !== undefined, true);
});

test("sample with a neighbourhood postal city: 471 Columbia Rd, Dorchester → Boston, facts present", async () => {
  const r = as(await run("471 Columbia Rd, Dorchester, MA"), "address");
  assert.equal(lastId(r), "MA-BOSTON");
});

// Typed sample addresses answer from the sample file, never Census (the fixture fetch would throw).
for (const [q, id] of [
  ["4115 Lincoln Way, San Francisco", "A0271"],
  ["4115 LINCOLN WY", "A0271"],
  ["734 Jamaica Ct", "A0165"],
  ["10 Camelot Ct", "A0423"],
]) {
  test(`sample lookup: '${q}' → ${id} with facts, no Census call`, async () => {
    const f = fixtureFetch();
    const r = as(await run(q, f), "address");
    assert.equal(r.source, "sample");
    assert.equal(r.sample?.address_id, id);
    assert.ok(Array.isArray(r.sample?.assumptions));
    assert.ok(r.sample?.source_detail);
    assert.equal(f.calls.length, 0);
  });
}

// Fixture 10635-sherman-grove-avenue-sunland-ca.json is hand-made: the body is the batch run's live
// recording (engine/cache/census/1df65974e6b6e12e.json), only the echoed query is rewritten.
test("Census match that is a sample address → sample result with facts: 10635 Sherman Grove Avenue, Sunland", async () => {
  const f = fixtureFetch();
  const r = as(await run("10635 Sherman Grove Avenue, Sunland, CA", f), "address");
  assert.equal(f.calls.length, 1);
  assert.equal(r.source, "sample");
  assert.equal(r.sample?.address_id, "A0107");
  assert.equal(lastId(r), "CA-LOS-ANGELES");
  assert.deepEqual(r.sample?.facts.built, { from: "1978-01-01", to: "1978-12-31" });
});

// Wording: "X's rules apply" only when HomeRule covers X.
test("legal city not covered: the note doesn't say its rules apply (1 Main St → Watsonville)", async () => {
  const r = as(await run("1 Main St, Los Angeles, CA"), "address");
  const note = r.notes.find((n) => n.includes("Watsonville"));
  assert.ok(note, JSON.stringify(r.notes));
  assert.ok(!/rules apply/.test(note));
});

test("legal city covered: the note still says its rules apply (10 Camelot Ct, Brighton → Boston)", async () => {
  const r = as(await run("10 Camelot Ct, Brighton, MA"), "address");
  assert.ok(r.notes.some((n) => n.includes("Boston's rules apply")), JSON.stringify(r.notes));
});

test("a state or county on its own: state rules only, no local level", async () => {
  assert.equal(as(await run("California"), "place").coverage, "state_only");
  assert.equal(as(await run("Hudson County, NJ"), "place").coverage, "state_only");
  assert.equal(as(await run("Texas"), "place").coverage, "not_covered");
});

test("alias notes only for neighbourhoods, in the contract's casing", async () => {
  assert.deepEqual(as(await run("LA"), "place").notes, []);
  assert.deepEqual(as(await run("san fran"), "place").notes, []);
  assert.ok(as(await run("north hollywood"), "place").notes[0].startsWith("North Hollywood is part of Los Angeles"));
  assert.ok(as(await run("JAMAICA PLAIN"), "place").notes[0].startsWith("Jamaica Plain is part of Boston"));
});

// as_of on every payload (AGENTS.md): the resolution date, injectable for tests.
test("every result kind carries as_of", async () => {
  const today = "2026-10-04";
  const queries = ["Boston, MA", "asdfgh", "  ", "90210", "3515 Fillmore St, San Francisco, CA", "100 Main St, MA", "4115 LINCOLN WY"];
  for (const q of queries) {
    const r = await resolveQuery(q, { fetch: fixtureFetch(), samples: sampleIndex(), today });
    assert.equal(r.as_of, today, q);
  }
  const u = await resolveQuery("3515 Fillmore St, San Francisco, CA", { fetch: statusFetch(503), retries: 0, today });
  assert.equal(as(u, "unavailable").as_of, today);
  assert.match((await run("Boston, MA")).as_of, /^\d{4}-\d{2}-\d{2}$/);
});
