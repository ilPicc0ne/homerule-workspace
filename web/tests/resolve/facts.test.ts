import test from "node:test";
import assert from "node:assert/strict";
import { buildFacts, unitsFromDescription } from "../../lib/resolve/facts.ts";
import type { SampleRow } from "../../lib/resolve/types.ts";

function row(p: Partial<SampleRow>): SampleRow {
  return {
    address_id: "A9999",
    street_address: "1 TEST ST",
    postal_city: "Hoboken",
    state: "NJ",
    zip: "",
    year_built: "",
    units: "",
    use_code: "",
    use_description: "",
    source_dataset: "test",
    retrieved_at: "2026-10-01T22:50Z",
    ...p,
  };
}

test("year built becomes a whole-year date range", () => {
  const f = buildFacts(row({ year_built: "1926" }));
  assert.deepEqual(f.facts.built, { from: "1926-01-01", to: "1926-12-31" });
  assert.equal(f.source.built, "csv");
});

test("missing year → null, source none", () => {
  const f = buildFacts(row({}));
  assert.equal(f.facts.built, null);
  assert.equal(f.source.built, "none");
});

test("units from the CSV are exact", () => {
  const f = buildFacts(row({ state: "CA", units: "21", use_code: "A15", use_description: "Apartment 15 Units or more", source_dataset: "DataSF wv5m-vpq2 (2025 roll)" }));
  assert.deepEqual(f.facts.units, { min: 21, max: 21 });
  assert.equal(f.source.units, "csv");
});

test("NJ '3SB' is storeys and brick, never units; class 4C still means 5+", () => {
  assert.equal(unitsFromDescription("3SB"), null);
  assert.equal(unitsFromDescription("4S.B"), null);
  const f = buildFacts(row({ use_code: "4C", use_description: "3SB", source_dataset: "NJOGIS Parcels & MOD-IV Composite" }));
  assert.deepEqual(f.facts.units, { min: 5, max: null });
  assert.equal(f.source.units, "use_code");
});

test("NJ unit tokens: '3S-B-D-6U-H' → 6, '13B-93U-2C-G' → 93, '6S-B+F-45U-17G' → 45", () => {
  assert.deepEqual(unitsFromDescription("3S-B-D-6U-H"), { min: 6, max: 6 });
  assert.deepEqual(unitsFromDescription("13B-93U-2C-G"), { min: 93, max: 93 });
  assert.deepEqual(unitsFromDescription("6S-B+F-45U-17G"), { min: 45, max: 45 });
  assert.deepEqual(unitsFromDescription("10S-B-A-151U-HE"), { min: 151, max: 151 });
});

test("NJ parcels with two buildings give a range, not a guess", () => {
  assert.deepEqual(unitsFromDescription("3B-7U/4B-24U-G"), { min: 24, max: 31 });
  assert.deepEqual(unitsFromDescription("5B-64U/5B-64U-G"), { min: 64, max: 128 });
});

test("NJ glued tokens like '3SB2UG' are ambiguous and ignored", () => {
  assert.equal(unitsFromDescription("3SB2UG"), null);
  assert.equal(unitsFromDescription("USCB16UG"), null);
});

test("use-code ranges: Boston 'APT 7-30 UNITS', LA 'Five or more', Cambridge '>8-UNIT-APT'", () => {
  const b = buildFacts(row({ state: "MA", use_code: "A/112", use_description: "APT 7-30 UNITS", source_dataset: "Boston Property Assessment FY2026" }));
  assert.deepEqual(b.facts.units, { min: 7, max: 30 });
  assert.equal(b.source.units, "use_code");
  const la = buildFacts(row({ state: "CA", use_code: "0500", use_description: "Five or more apartments", source_dataset: "LA County eGIS parcels" }));
  assert.deepEqual(la.facts.units, { min: 5, max: null });
  const al = buildFacts(row({ state: "CA", use_code: "7700", use_description: "Alameda County use code (5+ units)", source_dataset: "Alameda County parcels" }));
  assert.deepEqual(al.facts.units, { min: 5, max: null });
});

test("switch off: use codes don't count as unit facts", () => {
  const f = buildFacts(row({ state: "MA", use_code: "A/112", use_description: "APT 7-30 UNITS", source_dataset: "Boston Property Assessment FY2026" }), { unitsFromUseCode: false });
  assert.equal(f.facts.units, null);
  assert.equal(f.source.units, "none");
});

test("A0227: CSV says 2 units, the description says 93 → null plus a review flag", () => {
  const f = buildFacts(row({ address_id: "A0227", year_built: "2010", units: "2", use_code: "4C", use_description: "13B-93U-2C-G", source_dataset: "NJOGIS Parcels & MOD-IV Composite" }));
  assert.equal(f.facts.units, null);
  assert.equal(f.source.units, "none");
  assert.ok(f.review.some((r) => r.includes("units")));
});

test("subsidised housing is flagged from the use description", () => {
  const f = buildFacts(row({ state: "MA", use_code: "A/125", use_description: "SUBSD HOUSING S- 8", source_dataset: "Boston Property Assessment FY2026" }));
  assert.equal(f.facts.subsidised, true);
  assert.equal(f.facts.use_class, "subsidised_housing");
  assert.deepEqual(f.facts.units, { min: 7, max: null }); // Boston land use A, see below
});

