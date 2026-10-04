// Map · 3D switch (#64): which view opens, and the 3D camera path from city outline to building.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP_VIEW, buildingCamera, cityCamera, initialMapView, outerRings } from "../lib/map-view.ts";

test("MapLibre is the default view", () => {
  assert.equal(DEFAULT_MAP_VIEW, "map");
  assert.equal(initialMapView(null, null), "map");
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

test("final shot: the building at ~250 m, tilt 60°", () => {
  const cam = buildingCamera({ lon: -122.43, lat: 37.8 });
  assert.deepEqual(cam, { center: { lat: 37.8, lng: -122.43, altitude: 0 }, range: 250, tilt: 60, heading: 0 });
});
