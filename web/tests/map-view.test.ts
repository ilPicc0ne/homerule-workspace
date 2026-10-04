// Map · 3D switch (#64): which view opens, and the 3D camera path from city outline to building.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP_VIEW, buildingCamera, cityCamera, initialMapView, outerRings, parseMapView, pinPoint } from "../lib/map-view.ts";

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

test("pin goes on the building's centroid when we have its outline, else on the geocode", () => {
  const geocode = { lon: -74.0412, lat: 40.7385 };
  assert.deepEqual(pinPoint(geocode, null), geocode);
  assert.equal(pinPoint(null, undefined), null);
  const ring: [number, number][] = [[-74.041, 40.738], [-74.040, 40.738], [-74.040, 40.739], [-74.041, 40.739], [-74.041, 40.738]];
  const p = pinPoint(geocode, { ring, height_m: 12, height_src: "default", distance_m: 3, osm_id: 1 })!;
  assert.ok(Math.abs(p.lon - -74.0405) < 1e-9 && Math.abs(p.lat - 40.7385) < 1e-9);
});
