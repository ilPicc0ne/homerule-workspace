// OSM building footprints matched to the street-interpolated Census geocode (#64).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import {
  MAX_MATCH_M,
  compactRing,
  distanceToRing,
  heightFromTags,
  pickFootprint,
  pointInRing,
  ringCentroid,
  type LonLat,
} from "../lib/footprint.ts";

// ~20 m × 20 m square near Hoboken (1e-4° lat ≈ 11 m, 1e-4° lon ≈ 8.4 m at 40.7°).
const sq = (lon: number, lat: number, d = 0.00024): LonLat[] => [
  [lon, lat],
  [lon + d, lat],
  [lon + d, lat + d * 0.75],
  [lon, lat + d * 0.75],
  [lon, lat],
];

test("point in ring", () => {
  const r = sq(-74.041, 40.738);
  assert.equal(pointInRing([-74.0409, 40.7381], r), true);
  assert.equal(pointInRing([-74.0405, 40.7381], r), false);
});

test("distance to ring is 0 inside and metres outside", () => {
  const r = sq(-74.041, 40.738);
  assert.equal(distanceToRing([-74.0409, 40.7381], r), 0);
  // 0.0001° south of the bottom edge ≈ 11.1 m.
  const d = distanceToRing([-74.0409, 40.7379], r);
  assert.ok(Math.abs(d - 11.1) < 0.3, `got ${d}`);
});

test("centroid of a square is its middle", () => {
  const [lon, lat] = ringCentroid(sq(-74.041, 40.738));
  assert.ok(Math.abs(lon - -74.04088) < 1e-7 && Math.abs(lat - 40.73809) < 1e-7);
});

test("height: OSM height, else levels × 3 m, else 12 m", () => {
  assert.deepEqual(heightFromTags({ height: "21.5" }), { height_m: 21.5, height_src: "height" });
  assert.deepEqual(heightFromTags({ "building:levels": "4" }), { height_m: 12, height_src: "levels" });
  assert.deepEqual(heightFromTags({ height: "nope", "building:levels": "5" }), { height_m: 15, height_src: "levels" });
  assert.deepEqual(heightFromTags(undefined), { height_m: 12, height_src: "default" });
});

test("pick: containing building wins; else nearest within 30 m; else null", () => {
  const a = { id: 1, ring: sq(-74.041, 40.738) };
  const b = { id: 2, ring: sq(-74.0405, 40.738) };
  assert.equal(pickFootprint([-74.0409, 40.7381], [b, a])!.osm_id, 1);
  // On the street 11 m south of a, further from b.
  const near = pickFootprint([-74.0409, 40.7379], [a, b])!;
  assert.equal(near.osm_id, 1);
  assert.ok(near.distance_m > 10 && near.distance_m < 12);
  // 0.0004° (~44 m) south: nothing within MAX_MATCH_M.
  assert.equal(MAX_MATCH_M, 30);
  assert.equal(pickFootprint([-74.0409, 40.7376], [a, b]), null);
  assert.equal(pickFootprint([-74.0409, 40.7381], []), null);
});

test("compact ring: rounded to 6 decimals, duplicates dropped, closed", () => {
  const r = compactRing([[1.00000012, 2.0000001], [1.00000014, 2.0000001], [1.5, 2], [1.5, 2.5]]);
  assert.deepEqual(r, [[1, 2], [1.5, 2], [1.5, 2.5], [1, 2]]);
});

test("committed footprints file: one entry per sample address, each ring closed and near its geocode", () => {
  const doc = JSON.parse(readFileSync(join(repoRoot, "web/data/building-footprints.json"), "utf8"));
  const ids = Object.keys(doc.footprints);
  assert.equal(ids.length, 500);
  assert.equal(doc.attribution, "Building outline © OpenStreetMap contributors");
  let n = 0;
  for (const id of ids) {
    const f = doc.footprints[id];
    if (!f) continue;
    n++;
    const first = f.ring[0];
    const last = f.ring[f.ring.length - 1];
    assert.deepEqual(first, last, id);
    assert.ok(f.distance_m >= 0 && f.distance_m <= MAX_MATCH_M, id);
    assert.ok(f.height_m > 0, id);
  }
  assert.equal(n, doc.matched);
});
