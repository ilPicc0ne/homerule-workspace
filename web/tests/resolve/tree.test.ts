import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureDir, slug } from "../helpers.ts";
import { treeFromGeographies, treeForJurisdiction, coverageOf } from "../../lib/resolve/tree.ts";
import type { CensusMatch } from "../../lib/resolve/census.ts";
import type { TreeLevel } from "../../lib/resolve/types.ts";

function firstMatch(q: string): CensusMatch {
  const rec = JSON.parse(readFileSync(join(fixtureDir, `${slug(q)}.json`), "utf8"));
  return rec.body.result.addressMatches[0];
}

const levels = (t: TreeLevel[]) => t.map((l) => `${l.level}:${l.name}:${l.covered ? "covered" : "not"}`);

test("SF: Federal › State › County › City, state and city covered", () => {
  const t = treeFromGeographies(firstMatch("3515 Fillmore St, San Francisco, CA").geographies);
  assert.deepEqual(levels(t), [
    "federal:United States:not",
    "state:California:covered",
    "county:San Francisco County:not",
    "municipality:San Francisco:covered",
  ]);
  assert.equal(t[3].id, "CA-SAN-FRANCISCO");
  assert.equal(t[2].id, "CA-SAN-FRANCISCO-COUNTY");
});

test("a CA county subdivision (CCD) is never a municipality", () => {
  const t = treeFromGeographies(firstMatch("3515 Fillmore St, San Francisco, CA").geographies);
  assert.ok(!t.some((l) => l.name.includes("CCD") || l.name.includes("Richmond")));
});

test("Dorchester address → Boston city", () => {
  const t = treeFromGeographies(firstMatch("471 Columbia Rd, Dorchester, MA").geographies);
  const city = t.find((l) => l.level === "municipality");
  assert.equal(city?.id, "MA-BOSTON");
  assert.equal(coverageOf(t), "covered");
});

test("East LA: postal Los Angeles but unincorporated; the county governs, not LA city", () => {
  const t = treeFromGeographies(firstMatch("4801 E 3rd St, Los Angeles, CA 90022").geographies);
  assert.ok(!t.some((l) => l.id === "CA-LOS-ANGELES"));
  const last = t[t.length - 1];
  assert.equal(last.level, "unincorporated");
  assert.equal(last.covered, false);
  assert.match(last.note ?? "", /Los Angeles County/);
  assert.equal(coverageOf(t), "state_only");
});

test("Brookline: no incorporated place → Brookline town (county subdivision), not the CDP", () => {
  const t = treeFromGeographies(firstMatch("333 Washington St, Brookline, MA").geographies);
  const m = t.filter((l) => l.level === "municipality");
  assert.equal(m.length, 1);
  assert.equal(m[0].name, "Brookline");
  assert.equal(m[0].label, "Town");
  assert.equal(m[0].covered, false);
  assert.equal(coverageOf(t), "state_only");
});

test("NJ township that is also a CDP: the township governs", () => {
  const t = treeFromGeographies(firstMatch("33 Washington St, Toms River, NJ").geographies);
  const m = t.filter((l) => l.level === "municipality");
  assert.equal(m.length, 1);
  assert.equal(m[0].label, "Township");
  assert.equal(m[0].name, "Toms River");
});

test("Montclair township (no CDP)", () => {
  const t = treeFromGeographies(firstMatch("205 Claremont Ave, Montclair, NJ").geographies);
  assert.equal(t[t.length - 1].label, "Township");
});

test("Santa Ana: covered city with no sample addresses", () => {
  const t = treeFromGeographies(firstMatch("20 Civic Center Plaza, Santa Ana, CA").geographies);
  assert.equal(t[t.length - 1].id, "CA-SANTA-ANA");
  assert.equal(coverageOf(t), "covered");
});

test("New York: tree shown, nothing covered", () => {
  const t = treeFromGeographies(firstMatch("350 5th Ave, New York, NY").geographies);
  assert.deepEqual(t.map((l) => l.name), ["United States", "New York", "New York County", "New York"]);
  assert.equal(coverageOf(t), "not_covered");
});

