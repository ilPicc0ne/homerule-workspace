// Renter-facing text on /where: place leads and plain-language review flags.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuery } from "../../lib/resolve/resolve.ts";
import { sampleIndex } from "../../lib/resolve/samples.ts";
import { factRows, placeLead, reviewText } from "../../lib/resolve/wording.ts";
import { fixtureFetch } from "../helpers.ts";
import type { PlaceResult } from "../../lib/resolve/types.ts";

const place = async (q: string) => (await resolveQuery(q, { fetch: fixtureFetch(), samples: sampleIndex() })) as PlaceResult;

test("state lead names the state and counts its cities", async () => {
  assert.equal(placeLead(await place("California")), "HomeRule has California state rules, and local rules for 5 cities here.");
});

test("county lead counts the cities in the county", async () => {
  assert.equal(placeLead(await place("Hudson County, NJ")), "HomeRule has New Jersey state rules, and local rules for 2 cities in this county.");
});

test("no special lead for a city, a ZIP, or a town not on the list", async () => {
  assert.equal(placeLead(await place("Boston, MA")), null);
  assert.equal(placeLead(await place("90210")), null);
  assert.equal(placeLead(await place("Brookline, MA")), null);
});

test("facts panel: missing subsidy is unknown and use-class assumptions remain labelled", async () => {
  const r = await resolveQuery("4115 LINCOLN WY", { fetch: fixtureFetch(), samples: sampleIndex() });
  assert.equal(r.kind, "address");
  const rows = factRows(r.kind === "address" ? r.sample! : (null as never));
  assert.deepEqual(rows.find(([k]) => k === "Subsidised"), ["Subsidised", "Unknown", "not in the data"]);
  const base = r.kind === "address" ? r.sample! : (null as never);
  const assumedUse = factRows({ ...base, source: { ...base.source, use_class: "assumption" } });
  assert.equal(assumedUse.find(([k]) => k === "Use")?.[2], "assumed");
  const unknown = factRows({ ...base, facts: { ...base.facts, subsidised: null }, source: { ...base.source, subsidised: "none" } });
  assert.deepEqual(unknown.find(([k]) => k === "Subsidised")?.slice(0, 2), ["Subsidised", "Unknown"]);
});

test("review strings become plain language", () => {
  const unknownUnits = { units: null, built: null };
  assert.deepEqual(reviewText(["units: CSV says 15, but Apartment 5 to 14 Units says 5–14"], unknownUnits), [
    "The property records disagree on the number of units, so it's shown as unknown.",
  ]);
  assert.deepEqual(reviewText(['built: unreadable year "19x7"'], unknownUnits), [
    "The year built in the property record can't be read, so it's shown as unknown.",
  ]);
  const j = reviewText(["jurisdiction: Census found no match; city from the postal city", "jurisdiction: no house number; city from the postal city"], unknownUnits);
  assert.equal(j.length, 1);
  assert.ok(!/Census found|CSV/.test(j[0]));
  for (const t of [...j, ...reviewText(["units: x"], unknownUnits)]) assert.ok(!t.includes(":"), t);
});
