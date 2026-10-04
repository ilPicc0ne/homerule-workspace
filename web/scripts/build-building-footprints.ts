// Regenerates web/data/building-footprints.json: the OSM building outline for each sample address.
//
// Source: OpenStreetMap via the Overpass API (https://overpass-api.de), © OpenStreetMap contributors,
//   ODbL. Only `building=*` ways (no multipolygon relations), within 30 m of the Census geocode.
// The geocode is interpolated along the street, so it usually sits in front of the building: we take
//   the building that contains it, else the nearest one within 30 m (lib/footprint.ts). No match → null.
//   `contains: true` marks the sure matches (geocode inside the outline); only those are drawn.
// Polite: one request at a time, batched per city (≤ 40 points per query), a pause between requests,
//   raw responses cached in $TMPDIR so a rerun doesn't hit the server again.
//
// Usage: node web/scripts/build-building-footprints.ts   (from anywhere; Node ≥ 22.18)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { compactRing, pickFootprint, MAX_MATCH_M, type Candidate, type Footprint, type LonLat } from "../lib/footprint.ts";

const WEB = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(WEB, "data/building-footprints.json");
const CACHE = join(tmpdir(), "homerule-osm-footprints");
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const BATCH = 40;
const PAUSE_MS = 3000;
mkdirSync(CACHE, { recursive: true });

type Addr = { address_id: string; legal_city: string | null; postal_city: string; coords: { lat: number; lon: number } | null };
const raw = JSON.parse(readFileSync(join(WEB, "data/addresses.resolved.json"), "utf8"));
const addresses: Addr[] = Array.isArray(raw) ? raw : raw.addresses ?? Object.values(raw);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type OsmWay = { type: "way"; id: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };

async function overpass(points: Addr[]): Promise<OsmWay[]> {
  const q =
    `[out:json][timeout:120];(` +
    points.map((a) => `way["building"](around:${MAX_MATCH_M},${a.coords!.lat},${a.coords!.lon});`).join("") +
    `);out geom tags;`;
  const key = createHash("sha256").update(q).digest("hex").slice(0, 16);
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).elements;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "HomeRule build script (hackathon prototype)" },
      body: "data=" + encodeURIComponent(q),
    });
    if (res.ok) {
      const text = await res.text();
      writeFileSync(file, text);
      await sleep(PAUSE_MS);
      return JSON.parse(text).elements;
    }
    console.error(`  overpass ${res.status}, retry ${attempt} in ${attempt * 15} s`);
    await sleep(attempt * 15_000);
  }
  throw new Error("overpass failed 5 times");
}

const byCity = new Map<string, Addr[]>();
for (const a of addresses) {
  if (!a.coords) continue;
  const k = a.legal_city ?? a.postal_city;
  byCity.set(k, [...(byCity.get(k) ?? []), a]);
}

const out: Record<string, Footprint | null> = {};
for (const a of addresses) out[a.address_id] = null;

for (const [city, list] of byCity) {
  console.error(`${city}: ${list.length} addresses`);
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const ways = await overpass(batch);
    const cands: Candidate[] = ways
      .filter((w) => w.type === "way" && w.geometry && w.geometry.length >= 4)
      .map((w) => ({ id: w.id, ring: w.geometry!.map((g) => [g.lon, g.lat] as LonLat), tags: w.tags }));
    for (const a of batch) {
      const f = pickFootprint([a.coords!.lon, a.coords!.lat], cands);
      out[a.address_id] = f ? { ...f, ring: compactRing(f.ring) } : null;
    }
  }
}

const ids = Object.keys(out).sort();
const matched = ids.filter((id) => out[id]).length;
const contained = ids.filter((id) => out[id]?.contains).length;
const doc = {
  source: "OpenStreetMap contributors (ODbL), via Overpass API; building=* ways within 30 m of the Census geocode",
  attribution: "Building outline © OpenStreetMap contributors",
  retrieved: new Date().toISOString().slice(0, 10),
  matched,
  contains: contained,
  total: ids.length,
  footprints: Object.fromEntries(ids.map((id) => [id, out[id]])),
};
writeFileSync(OUT, JSON.stringify(doc) + "\n");
console.error(`matched ${matched}/${ids.length}, geocode inside ${contained} → ${OUT}`);