test("Washington DC: not a state in scope", () => {
  const t = treeFromGeographies(firstMatch("1600 Pennsylvania Ave NW, Washington, DC").geographies);
  assert.equal(coverageOf(t), "not_covered");
});

test("MA counties have no county government: the tree says so", () => {
  const t = treeFromGeographies(firstMatch("134 Oxford St, Cambridge, MA").geographies);
  const county = t.find((l) => l.level === "county");
  assert.match(county?.note ?? "", /no county government/i);
});

test("NJ/MA cities match by place and by county subdivision GEOID", () => {
  for (const [q, id] of [
    ["280 Grove St, Jersey City, NJ", "NJ-JERSEY-CITY"],
    ["920 Broad St, Newark, NJ", "NJ-NEWARK"],
    ["327 Jackson St, Hoboken, NJ 07017", "NJ-HOBOKEN"],
    ["134 Oxford St, Cambridge, MA", "MA-CAMBRIDGE"],
  ]) {
    const g = structuredClone(firstMatch(q).geographies);
    g["Incorporated Places"] = []; // drop the place: the county subdivision alone must still find the city
    const t = treeFromGeographies(g);
    assert.equal(t[t.length - 1].id, id, q);
  }
});

test("tree from the list: Boston and Los Angeles County", () => {
  assert.deepEqual(treeForJurisdiction("MA-BOSTON").map((l) => l.id), [null, "MA", "MA-SUFFOLK-COUNTY", "MA-BOSTON"]);
  assert.deepEqual(treeForJurisdiction("CA-LOS-ANGELES-COUNTY").map((l) => l.level), ["federal", "state", "county"]);
});

// Three states per level: rules in HomeRule · not covered (law exists, not in HomeRule) · no rules at this level.
const statuses = (t: TreeLevel[]) => t.map((l) => `${l.level}:${l.status}`);

test("federal: not covered, and the note says it applies everywhere", () => {
  const t = treeForJurisdiction("MA-BOSTON");
  assert.equal(t[0].status, "not_covered");
  assert.match(t[0].note ?? "", /everywhere/);
});

test("MA counties have no county government → no rules at this level, on both paths", () => {
  const viaList = treeForJurisdiction("MA-BOSTON");
  assert.deepEqual(statuses(viaList), ["federal:not_covered", "state:covered", "county:no_rules", "municipality:covered"]);
  assert.match(viaList[2].note ?? "", /no county government/i);
  const viaCensus = treeFromGeographies(firstMatch("134 Oxford St, Cambridge, MA").geographies);
  assert.equal(viaCensus.find((l) => l.level === "county")?.status, "no_rules");
});

test("LA County inside LA city: county rules cover unincorporated areas only → no rules at this level", () => {
  const t = treeForJurisdiction("CA-LOS-ANGELES");
  const county = t.find((l) => l.level === "county")!;
  assert.equal(county.status, "no_rules");
  assert.match(county.note ?? "", /unincorporated/);
});

test("East LA: LA County's own rules apply but aren't in HomeRule → not covered; no city level", () => {
  const t = treeFromGeographies(firstMatch("4801 E 3rd St, Los Angeles, CA 90022").geographies);
  const county = t.find((l) => l.level === "county")!;
  assert.equal(county.status, "not_covered");
  assert.match(county.note ?? "", /apply here/);
  assert.equal(t[t.length - 1].status, "no_rules");
});

test("SF: city and county are one government → county level has no rules of its own", () => {
  const t = treeFromGeographies(firstMatch("3515 Fillmore St, San Francisco, CA").geographies);
  assert.equal(t.find((l) => l.level === "county")?.status, "no_rules");
});

test("a county we haven't checked stays 'not covered' (Hudson County)", () => {
  const t = treeForJurisdiction("NJ-HOBOKEN");
  assert.equal(t.find((l) => l.level === "county")?.status, "not_covered");
});

test("covered mirrors status", () => {
  for (const id of ["MA-BOSTON", "CA-LOS-ANGELES", "NJ-NEWARK"]) for (const l of treeForJurisdiction(id)) assert.equal(l.covered, l.status === "covered");
});
