// The jurisdiction list (interface I1). Canonical file: /contracts/jurisdictions.json; web/contracts/
// holds a synced copy because Vercel only uploads web/ (npm run sync, checked by a test).
import data from "../../contracts/jurisdictions.json" with { type: "json" };
import { plain } from "./normalise.ts";
import { stateByAbbr, STATES, type StateInfo } from "./states.ts";

export type Jurisdiction = {
  id: string;
  level: "state" | "county" | "city";
  legal_name: string;
  schema_name: string | null;
  parent: string | null;
  census_geoid: string;
  census_cousub_geoid?: string;
  rules: boolean;
  aliases: string[];
};

export const JURISDICTIONS: Jurisdiction[] = (data as { jurisdictions: Jurisdiction[] }).jurisdictions;

export const byId = new Map(JURISDICTIONS.map((j) => [j.id, j]));
const byGeoid = new Map<string, Jurisdiction>();
for (const j of JURISDICTIONS) {
  byGeoid.set(`${j.level}:${j.census_geoid}`, j);
  if (j.census_cousub_geoid) byGeoid.set(`cousub:${j.census_cousub_geoid}`, j);
}

export const findState = (fips: string) => byGeoid.get(`state:${fips}`) ?? null;
export const findCounty = (geoid: string) => byGeoid.get(`county:${geoid}`) ?? null;
export const findPlace = (geoid: string) => byGeoid.get(`city:${geoid}`) ?? null;
export const findCousub = (geoid: string) => byGeoid.get(`cousub:${geoid}`) ?? null;

/** "Los Angeles city" → "Los Angeles", "Hudson County" stays. */
export function displayName(j: Jurisdiction): string {
  return j.level === "city" ? j.legal_name.replace(/ (city|town|township|borough|village)$/i, "") : j.legal_name;
}

export function stateOf(j: Jurisdiction): Jurisdiction {
  let cur = j;
  while (cur.parent) cur = byId.get(cur.parent)!;
  return cur;
}

export function chain(j: Jurisdiction): Jurisdiction[] {
  const out = [j];
  while (out[0].parent) out.unshift(byId.get(out[0].parent)!);
  return out;
}

export function childrenOf(id: string): Jurisdiction[] {
  const j = byId.get(id);
  if (!j || j.level === "city") return [];
  return JURISDICTIONS.filter((c) => c.level === "city" && chain(c).some((p) => p.id === id));
}

export const STATES_IN_SCOPE = JURISDICTIONS.filter((j) => j.level === "state").map((j) => j.id);
export const CITY_COUNT = JURISDICTIONS.filter((j) => j.level === "city" && j.rules).length;

export type PlaceMatch = { jurisdiction: Jurisdiction; via: "name" | "alias" | "county" };

/**
 * Finds a place on our list by name, alias or county name. With a state, only that state's entries count.
 * Neighbourhood aliases ("Dorchester") come back with via "alias".
 */
export function searchPlace(text: string, state?: StateInfo | null): PlaceMatch | null {
  const t = plain(text).replace(/^city of /, "");
  if (!t) return null;
  const inState = (j: Jurisdiction) => !state || stateOf(j).id === state.abbr;
  const cities = JURISDICTIONS.filter((j) => j.level === "city" && inState(j));
  const counties = JURISDICTIONS.filter((j) => j.level === "county" && inState(j));

  for (const j of cities) {
    const names = [displayName(j), j.legal_name, j.schema_name ?? "", `${displayName(j)} ${stateOf(j).id}`];
    if (names.some((n) => plain(n) === t)) return { jurisdiction: j, via: "name" };
  }
  for (const j of counties) {
    const base = j.legal_name.replace(/ County$/, "");
    if ([j.legal_name, `${base} county`].some((n) => plain(n) === t)) return { jurisdiction: j, via: "county" };
  }
  for (const j of cities) {
    if (j.aliases.some((a) => plain(a) === t)) return { jurisdiction: j, via: "alias" };
  }
  return null;
}

/** A state by name or USPS abbreviation, in scope or not. */
export function searchState(text: string): StateInfo | null {
  const t = plain(text);
  return stateByAbbr.get(t.toUpperCase()) ?? STATES.find((s) => plain(s.name) === t) ?? null;
}

/** Is this postal city a neighbourhood alias rather than the city's own name? */
export function postalCityMatch(postalCity: string, stateAbbr: string): PlaceMatch | null {
  return searchPlace(postalCity, stateByAbbr.get(stateAbbr) ?? null);
}
