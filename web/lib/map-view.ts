/* Map · 3D switch on the address page: which view opens, and the 3D camera path.
   Pure functions (no DOM, no Google), so the logic is testable with node --test. */

import { ringCentroid, type Footprint } from "./footprint.ts";

export type MapView = "map" | "3d";

/** "3d" only when the setting says exactly that; anything else is the MapLibre map. */
export function parseMapView(v: string | null | undefined): MapView {
  return v === "3d" ? "3d" : "map";
}

/**
 * The view a first-time visitor sees: the `NEXT_PUBLIC_DEFAULT_MAP_VIEW` setting ("map" | "3d",
 * inlined at build time), else "map". A visitor's own choice and `?map=` still win.
 */
export const DEFAULT_MAP_VIEW: MapView = parseMapView(process.env.NEXT_PUBLIC_DEFAULT_MAP_VIEW);

/** Shown wherever an OSM building outline is drawn. */
export const FOOTPRINT_ATTRIBUTION = "Building outline © OpenStreetMap contributors";

/** Where the pin goes: the building's centroid when we have its outline, else the geocode. */
export function pinPoint(
  geocode: { lon: number; lat: number } | null,
  footprint: Footprint | null | undefined,
): { lon: number; lat: number } | null {
  if (footprint && footprint.ring.length >= 4) {
    const [lon, lat] = ringCentroid(footprint.ring);
    return { lon, lat };
  }
  return geocode;
}

/** localStorage key for the visitor's last choice. */
export const MAP_VIEW_STORAGE_KEY = "homerule.mapView";

/** Give up on 3D and show the MapLibre map when it has not loaded within this time. */
export const MAP3D_TIMEOUT_MS = 5000;

const isView = (v: unknown): v is MapView => v === "map" || v === "3d";

/** `?map=3d` wins (demo link), then the stored choice, then the default. */
export function initialMapView(param: string | null | undefined, stored: string | null | undefined): MapView {
  if (isView(param)) return param;
  if (isView(stored)) return stored;
  return DEFAULT_MAP_VIEW;
}

type Ring = number[][];
export type Outline = { type: string; coordinates: unknown } | null | undefined;

/** Outer rings of a Polygon / MultiPolygon as [lon, lat] lists (holes dropped: the outline is a line). */
export function outerRings(geometry: Outline): Ring[] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [(geometry.coordinates as Ring[])[0]].filter(Boolean);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Ring[][]).map((p) => p[0]).filter(Boolean);
  return [];
}

export type Camera = {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
};

const M_PER_DEG_LAT = 111_320;

/** Final shot: the building from ~300 m at 50° tilt (steep enough that its roof isn't hidden by the next row). */
export function buildingCamera(coords: { lon: number; lat: number }): Camera {
  return { center: { lat: coords.lat, lng: coords.lon, altitude: 0 }, range: 300, tilt: 50, heading: 0 };
}

/**
 * Opening shot: straight down over the legal city so the whole outline is in view.
 * Without an outline (unincorporated), a high shot over the building.
 */
export function cityCamera(rings: Ring[], coords: { lon: number; lat: number } | null): Camera | null {
  const pts = rings.flat();
  if (!pts.length) {
    return coords ? { center: { lat: coords.lat, lng: coords.lon, altitude: 0 }, range: 6000, tilt: 0, heading: 0 } : null;
  }
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [lon, lat] of pts) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  const lat = (s + n) / 2;
  const lng = (w + e) / 2;
  const hM = (n - s) * M_PER_DEG_LAT;
  const wM = (e - w) * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  // 35° vertical field of view: range ≈ extent / (2·tan 17.5°) ≈ 1.6 × extent; margin for wide cards.
  const range = Math.min(Math.max(Math.max(hM, wM) * 2, 2000), 120_000);
  return { center: { lat, lng, altitude: 0 }, range: Math.round(range), tilt: 0, heading: 0 };
}
