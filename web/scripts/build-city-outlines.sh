#!/usr/bin/env bash
# Regenerates web/data/city-outlines.geojson: legal city limits of the 10 covered cities.
#
# Source: US Census Bureau, Cartographic Boundary Files 2024, Places 1:500k (derived from TIGER,
#   clipped to the shoreline, so no box over the bay),
#   https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_{06,34,25}_place_500k.zip
#   Retrieved 04.10.2026. GEOIDs from contracts/jurisdictions.json (`census_geoid`).
# Parts smaller than 5% of a city's largest piece are dropped (SF: Farallon Islands, Treasure
# Island), so the outline shows the mainland city the renter knows.
#
# Needs curl, unzip and npx (mapshaper is fetched at a pinned version, not a dependency).
# Usage: bash web/scripts/build-city-outlines.sh   (from anywhere)
set -euo pipefail

YEAR=2024
MAPSHAPER="mapshaper@0.7.72"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$(dirname "$HERE")"
ROOT="$(dirname "$WEB")"
CACHE="${TMPDIR:-/tmp}/homerule-tiger-$YEAR"
OUT="$WEB/data/city-outlines.geojson"
mkdir -p "$CACHE"

# GEOID -> jurisdiction id, from the contract (only cities).
MAP_JSON="$(node -e '
  const j = require(process.argv[1]).jurisdictions;
  const m = {};
  for (const x of j) if (x.level === "city" && x.census_geoid) m[x.census_geoid] = x.id;
  console.log(JSON.stringify(m));
' "$ROOT/contracts/jurisdictions.json")"
GEOIDS="$(node -e 'console.log(Object.keys(JSON.parse(process.argv[1])).map(g=>JSON.stringify(g)).join(","))' "$MAP_JSON")"

SHPS=()
for ST in 06 34 25; do
  ZIP="$CACHE/cb_${YEAR}_${ST}_place_500k.zip"
  [ -s "$ZIP" ] || curl -fsSL -o "$ZIP" "https://www2.census.gov/geo/tiger/GENZ$YEAR/shp/cb_${YEAR}_${ST}_place_500k.zip"
  [ -s "$CACHE/cb_${YEAR}_${ST}_place_500k.shp" ] || unzip -oq "$ZIP" -d "$CACHE"
  SHPS+=("$CACHE/cb_${YEAR}_${ST}_place_500k.shp")
done

npx --yes "$MAPSHAPER" -i "${SHPS[@]}" combine-files \
  -merge-layers force \
  -filter "[$GEOIDS].indexOf(GEOID) > -1" \
  -each "id = ($MAP_JSON)[GEOID], name = NAME, geoid = GEOID" \
  -filter-fields id,name,geoid \
  -simplify 90% weighted keep-shapes \
  -o "$OUT" format=geojson precision=0.00001 force

node -e '
  const fs = require("fs");
  const f = process.argv[1];
  const g = JSON.parse(fs.readFileSync(f, "utf8"));
  // Keep the main land body: drop parts under 5% of the largest piece (offshore islands).
  const area = (ring) => Math.abs(ring.reduce((s, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2);
  for (const f of g.features) {
    if (f.geometry.type !== "MultiPolygon") continue;
    const big = Math.max(...f.geometry.coordinates.map((p) => area(p[0])));
    const keep = f.geometry.coordinates.filter((p) => area(p[0]) >= 0.05 * big);
    f.geometry = keep.length === 1 ? { type: "Polygon", coordinates: keep[0] } : { type: "MultiPolygon", coordinates: keep };
  }
  g.source = "US Census Bureau, Cartographic Boundary Files 2024, Places 1:500k (shoreline-clipped); https://www2.census.gov/geo/tiger/GENZ2024/shp/; retrieved 2026-10-04; simplified with mapshaper; parts under 5% of the largest dropped";
  fs.writeFileSync(f, JSON.stringify(g));
  console.log(f, g.features.length, "features,", fs.statSync(f).size, "bytes");
' "$OUT"
