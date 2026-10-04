// The autocomplete list for /where: the sample addresses (web/data/addresses.resolved.json) and the
// places on our jurisdiction list. Built once on the server and handed to the search box as a prop;
// matching lives in match.ts so the browser never loads the full sample file.
import data from "../../data/addresses.resolved.json" with { type: "json" };
import { JURISDICTIONS, displayName, stateOf } from "./jurisdictions.ts";
import { suggest, type Suggestion } from "./match.ts";
import { plain } from "./normalise.ts";
import type { ResolvedFile } from "./types.ts";

export { suggest, type Suggestion };

/** Spelled-out forms, so "fillmore street" finds "FILLMORE ST". */
const SPELLED: Record<string, string> = {
  st: "street",
  ave: "avenue",
  rd: "road",
  blvd: "boulevard",
  dr: "drive",
  pl: "place",
  ct: "court",
  ln: "lane",
  ter: "terrace",
  pkwy: "parkway",
  sq: "square",
  hwy: "highway",
  cir: "circle",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};

/** "3515 FILLMORE ST" → "3515 Fillmore St", "5TH AVE" → "5th Ave". */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());

function tokens(...parts: (string | null | undefined)[]): string {
  const words = new Set<string>();
  for (const p of parts) {
    for (const w of plain(p ?? "").split(" ")) {
      if (!w) continue;
      words.add(w);
      if (SPELLED[w]) words.add(SPELLED[w]);
    }
  }
  return ` ${[...words].join(" ")} `;
}

function addressSuggestions(file: ResolvedFile): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const a of file.addresses) {
    if (!a.normalised_street) continue;
    const label = titleCase(a.normalised_street);
    const detail = `${a.postal_city}, ${a.input.state}`;
    const q = `${label}, ${detail}`;
    if (seen.has(q)) continue;
    seen.add(q);
    out.push({ kind: "address", label, detail, q, id: a.address_id, t: tokens(a.normalised_street, a.postal_city, a.legal_city, a.input.state, a.input.zip) });
  }
  return out;
}

function placeSuggestions(): Suggestion[] {
  const out: Suggestion[] = [];
  const cities = JURISDICTIONS.filter((j) => j.level === "city");
  for (const j of cities) {
    const st = stateOf(j);
    const name = displayName(j);
    out.push({ kind: "place", label: name, detail: `City · ${st.legal_name}`, q: `${name}, ${st.id}`, t: tokens(name, st.id) });
  }
  for (const j of cities) {
    const city = plain(displayName(j));
    for (const alias of j.aliases) {
      const a = plain(alias);
      // Neighbourhoods only: not "LA", "San Fran" or "City of Los Angeles".
      if (a.length <= 3 || city.startsWith(a) || a.startsWith("city ")) continue;
      const st = stateOf(j).id;
      out.push({ kind: "place", label: alias, detail: `Part of ${displayName(j)}, ${st}`, q: alias, t: tokens(alias, st) });
    }
  }
  for (const j of JURISDICTIONS.filter((x) => x.level === "county")) {
    const st = stateOf(j);
    out.push({ kind: "place", label: j.legal_name, detail: `County · ${st.legal_name}`, q: `${j.legal_name}, ${st.id}`, t: tokens(j.legal_name, st.id) });
  }
  for (const j of JURISDICTIONS.filter((x) => x.level === "state")) {
    out.push({ kind: "place", label: j.legal_name, detail: "State", q: j.legal_name, t: tokens(j.legal_name, j.id) });
  }
  return out;
}

export const SUGGESTIONS: Suggestion[] = [...placeSuggestions(), ...addressSuggestions(data as unknown as ResolvedFile)];
