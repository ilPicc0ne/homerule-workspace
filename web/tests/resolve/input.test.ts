import test from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../../lib/resolve/input.ts";

test("empty input", () => {
  assert.equal(parseInput("   ").kind, "empty");
});

test("ZIP only", () => {
  const p = parseInput("90210");
  assert.equal(p.kind, "zip");
  assert.equal(p.zip, "90210");
});

test("street address with commas", () => {
  const p = parseInput("327 Jackson St, Hoboken, NJ 07017");
  assert.equal(p.kind, "address");
  assert.equal(p.street, "327 Jackson St");
  assert.equal(p.city, "Hoboken");
  assert.equal(p.state?.abbr, "NJ");
  assert.equal(p.zip, "07017");
});

test("street address without commas keeps state and ZIP, city unknown", () => {
  const p = parseInput("3515 fillmore street apt 4b san francisco ca 94123");
  assert.equal(p.kind, "address");
  assert.equal(p.state?.abbr, "CA");
  assert.equal(p.zip, "94123");
  assert.equal(p.city, null);
});

test("place only: city and state", () => {
  const p = parseInput("Boston, MA");
  assert.equal(p.kind, "place");
  assert.equal(p.place, "Boston");
  assert.equal(p.state?.abbr, "MA");
});

test("place only: state name without comma", () => {
  const p = parseInput("boston massachusetts");
  assert.equal(p.kind, "place");
  assert.equal(p.place, "boston");
  assert.equal(p.state?.abbr, "MA");
});

test("place only: neighbourhood", () => {
  const p = parseInput("Dorchester");
  assert.equal(p.kind, "place");
  assert.equal(p.place, "Dorchester");
  assert.equal(p.state, null);
});

test("an ordinal street name is not a house number", () => {
  assert.equal(parseInput("1st Ave").kind, "place");
});

test("a state on its own", () => {
  const p = parseInput("New Jersey");
  assert.equal(p.kind, "place");
  assert.equal(p.place, "");
  assert.equal(p.state?.abbr, "NJ");
});

// A trailing "Ct"/"Wy" after a street is a street suffix (Court, Way), not Connecticut or Wyoming.
for (const q of ["4115 LINCOLN WY", "734 Jamaica Ct", "10 Camelot Ct"]) {
  test(`'${q}': trailing suffix is not read as a state`, () => {
    const p = parseInput(q);
    assert.equal(p.kind, "address");
    assert.equal(p.state, null);
    assert.equal(p.street, q);
  });
}

test("a suffix-like state still counts when a ZIP follows it or commas separate it", () => {
  assert.equal(parseInput("10 Main St Hartford CT 06103").state?.abbr, "CT");
  assert.equal(parseInput("10 Main St, Hartford, CT").state?.abbr, "CT");
  assert.equal(parseInput("boston ma").state?.abbr, "MA");
});
