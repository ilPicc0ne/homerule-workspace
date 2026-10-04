// The batch run over all 500 sample addresses, offline from the committed Census cache (engine/cache/census).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureDir, repoRoot, slug } from "../helpers.ts";
import { resolveAll, readSampleCsv, SAMPLE_CSV, OUT_FILE } from "../../scripts/resolve-batch.ts";
import { resolveSampleRow } from "../../lib/resolve/batch.ts";
import type { CensusMatch } from "../../lib/resolve/census.ts";
import type { ResolvedAddress, SampleRow } from "../../lib/resolve/types.ts";

const rows = readSampleCsv(join(repoRoot, SAMPLE_CSV));
const file = await resolveAll(rows, { mode: "offline" });
const byId = new Map<string, ResolvedAddress>(file.addresses.map((a) => [a.address_id, a]));

const BOSTON_NEIGHBOURHOODS = ["Dorchester", "Roxbury", "East Boston", "Brighton", "Allston", "South Boston", "Jamaica Plain", "Hyde Park", "Mattapan"];

test("500/500 addresses resolved to a covered city", () => {
  assert.equal(file.count, 500);
  assert.equal(file.addresses.length, 500);
  for (const a of file.addresses) {
    assert.ok(a.jurisdictions.city, `${a.address_id} has no city`);
    assert.ok(a.stack.includes(a.jurisdictions.state), a.address_id);
  }
});

test("all 37 Boston-neighbourhood rows → Boston", () => {
  const rows = file.addresses.filter((a) => BOSTON_NEIGHBOURHOODS.includes(a.postal_city));
  assert.equal(rows.length, 37);
  for (const a of rows) {
    assert.equal(a.jurisdictions.city, "MA-BOSTON", a.address_id);
    assert.equal(a.postal_differs, true, a.address_id);
  }
});

test("San Ysidro → San Diego", () => {
  const a = file.addresses.find((x) => x.postal_city === "San Ysidro");
  assert.equal(a?.jurisdictions.city, "CA-SAN-DIEGO");
});

test("no NJ row is ever sent to Census with its ZIP (owners' mailing ZIPs)", () => {
  const nj = file.addresses.filter((a) => a.input.state === "NJ");
  assert.equal(nj.length, 140);
  for (const a of nj) for (const t of a.census.attempts) assert.equal(t.zip_sent, false, a.address_id);
});

test("A0009: '322-322.5 Western Ave' (matched in Boston by the lab run) → Cambridge once the range is normalised", () => {
  const a = byId.get("A0009")!;
  assert.equal(a.normalised_street, "322 WESTERN AVE");
  assert.equal(a.jurisdictions.city, "MA-CAMBRIDGE");
  assert.equal(a.source.jurisdiction, "census");
});

// The contradiction rule, with Census answers swapped in: real responses for other addresses.
const geographiesOf = (q: string) =>
  JSON.parse(readFileSync(join(fixtureDir, `${slug(q)}.json`), "utf8")).body.result.addressMatches as CensusMatch[];
const row = (p: Partial<SampleRow>): SampleRow => ({
  address_id: "T0001", street_address: "1 TEST ST", postal_city: "Cambridge", state: "MA", zip: "",
  year_built: "", units: "", use_code: "", use_description: "", source_dataset: "test", retrieved_at: "2026-10-01T22:50Z", ...p,
});

test("Census city contradicting a city-name postal city is rejected: Cambridge row matched in Boston", async () => {
  const a = await resolveSampleRow(row({}), { geocode: async () => geographiesOf("471 Columbia Rd, Dorchester, MA") });
  assert.equal(a.jurisdictions.city, "MA-CAMBRIDGE");
  assert.equal(a.source.jurisdiction, "postal_city");
  assert.equal(a.census.attempts[0].rejected_city, "MA-BOSTON");
  assert.equal(a.coords, null);
  assert.ok(a.confidence.jurisdiction <= 0.8);
  assert.ok(a.review.some((r) => r.startsWith("jurisdiction:")));
});

test("postal 'Los Angeles' but Census says unincorporated (East LA) → rejected for a sample row, flagged", async () => {
  const a = await resolveSampleRow(row({ postal_city: "Los Angeles", state: "CA", zip: "90022" }), {
    geocode: async () => geographiesOf("4801 E 3rd St, Los Angeles, CA 90022"),
  });
  assert.equal(a.jurisdictions.city, "CA-LOS-ANGELES");
  assert.equal(a.census.attempts.length, 2); // with ZIP, then without
  assert.ok(a.review.length > 0);
});

