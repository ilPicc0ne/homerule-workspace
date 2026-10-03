// The legal jurisdiction tree: Federal › State › County › Municipality (city, town, township) or
// "unincorporated", each level marked covered (rules in HomeRule) or not.
import type { Geographies, CensusArea } from "./census.ts";
import { byId, chain, displayName, findCounty, findCousub, findPlace, findState } from "./jurisdictions.ts";
import type { StateInfo } from "./states.ts";
import type { Coverage, TreeLevel } from "./types.ts";

export const FEDERAL: TreeLevel = {
  level: "federal",
  label: "Country",
  name: "United States",
  id: null,
  geoid: null,
  covered: false,
  note: "Federal housing law is not in HomeRule.",
};

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
      covered: !!ours?.rules,
    });
  }

  const co = g["Counties"]?.[0];
  const countyName = co ? co.NAME : null;
  if (co && co.GEOID !== "11001") {
    const ours = findCounty(co.GEOID);
    tree.push({
      level: "county",
      label: "County",
      name: co.NAME,
      id: ours?.id ?? null,
      geoid: co.GEOID,
      covered: !!ours?.rules,
      note:
        co.FUNCSTAT === "N"
          ? "This county has no county government; the city or town governs."
          : co.FUNCSTAT === "C"
            ? "City and county are one government here."
            : ours?.rules
              ? undefined
              : "No county rules in HomeRule.",
    });
  }

  const places = g["Incorporated Places"] ?? [];
  const towns = (g["County Subdivisions"] ?? []).filter(isGovernment);
  const municipalities: TreeLevel[] = [];

  // A town or township that governs here (NJ/MA). Kept when it isn't just the same city again.
  for (const t of towns) {
    const { name, label } = nameAndLabel(t);
    if (places.some((p) => nameAndLabel(p).name === name)) continue;
    const ours = findCousub(t.GEOID);
    municipalities.push({ level: "municipality", label, name, id: ours?.id ?? null, geoid: t.GEOID, covered: !!ours?.rules });
  }
  for (const p of places) {
    const { name, label } = nameAndLabel(p);
    const ours = findPlace(p.GEOID);
    municipalities.push({ level: "municipality", label, name, id: ours?.id ?? null, geoid: p.GEOID, covered: !!ours?.rules });
  }
  // No place on the list but an F county subdivision that is one of our NJ/MA cities.
  if (!municipalities.length) {
    for (const c of g["County Subdivisions"] ?? []) {
      const ours = findCousub(c.GEOID);
      if (ours) {
        municipalities.push({ level: "municipality", label: "City", name: displayName(ours), id: ours.id, geoid: c.GEOID, covered: ours.rules });
      }
    }
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
      covered: false,
      note: `Not inside any city. ${countyName} governs here; no city's local rules apply.`,
    });
  }
  return tree;
}

function levelFor(id: string): TreeLevel {
  const j = byId.get(id)!;
  if (j.level === "state") return { level: "state", label: "State", name: j.legal_name, id: j.id, geoid: j.census_geoid, covered: j.rules };
  if (j.level === "county") {
    return { level: "county", label: "County", name: j.legal_name, id: j.id, geoid: j.census_geoid, covered: j.rules, note: j.rules ? undefined : "No county rules in HomeRule." };
  }
  return { level: "municipality", label: "City", name: displayName(j), id: j.id, geoid: j.census_geoid, covered: j.rules };
}

/** Tree for an entry on our list: Boston → United States › Massachusetts › Suffolk County › Boston. */
export function treeForJurisdiction(id: string): TreeLevel[] {
  const j = byId.get(id);
  if (!j) throw new Error(`unknown jurisdiction ${id}`);
  return [FEDERAL, ...chain(j).map((c) => levelFor(c.id))];
}

/** Tree for a state that may be outside our scope ("Texas"). */
export function treeForState(s: StateInfo): TreeLevel[] {
  if (byId.has(s.abbr)) return treeForJurisdiction(s.abbr);
  return [FEDERAL, { level: "state", label: s.abbr === "DC" ? "Federal district" : "State", name: s.name, id: null, geoid: s.fips, covered: false }];
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
