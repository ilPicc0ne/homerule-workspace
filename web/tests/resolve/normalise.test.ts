import test from "node:test";
import assert from "node:assert/strict";
import { normaliseStreet, streetKey } from "../../lib/resolve/normalise.ts";

// Batch traps from lab/geocode-500 and the sample CSV.
const cases: [string, string | null][] = [
  ["397 05TH AV", "397 5TH AVE"], // leading-zero ordinal, AV
  ["5164 03RD ST", "5164 3RD ST"],
  ["600 JACKSON/601 HARRISON", "600 JACKSON"], // double address: first one
  ["238 & 242 GARFIELD AVE.", "238 GARFIELD AVE"],
  ["322-322.5 Western Ave", "322 WESTERN AVE"], // range
  ["14.5-16 Vandine St", "14 VANDINE ST"],
  ["1850-1848 COMMONWEALTH AV", "1850 COMMONWEALTH AVE"],
  ["38-38- SOMME ST", "38 SOMME ST"],
  ["Harvard ST LOT 2A-13", null], // lot suffix, and no house number
  ["17106 CHATSWORTH ST   APT 0001", "17106 CHATSWORTH ST"],
  ["128 ST. PAULS AVE.", "128 ST PAULS AVE"],
  ["342-344 IRVINE TURNER BLV", "342 IRVINE TURNER BLVD"],
  ["335A Harvard St", "335A HARVARD ST"],
  ["WILLOWWOOD ST", null],
  ["AUBURN DR", null],
  ["3515 Fillmore St", "3515 FILLMORE ST"],
];

for (const [raw, want] of cases) {
  test(`normaliseStreet("${raw}")`, () => {
    assert.equal(normaliseStreet(raw).street, want);
  });
}

test("normaliseStreet reports what it changed", () => {
  const n = normaliseStreet("600 JACKSON/601 HARRISON");
  assert.ok(n.changes.some((c) => c.includes("double address")));
});

test("streetKey makes typed and recorded streets comparable", () => {
  assert.equal(streetKey("3515 Fillmore Street"), streetKey("3515 FILLMORE ST"));
  assert.equal(streetKey("10635 Sherman Grove Avenue"), streetKey("10635 SHERMAN GROVE AVE"));
  assert.equal(streetKey("1031 Clinton St."), streetKey("1031-1035 CLINTON ST"));
  assert.notEqual(streetKey("3515 Fillmore St"), streetKey("3517 Fillmore St"));
});
