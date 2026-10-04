// Regenerates web/data/elevations.json: ground elevation (metres above sea level) at the 3D camera
// target of each sample address, so the tilted 3D shot looks at the ground and not at a point
// below it (Map3DElement's camera altitude is absolute; at 50° tilt, 210 m of hill moved the view
// ~250 m off the building).
//
// Target = what the 3D view centres on (lib/map-view.ts highlightFor): the OSM building centroid when
// the building is drawn (sure match), else the Census geocode. No geocode → no entry.
// Source: Open-Meteo Elevation API (https://open-meteo.com/en/docs/elevation-api), Copernicus
//   GLO-90 DEM (90 m), free, no key. Polite: ≤ 100 points per request, one at a time, a pause between
//   requests, raw responses cached in $TMPDIR so a rerun doesn't hit the server again.
//
// Usage: node web/scripts/build-elevations.ts   (from anywhere; Node ≥ 22.18; after build-building-footprints.ts)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { highlightFor } from "../lib/map-view.ts";
import type { Footprint } from "../lib/footprint.ts";

const WEB = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(WEB, "data/elevations.json");
const CACHE = join(tmpdir(), "homerule-elevations");
const ENDPOINT = "https://api.open-meteo.com/v1/elevation";
const BATCH = 100;
const PAUSE_MS = 2000;
mkdirSync(CACHE, { recursive: true });

type Addr = { address_id: string; coords: { lat: number; lon: number } | null };
const raw = JSON.parse(readFileSync(join(WEB, "data/addresses.resolved.json"), "utf8"));
const addresses: Addr[] = Array.isArray(raw) ? raw : raw.addresses ?? Object.values(raw);
const footprints: Record<string, Footprint | null> = JSON.parse(
  readFileSync(join(WEB, "data/building-footprints.json"), "utf8"),
).footprints;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

type Target = { id: string; lat: number; lon: number };
const targets: Target[] = [];
for (const a of addresses) {
  const hl = highlightFor(a.coords, footprints[a.address_id]);
  if (hl) targets.push({ id: a.address_id, lat: r6(hl.center.lat), lon: r6(hl.center.lon) });
}

async function elevations(batch: Target[]): Promise<number[]> {
  const url = `${ENDPOINT}?latitude=${batch.map((t) => t.lat).join(",")}&longitude=${batch.map((t) => t.lon).join(",")}`;
  const file = join(CACHE, `${createHash("sha256").update(url).digest("hex").slice(0, 16)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).elevation;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "HomeRule build script (hackathon prototype)" } });
    if (res.ok) {
      const text = await res.text();
      const json = JSON.parse(text) as { elevation?: number[] };
      if (!Array.isArray(json.elevation) || json.elevation.length !== batch.length) throw new Error(`bad response: ${text.slice(0, 200)}`);
      writeFileSync(file, text);
      await sleep(PAUSE_MS);
      return json.elevation;
    }
    console.error(`  open-meteo ${res.status}, retry ${attempt} in ${attempt * 10} s`);
    await sleep(attempt * 10_000);
  }
  throw new Error("open-meteo failed 5 times");
}

const out: Record<string, number> = {};
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  const elev = await elevations(batch);
  batch.forEach((t, j) => {
    if (Number.isFinite(elev[j])) out[t.id] = Math.round(elev[j]);
  });
  console.error(`${Math.min(i + BATCH, targets.length)}/${targets.length}`);
}

const ids = Object.keys(out).sort();
const doc = {
  source: "Open-Meteo Elevation API (Copernicus GLO-90 DEM, 90 m), https://api.open-meteo.com/v1/elevation",
  retrieved: new Date().toISOString().slice(0, 10),
  target: "3D camera target: OSM building centroid for sure footprint matches, else the Census geocode",
  unit: "metres above sea level, rounded",
  total: ids.length,
  elevations: Object.fromEntries(ids.map((id) => [id, out[id]])),
};
writeFileSync(OUT, JSON.stringify(doc, null, 0).replace(/,"elevations":/, ',\n"elevations":') + "\n");
console.error(`${ids.length}/${addresses.length} elevations → ${OUT}`);
