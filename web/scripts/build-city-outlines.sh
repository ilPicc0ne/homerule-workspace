#!/usr/bin/env bash
# Regenerates web/data/city-outlines.geojson: legal city limits of the 10 covered cities.
#
# Source: US Census Bureau, TIGER/Line Shapefiles 2025, Places (incorporated places),
#   https://www2.census.gov/geo/tiger/TIGER2025/PLACE/tl_2025_{06,34,25}_place.zip
#   Retrieved 04.10.2026. GEOIDs from contracts/jurisdictions.json (`census_geoid`).
# TIGER/Line legal boundaries include water inside the city limits (e.g. SF Bay).
#
# Needs curl, unzip and npx (mapshaper is fetched at a pinned version, not a dependency).
# Usage: bash web/scripts/build-city-outlines.sh   (from anywhere)
set -euo pipefail

YEAR=2025
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
  ZIP="$CACHE/tl_${YEAR}_${ST}_place.zip"
  [ -s "$ZIP" ] || curl -fsSL -o "$ZIP" "https://www2.census.gov/geo/tiger/TIGER$YEAR/PLACE/tl_${YEAR}_${ST}_place.zip"
  [ -s "$CACHE/tl_${YEAR}_${ST}_place.shp" ] || unzip -oq "$ZIP" -d "$CACHE"
  SHPS+=("$CACHE/tl_${YEAR}_${ST}_place.shp")
done

npx --yes "$MAPSHAPER" -i "${SHPS[@]}" combine-files \
  -merge-layers force \
  -filter "[$GEOIDS].indexOf(GEOID) > -1" \
  -each "id = ($MAP_JSON)[GEOID], name = NAME, geoid = GEOID" \
  -filter-fields id,name,geoid \
  -simplify 15% weighted keep-shapes \
  -filter-islands min-area=50000 \
  -o "$OUT" format=geojson precision=0.00001 force

node -e '
  const fs = require("fs");
  const f = process.argv[1];
  const g = JSON.parse(fs.readFileSync(f, "utf8"));
  g.source = "US Census Bureau, TIGER/Line Shapefiles 2025, Places; https://www2.census.gov/geo/tiger/TIGER2025/PLACE/; retrieved 2026-10-04; simplified with mapshaper";
  fs.writeFileSync(f, JSON.stringify(g));
  console.log(f, g.features.length, "features,", fs.statSync(f).size, "bytes");
' "$OUT"