test("owner type and owner-occupied are always null", () => {
  const f = buildFacts(row({ units: "6" }));
  assert.equal(f.facts.owner_type, null);
  assert.equal(f.facts.owner_occupied, null);
});

// Subsidy needs explicit evidence; Boston use-code assumptions remain named.
const BOSTON = "Boston Property Assessment FY2026";

test("no affordability code in the record → subsidy unknown, even for apartments", () => {
  const f = buildFacts(row({ state: "CA", use_code: "0500", use_description: "Five or more apartments", source_dataset: "LA County eGIS parcels" }));
  assert.equal(f.facts.subsidised, null);
  assert.equal(f.source.subsidised, "none");
  assert.deepEqual(f.assumptions, []);
  assert.equal(f.source_detail.subsidised, null);
});

test("a row with no use code at all → subsidised stays null (nothing to read)", () => {
  const f = buildFacts(row({}));
  assert.equal(f.facts.subsidised, null);
  assert.equal(f.source.subsidised, "none");
  assert.deepEqual(f.assumptions, []);
});

test("'SUBSD HOUSING' and NJ 'AFFORDABL' → subsidised true from the use code, no assumption", () => {
  const b = buildFacts(row({ state: "MA", use_code: "A/125", use_description: "SUBSD HOUSING S- 8", source_dataset: BOSTON }));
  assert.equal(b.facts.subsidised, true);
  assert.equal(b.source.subsidised, "use_code");
  assert.ok(!b.assumptions.includes("no_recorded_affordability_restriction"));
  const nj = buildFacts(row({ address_id: "A0049", use_code: "4C", use_description: "3S-6U-AFFORDABL", source_dataset: "NJOGIS Parcels & MOD-IV Composite" }));
  assert.equal(nj.facts.subsidised, true);
  assert.equal(nj.source.subsidised, "use_code");
  assert.deepEqual(nj.facts.units, { min: 6, max: 6 });
  assert.deepEqual(nj.assumptions, []);
});

test("Boston land use A without a unit range → 7+, tagged boston_land_use_A_is_7_plus", () => {
  for (const [code, desc] of [["A/120", "LUXURY APARTMENT"], ["A/125", "SUBSD HOUSING S- 8"], ["A/118", "ELDERLY HOME"]]) {
    const f = buildFacts(row({ state: "MA", use_code: code, use_description: desc, source_dataset: BOSTON }));
    assert.deepEqual(f.facts.units, { min: 7, max: null }, desc);
    assert.equal(f.source.units, "use_code", desc);
    assert.ok(f.assumptions.includes("boston_land_use_A_is_7_plus"), desc);
    assert.match(f.source_detail.units ?? "", /A\/1\d\d/, desc);
  }
});

test("Boston 'APT 7-30 UNITS' keeps 7–30 and needs no assumption about units", () => {
  const f = buildFacts(row({ state: "MA", use_code: "A/112", use_description: "APT 7-30 UNITS", source_dataset: BOSTON }));
  assert.deepEqual(f.facts.units, { min: 7, max: 30 });
  assert.deepEqual(f.assumptions, []);
});

test("Boston 'ELDERLY HOME' → use_class apartment, tagged as an assumption", () => {
  const f = buildFacts(row({ state: "MA", use_code: "A/118", use_description: "ELDERLY HOME", source_dataset: BOSTON }));
  assert.equal(f.facts.use_class, "apartment");
  assert.equal(f.source.use_class, "assumption");
  assert.deepEqual(f.assumptions, ["boston_elderly_home_is_apartment", "boston_land_use_A_is_7_plus"]);
});

test("source_detail: short strings the engine's explanations can quote", () => {
  const sf = buildFacts(row({ state: "CA", year_built: "1926", units: "21", use_code: "A15", use_description: "Apartment 15 Units or more", source_dataset: "DataSF wv5m-vpq2 (2025 roll)" }));
  assert.equal(sf.source_detail.built, "year_built, DataSF wv5m-vpq2 (2025 roll)");
  assert.equal(sf.source_detail.units, "CSV units, DataSF wv5m-vpq2 (2025 roll)");
  assert.equal(sf.source_detail.use_class, "use code A15 'Apartment 15 Units or more'");
  const la = buildFacts(row({ state: "CA", use_code: "0500", use_description: "Five or more apartments", source_dataset: "LA County eGIS parcels" }));
  assert.equal(la.source_detail.units, "use code 0500 'Five or more apartments'");
  assert.equal(la.source_detail.built, null);
  const nj = buildFacts(row({ use_code: "4C", use_description: "3SB", source_dataset: "NJOGIS Parcels & MOD-IV Composite" }));
  assert.equal(nj.source_detail.units, "NJ class 4C (5+ units)");
  assert.equal(nj.source_detail.use_class, "NJ class 4C (apartments, 5+ units)");
});

test("the CSV-vs-use-code conflict rule is unchanged: null units, no detail, a review flag", () => {
  const f = buildFacts(row({ address_id: "A0227", year_built: "2010", units: "2", use_code: "4C", use_description: "13B-93U-2C-G", source_dataset: "NJOGIS Parcels & MOD-IV Composite" }));
  assert.equal(f.facts.units, null);
  assert.equal(f.source_detail.units, null);
  assert.ok(f.review.some((r) => r.includes("units")));
});
