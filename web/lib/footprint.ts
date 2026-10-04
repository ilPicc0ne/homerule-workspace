/* Building footprints from OpenStreetMap, matched to a geocoded address.
   The Census geocode is interpolated along the street, so it usually lands on the sidewalk or the
   street in front of the building. We take the OSM building that contains the point, else the
   nearest one within MAX_MATCH_M. Pure functions: used by the build script and the map views. */

export type LonLat = [number, number];

export type Footprint = {
  /** Outer ring, [lon, lat], closed (first point = last point). */
  ring: LonLat[];
  /** Height in metres for the 3D extrusion. */
  height_m: number;
  /** Where the height came from: OSM `height`, `building:levels` × 3 m, or a default. */
  height_src: "height" | "levels" | "default";
  /** Metres from the geocode to the footprint (0 = the point is inside it). */
  distance_m: number;
  /** OSM way id, for the attribution trail. */
  osm_id: number;
};

/** Furthest a footprint may be from the geocode and still count as this address's building. */
export const MAX_MATCH_M = 30;
export const DEFAULT_HEIGHT_M = 12;
const LEVEL_M = 3;

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Local flat projection around a reference latitude, metres. Plenty for distances under ~1 km. */
function toXY([lon, lat]: LonLat, lat0: number): [number, number] {
  return [rad(lon) * R * Math.cos(rad(lat0)), rad(lat) * R];
}

export function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Metres from p to the ring (0 when p is inside). */
export function distanceToRing(p: LonLat, ring: LonLat[]): number {
  if (pointInRing(p, ring)) return 0;
  const [px, py] = toXY(p, p[1]);
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = toXY(ring[i], p[1]);
    const [bx, by] = toXY(ring[i + 1], p[1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/** Area-weighted centroid of a ring (falls back to the vertex mean for degenerate rings). */
export function ringCentroid(ring: LonLat[]): LonLat {
  const lat0 = ring[0][1];
  const lon0 = ring[0][0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = [ring[i][0] - lon0, ring[i][1] - lat0];
    const [x2, y2] = [ring[i + 1][0] - lon0, ring[i + 1][1] - lat0];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length - 1 || 1;
    const pts = ring.slice(0, n);
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [lon0 + cx / (3 * a), lat0 + cy / (3 * a)];
}

/** Height for the extrusion from OSM tags: `height` (m), else `building:levels` × 3 m, else 12 m. */
export function heightFromTags(tags: Record<string, string> | undefined): Pick<Footprint, "height_m" | "height_src"> {
  const h = parseFloat((tags?.height ?? "").replace(",", "."));
  if (Number.isFinite(h) && h > 2 && h < 400) return { height_m: Math.round(h * 10) / 10, height_src: "height" };
  const lv = parseFloat(tags?.["building:levels"] ?? "");
  if (Number.isFinite(lv) && lv >= 1 && lv < 120) return { height_m: Math.round(lv * LEVEL_M * 10) / 10, height_src: "levels" };
  return { height_m: DEFAULT_HEIGHT_M, height_src: "default" };
}

export type Candidate = { id: number; ring: LonLat[]; tags?: Record<string, string> };

/** The building that contains p, else the nearest within MAX_MATCH_M; null when none. */
export function pickFootprint(p: LonLat, candidates: Candidate[]): Footprint | null {
  let best: { c: Candidate; d: number } | null = null;
  for (const c of candidates) {
    if (c.ring.length < 4) continue;
    const d = distanceToRing(p, c.ring);
    // Inside several (building:part over a building)? Keep the smallest-index one deterministically.
    if (!best || d < best.d || (d === best.d && c.id < best.c.id)) best = { c, d };
  }
  if (!best || best.d > MAX_MATCH_M) return null;
  return { ring: best.c.ring, ...heightFromTags(best.c.tags), distance_m: Math.round(best.d * 10) / 10, osm_id: best.c.id };
}

/** Drop near-duplicate vertices and round to 6 decimals (~0.1 m) so the committed file stays small. */
export function compactRing(ring: LonLat[]): LonLat[] {
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const out: LonLat[] = [];
  for (const [lon, lat] of ring) {
    const q: LonLat = [r6(lon), r6(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
  return out;
}
