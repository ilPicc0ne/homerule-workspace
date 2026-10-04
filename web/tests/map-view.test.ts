// Map · 3D switch (#64): which view opens, and the 3D camera path from city outline to building.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP_VIEW, buildingCamera, cityCamera, initialMapView, outerRings, highlightFor, parseMapView, sureFootprint } from "../lib/map-view.ts";
import { distanceToRing, type Footprint } from "../lib/footprint.ts";

test("MapLibre is the default view unless NEXT_PUBLIC_DEFAULT_MAP_VIEW says 3d", () => {
  assert.equal(DEFAULT_MAP_VIEW, parseMapView(process.env.NEXT_PUBLIC_DEFAULT_MAP_VIEW));
  assert.equal(parseMapView(undefined), "map");
  assert.equal(parseMapView(""), "map");
  assert.equal(parseMapView("3D"), "map");
  assert.equal(parseMapView("3d"), "3d");
});

test("?map=3d wins over the stored choice; junk is ignored", () => {
  assert.equal(initialMapView("3d", "map"), "3d");
  assert.equal(initialMapView(null, "3d"), "3d");
  assert.equal(initialMapView("map", "3d"), "map");
  assert.equal(initialMapView("x", "y"), DEFAULT_MAP_VIEW);
});

test("outer rings of Polygon and MultiPolygon; anything else is empty", () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const hole = [[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.2]];
  assert.deepEqual(outerRings({ type: "Polygon", coordinates: [ring, hole] }), [ring]);
  assert.deepEqual(outerRings({ type: "MultiPolygon", coordinates: [[ring], [ring, hole]] }), [ring, ring]);
  assert.deepEqual(outerRings({ type: "Point", coordinates: [0, 0] }), []);
  assert.deepEqual(outerRings(null), []);
});

test("opening shot: straight down over the outline's centre, range covers the city", () => {
  // Hoboken-sized box: ~0.03° lon × 0.035° lat.
  const ring = [[-74.045, 40.735], [-74.015, 40.735], [-74.015, 40.77], [-74.045, 40.77], [-74.045, 40.735]];
  const cam = cityCamera([ring], { lon: -74.03, lat: 40.745 })!;
  assert.equal(cam.tilt, 0);
  assert.ok(Math.abs(cam.center.lat - 40.7525) < 1e-9);
  assert.ok(Math.abs(cam.center.lng - -74.03) < 1e-9);
  assert.ok(cam.range > 3896 * 1.5 && cam.range < 20000, `range ${cam.range}`);
});

test("opening shot without an outline is over the building; nothing at all gives null", () => {
  assert.equal(cityCamera([], { lon: -71, lat: 42 })!.center.lat, 42);
  assert.equal(cityCamera([], null), null);
});

test("final shot: the building at ~300 m, tilt 50°", () => {
  const cam = buildingCamera({ lon: -122.43, lat: 37.8 });
  assert.deepEqual(cam, { center: { lat: 37.8, lng: -122.43, altitude: 0 }, range: 300, tilt: 50, heading: 0 });
});

const ring: [number, number][] = [[-74.041, 40.738], [-74.040, 40.738], [-74.040, 40.739], [-74.041, 40.739], [-74.041, 40.738]];
const fp = (contains: boolean): Footprint => ({ ring, height_m: 12, height_src: "default", distance_m: contains ? 0 : 6, contains, osm_id: 1 });

test("sure match (geocode inside the outline): the building, centred on its centroid", () => {
  const h = highlightFor({ lon: -74.0405, lat: 40.7385 }, fp(true));
  assert.equal(h?.kind, "building");
  assert.ok(Math.abs(h!.center.lon - -74.0405) < 1e-9 && Math.abs(h!.center.lat - 40.7385) < 1e-9);
  assert.equal(sureFootprint(fp(true))?.osm_id, 1);
});

test("nearest-building match or no match: a ~25 m circle around the geocode, no building", () => {
  const geocode = { lon: -74.0412, lat: 40.7378 };
  for (const f of [fp(false), null, undefined]) {
    const h = highlightFor(geocode, f);
    assert.equal(h?.kind, "approx");
    assert.deepEqual(h!.center, geocode);
    const r = h!.ring;
    assert.deepEqual(r[0], r[r.length - 1]);
    // Every vertex ~25 m from the centre: distance from the centre to a tiny ring around one vertex.
    for (const v of r.slice(0, -1)) {
      const d = distanceToRing([geocode.lon, geocode.lat], [v, [v[0] + 1e-9, v[1]], v]);
      assert.ok(Math.abs(d - 25) < 0.3, `vertex at ${d} m`);
    }
  }
  assert.equal(sureFootprint(fp(false)), null);
});

test("no geocode and no sure building: nothing to highlight", () => {
  assert.equal(highlightFor(null, fp(false)), null);
  assert.equal(highlightFor(null, null), null);
});
