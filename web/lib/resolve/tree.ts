// The legal jurisdiction tree: Federal › State › County › Municipality (city, town, township) or
// "unincorporated". Each level is "covered" (rules in HomeRule), "not_covered" (law exists here,
// HomeRule doesn't have it) or "no_rules" (nothing to cover at this level).
import type { Geographies, CensusArea } from "./census.ts";
import { byId, chain, displayName, findCounty, findCousub, findPlace, findState, type Jurisdiction } from "./jurisdictions.ts";
import type { StateInfo } from "./states.ts";
import type { Coverage, LevelStatus, TreeLevel } from "./types.ts";

export const FEDERAL: TreeLevel = {
  level: "federal",
  label: "Country",
  name: "United States",
  id: null,
  geoid: null,
  status: "not_covered",
  covered: false,
  note: "Federal law (fair housing, tenant-screening reports) applies everywhere; it isn't in HomeRule.",
};

const flag = (status: LevelStatus) => ({ status, covered: status === "covered" });

const statusOf = (j: Jurisdiction | null | undefined): LevelStatus => (j?.rules ? "covered" : "not_covered");

/**
 * The county level. inCity: the address lies inside a city or town (false = unincorporated,
 * null = unknown, e.g. a search for the county itself). funcstat: Census's government status.
 */
function countyLevel(name: string, geoid: string, ours: Jurisdiction | null, inCity: boolean | null, funcstat?: string): TreeLevel {
  const base = { level: "county" as const, label: "County", name, id: ours?.id ?? null, geoid };
  if (ours?.rules) return { ...base, ...flag("covered") };
  if (funcstat === "N" || ours?.county_law === "none") {
    return { ...base, ...flag("no_rules"), note: "This county has no county government, so there are no county rules; the city or town makes local rules." };
  }
  if (funcstat === "C") return { ...base, ...flag("no_rules"), note: "City and county are one government here; its rules are at the city level." };
  if (ours?.county_law === "unincorporated_only") {
    return inCity
      ? { ...base, ...flag("no_rules"), note: `${name}'s rent and eviction rules cover only unincorporated areas, not addresses inside a city.` }
      : { ...base, ...flag("not_covered"), note: `${name}'s own rent and eviction rules apply ${inCity === false ? "here" : "in its unincorporated areas"}; they aren't in HomeRule.` };
  }
  return { ...base, ...flag("not_covered"), note: "No county rules in HomeRule." };
}

/** "Brookline town" → {name: "Brookline", label: "Town"} using Census's BASENAME. */
function nameAndLabel(a: CensusArea): { name: string; label: string } {
  const base = a.BASENAME ?? a.NAME;
  const rest = a.NAME.startsWith(base) ? a.NAME.slice(base.length).trim() : "";
  const label = rest ? rest[0].toUpperCase() + rest.slice(1) : "Municipality";
  return { name: base, label };
}

/**
 * Census FUNCSTAT "A": an active government. In NJ and MA (and other states with town governments)
 * this is the town or township. CA county subdivisions are statistical (CCD, "S") and never count;
 * NJ/MA cities appear as "F" county subdivisions that duplicate the incorporated place.
 */
const isGovernment = (a: CensusArea) => a.FUNCSTAT === "A";

