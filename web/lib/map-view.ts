/* Map · 3D switch on the address page: which view opens, and the 3D camera path.
   Pure functions (no DOM, no Google), so the logic is testable with node --test. */

export type MapView = "map" | "3d";

/** The view a first-time visitor sees. Flip to "3d" to make the Google 3D view the default. */
export const DEFAULT_MAP_VIEW: MapView = "map";

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

/** Final shot: the building from ~250 m at 60° tilt. */
export function buildingCamera(coords: { lon: number; lat: number }): Camera {
  return { center: { lat: coords.lat, lng: coords.lon, altitude: 0 }, range: 250, tilt: 60, heading: 0 };
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
