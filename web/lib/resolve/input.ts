// Reads free text from the search box: a street address (goes to Census), a place (resolved through
// our jurisdiction list), a ZIP on its own, or nothing.
import { isStreetSuffix } from "./normalise.ts";
import { STATES, stateByAbbr, type StateInfo } from "./states.ts";

export type ParsedInput = {
  text: string;
  kind: "empty" | "zip" | "address" | "place";
  /** Address: the street line when commas separate it; otherwise the whole text without state and ZIP. */
  street: string | null;
  /** Address: the typed city, when commas make it clear. */
  city: string | null;
  /** Place: the text left once state and ZIP are taken off ("" when only a state was typed). */
  place: string | null;
  state: StateInfo | null;
  zip: string | null;
};

const NAMES = [...STATES].sort((a, b) => b.name.length - a.name.length);
const HOUSE_NUMBER = /^\d+[A-Za-z]?(-\d+[A-Za-z]?)?\s+\S/;

export function parseInput(raw: string): ParsedInput {
  const text = raw.replace(/\s+/g, " ").trim();
  const out: ParsedInput = { text, kind: "empty", street: null, city: null, place: null, state: null, zip: null };
  if (!text) return out;

  if (/^\d{5}(-\d{4})?$/.test(text)) {
    return { ...out, kind: "zip", zip: text.slice(0, 5) };
  }

  let work = text;
  const zip = work.match(/(?:^|[\s,])(\d{5})(?:-\d{4})?$/);
  if (zip) {
    out.zip = zip[1];
    work = work.slice(0, zip.index).trim();
  }
  work = work.replace(/[\s,]+$/, "");

  // State at the end, by full name ("…, New Jersey") or by abbreviation after a separator ("…, NJ", "boston ma").
  const lower = work.toLowerCase();
  for (const s of NAMES) {
    const n = s.name.toLowerCase();
    if (lower === n || lower.endsWith(` ${n}`) || lower.endsWith(`,${n}`)) {
      out.state = s;
      work = work.slice(0, work.length - n.length);
      break;
    }
  }
  if (!out.state) {
    const abbr = work.match(/[\s,]([A-Za-z]{2})$/);
    const s = abbr && stateByAbbr.get(abbr[1].toUpperCase());
    // "734 Jamaica Ct", "4115 LINCOLN WY": without commas or a ZIP, a trailing CT/WY after a house
    // number is the street suffix (Court, Way), not Connecticut or Wyoming.
    const suffix = !!abbr && !out.zip && !work.includes(",") && HOUSE_NUMBER.test(work) && isStreetSuffix(abbr[1]);
    if (s && !suffix) {
      out.state = s;
      work = work.slice(0, work.length - 2);
    }
  }
  work = work.replace(/[\s,]+$/, "").trim();

  if (HOUSE_NUMBER.test(work)) {
    const parts = work.split(",").map((p) => p.trim()).filter(Boolean);
    out.kind = "address";
    out.street = parts[0];
    out.city = parts.length > 1 ? parts[parts.length - 1] : null;
    return out;
  }

  out.kind = "place";
  out.place = work;
  return out;
}