export function treeFromGeographies(g: Geographies): TreeLevel[] {
  const tree: TreeLevel[] = [FEDERAL];

  const st = g["States"]?.[0];
  if (st) {
    const ours = findState(st.GEOID);
    tree.push({
      level: "state",
      label: st.GEOID === "11" ? "Federal district" : "State",
      name: st.BASENAME ?? st.NAME,
      id: ours?.id ?? null,
      geoid: st.GEOID,
      ...flag(statusOf(ours)),
    });
  }

  const co = g["Counties"]?.[0];
  const countyName = co ? co.NAME : null;

  const places = g["Incorporated Places"] ?? [];
  const towns = (g["County Subdivisions"] ?? []).filter(isGovernment);
  const municipalities: TreeLevel[] = [];

  // A town or township that governs here (NJ/MA). Kept when it isn't just the same city again.
  for (const t of towns) {
    const { name, label } = nameAndLabel(t);
    if (places.some((p) => nameAndLabel(p).name === name)) continue;
    const ours = findCousub(t.GEOID);
    municipalities.push({ level: "municipality", label, name, id: ours?.id ?? null, geoid: t.GEOID, ...flag(statusOf(ours)) });
  }
  for (const p of places) {
    const { name, label } = nameAndLabel(p);
    const ours = findPlace(p.GEOID);
    municipalities.push({ level: "municipality", label, name, id: ours?.id ?? null, geoid: p.GEOID, ...flag(statusOf(ours)) });
  }
  // No place on the list but an F county subdivision that is one of our NJ/MA cities.
  if (!municipalities.length) {
    for (const c of g["County Subdivisions"] ?? []) {
      const ours = findCousub(c.GEOID);
      if (ours) {
        municipalities.push({ level: "municipality", label: "City", name: displayName(ours), id: ours.id, geoid: c.GEOID, ...flag(statusOf(ours)) });
      }
    }
  }

  if (co && co.GEOID !== "11001") {
    tree.push(countyLevel(co.NAME, co.GEOID, findCounty(co.GEOID), municipalities.length > 0, co.FUNCSTAT));
  }
  if (municipalities.length) {
    tree.push(...municipalities);
  } else if (co) {
    const cdp = g["Census Designated Places"]?.[0];
    const area = cdp ? nameAndLabel(cdp).name : null;
    tree.push({
      level: "unincorporated",
      label: "Unincorporated area",
      name: area ? `${area} (unincorporated)` : "Unincorporated area",
      id: null,
      geoid: cdp?.GEOID ?? null,
      ...flag("no_rules"),
      note: `Not inside any city, so no city's rules apply. ${countyName} governs here.`,
    });
  }
  return tree;
}

function levelFor(id: string, inCity: boolean | null): TreeLevel {
  const j = byId.get(id)!;
  if (j.level === "state") return { level: "state", label: "State", name: j.legal_name, id: j.id, geoid: j.census_geoid, ...flag(statusOf(j)) };
  if (j.level === "county") return countyLevel(j.legal_name, j.census_geoid, j, inCity);
  return { level: "municipality", label: "City", name: displayName(j), id: j.id, geoid: j.census_geoid, ...flag(statusOf(j)) };
}

/** Tree for an entry on our list: Boston → United States › Massachusetts › Suffolk County › Boston. */
export function treeForJurisdiction(id: string): TreeLevel[] {
  const j = byId.get(id);
  if (!j) throw new Error(`unknown jurisdiction ${id}`);
  const inCity = j.level === "city" ? true : null;
  return [FEDERAL, ...chain(j).map((c) => levelFor(c.id, inCity))];
}

/** Tree for a state that may be outside our scope ("Texas"). */
export function treeForState(s: StateInfo): TreeLevel[] {
  if (byId.has(s.abbr)) return treeForJurisdiction(s.abbr);
  return [FEDERAL, { level: "state", label: s.abbr === "DC" ? "Federal district" : "State", name: s.name, id: null, geoid: s.fips, ...flag("not_covered") }];
}

export function coverageOf(tree: TreeLevel[]): Coverage {
  const state = tree.find((l) => l.level === "state");
  if (!state?.covered) return "not_covered";
  const local = tree.filter((l) => l.level === "municipality" || l.level === "unincorporated");
  return local.some((l) => l.covered) ? "covered" : local.length ? "state_only" : "covered";
}

/** The level that decides local law: the last municipality, or the unincorporated marker. */
export function localLevel(tree: TreeLevel[]): TreeLevel | null {
  const last = tree[tree.length - 1];
  return last && (last.level === "municipality" || last.level === "unincorporated") ? last : null;
}
