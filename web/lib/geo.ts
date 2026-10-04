import type { Address } from "./types";

/*
  Dot maps without a map library: sample addresses grouped into metro panels,
  each projected (equirectangular, cos-latitude corrected) into its own box.
*/

export type Panel = { id: string; label: string; state: string; cities: string[] };

export const PANELS: Panel[] = [
  { id: "bay", label: "San Francisco and Berkeley", state: "CA", cities: ["CA-SAN-FRANCISCO", "CA-BERKELEY"] },
  { id: "la", label: "Los Angeles", state: "CA", cities: ["CA-LOS-ANGELES"] },
  { id: "sd", label: "San Diego", state: "CA", cities: ["CA-SAN-DIEGO"] },
  { id: "nj", label: "Jersey City, Hoboken and Newark", state: "NJ", cities: ["NJ-JERSEY-CITY", "NJ-HOBOKEN", "NJ-NEWARK"] },
  { id: "ma", label: "Boston and Cambridge", state: "MA", cities: ["MA-BOSTON", "MA-CAMBRIDGE"] },
];

export type Projected = { id: string; x: number; y: number };

export type PanelFrame = { width: number; height: number; points: Projected[] };

/** Project the panel's addresses into a box `width` wide; height follows the area's shape. */
export function projectPanel(panel: Panel, addresses: Address[], width = 320, pad = 10, maxHeight = 360): PanelFrame {
  const pts = addresses.filter((a) => a.coords && panel.cities.includes(a.jurisdictions.city));
  if (pts.length === 0) return { width, height: 120, points: [] };
  const lons = pts.map((a) => a.coords!.lon);
  const lats = pts.map((a) => a.coords!.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * k, 0.005);
  const spanY = Math.max(maxLat - minLat, 0.005);
  const inner = width - pad * 2;
  const scale = inner / spanX;
  const height = Math.min(Math.max(spanY * scale + pad * 2, 140), maxHeight);
  // If clamped, fit by height instead.
  const s = Math.min(scale, (height - pad * 2) / spanY);
  const offX = (width - spanX * s) / 2;
  const offY = (height - spanY * s) / 2;
  return {
    width,
    height: Math.round(height),
    points: pts.map((a) => ({
      id: a.address_id,
      x: Math.round((offX + (a.coords!.lon - minLon) * k * s) * 10) / 10,
      y: Math.round((offY + (maxLat - a.coords!.lat) * s) * 10) / 10,
    })),
  };
}