test("a neighbourhood postal city trusts Census", async () => {
  const a = await resolveSampleRow(row({ postal_city: "Dorchester" }), { geocode: async () => geographiesOf("471 Columbia Rd, Dorchester, MA") });
  assert.equal(a.jurisdictions.city, "MA-BOSTON");
  assert.equal(a.source.jurisdiction, "census");
  assert.equal(a.postal_differs, true);
});

test("NJ rows: the ZIP is never passed to Census", async () => {
  const seen: (string | undefined)[] = [];
  await resolveSampleRow(row({ postal_city: "Hoboken", state: "NJ", zip: "07017" }), {
    geocode: async (q) => (seen.push(q.zip), geographiesOf("327 Jackson St, Hoboken, NJ 07017")),
  });
  assert.deepEqual(seen, [undefined]);
});

test("A0227: conflicting unit counts → null plus a review flag", () => {
  const a = byId.get("A0227")!;
  assert.equal(a.facts.units, null);
  assert.ok(a.review.some((r) => r.includes("units")));
});

test("NJ '3SB' rows never get units from the storey count", () => {
  const rows3sb = file.addresses.filter((a) => {
    const csv = rows.find((r) => r.address_id === a.address_id)!;
    return csv.use_description === "3SB";
  });
  assert.ok(rows3sb.length >= 11);
  for (const a of rows3sb) assert.deepEqual(a.facts.units, { min: 5, max: null }, a.address_id); // class 4C, not "3"
});

test("unit sources are tagged csv / use_code / none", () => {
  const n = (s: string) => file.addresses.filter((a) => a.source.units === s).length;
  assert.equal(n("csv") + n("use_code") + n("none"), 500);
  assert.ok(n("use_code") > 100);
});

const csvRow = (id: string) => rows.find((r) => r.address_id === id)!;

test("subsidised: known on every row; true only for SUBSD HOUSING and NJ AFFORDABL (27), else false by assumption", () => {
  const sub = file.addresses.filter((a) => a.facts.subsidised === true);
  assert.equal(file.addresses.filter((a) => a.facts.subsidised === null).length, 0);
  assert.equal(sub.length, 27);
  assert.ok(sub.some((a) => a.address_id === "A0049"));
  for (const a of sub) assert.equal(a.source.subsidised, "use_code", a.address_id);
  for (const a of file.addresses.filter((x) => x.facts.subsidised === false)) {
    assert.equal(a.source.subsidised, "assumption", a.address_id);
    assert.ok(a.assumptions.includes("no_recorded_affordability_restriction"), a.address_id);
  }
});

test("Boston land use A rows all carry units ≥ 7; those without a range are tagged boston_land_use_A_is_7_plus", () => {
  const boston = file.addresses.filter((a) => csvRow(a.address_id).use_code.startsWith("A/"));
  assert.equal(boston.length, 60);
  for (const a of boston) {
    assert.ok(a.facts.units && a.facts.units.min >= 7, a.address_id);
    assert.equal(a.assumptions.includes("boston_land_use_A_is_7_plus"), !/APT 7-30/.test(csvRow(a.address_id).use_description), a.address_id);
  }
  assert.equal(byId.get("A0093")!.facts.use_class, "apartment"); // ELDERLY HOME
});

test("every record carries sorted, unique assumptions and a source_detail per fact", () => {
  for (const a of file.addresses) {
    assert.deepEqual(a.assumptions, [...new Set(a.assumptions)].sort(), a.address_id);
    assert.deepEqual(Object.keys(a.source_detail).sort(), ["built", "subsidised", "units", "use_class"]);
    if (a.facts.units) assert.ok(a.source_detail.units, a.address_id);
    if (a.facts.built) assert.ok(a.source_detail.built, a.address_id);
  }
});

test("A0227, A0041, A0398: CSV vs use code contradiction still → null units plus a review flag", () => {
  for (const id of ["A0227", "A0041", "A0398"]) {
    const a = byId.get(id)!;
    assert.equal(a.facts.units, null, id);
    assert.ok(a.review.some((r) => r.startsWith("units:")), id);
  }
});

test("rows without a house number fall back to the postal city, coords null", () => {
  for (const id of ["A0098", "A0128", "A0346"]) {
    const a = byId.get(id)!;
    assert.equal(a.normalised_street, null);
    assert.equal(a.coords, null);
    assert.ok(a.jurisdictions.city);
    assert.ok(a.confidence.jurisdiction < 0.95);
  }
});

test("every record carries owner_type null and a retrieval date", () => {
  for (const a of file.addresses) {
    assert.equal(a.facts.owner_type, null);
    assert.ok(a.retrieved_at);
  }
});

test("deterministic: the committed out/addresses.resolved.json equals a fresh offline run", () => {
  const committed = JSON.parse(readFileSync(join(repoRoot, OUT_FILE), "utf8"));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(file)));
});
