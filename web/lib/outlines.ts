import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  Legal city limits of the 10 covered cities, from Census TIGER/Line places,
  simplified once by scripts/build-city-outlines.sh. Only the one outline an
  address needs goes to the browser.
*/

export type CityOutline = {
  type: "Feature";
  properties: { id: string; name: string; geoid: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

let cached: CityOutline[] | undefined;

export function cityOutline(jurisdictionId: string | null | undefined): CityOutline | null {
  if (!jurisdictionId) return null;
  if (!cached) {
    const file = path.join(process.cwd(), "data", "city-outlines.geojson");
    cached = (JSON.parse(readFileSync(file, "utf8")) as { features: CityOutline[] }).features;
  }
  return cached.find((f) => f.properties.id === jurisdictionId) ?? null;
}

/** "Inside Boston city limits", or the unincorporated wording when no city governs. */
export function mapCaption(cityName: string | null, countyName: string | undefined, postalCity: string): string {
  if (!cityName) return `Outside any city: unincorporated ${countyName ?? "county"}`;
  const inside = `Inside ${cityName} city limits`;
  return postalCity && postalCity !== cityName ? `${inside} (mailing address says ${postalCity})` : inside;
}
