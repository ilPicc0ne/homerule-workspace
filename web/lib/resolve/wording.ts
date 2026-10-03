// Renter-facing text for /where. The API keeps the raw strings; these are for people.
import type { AddressResult, Facts, PlaceResult } from "./types.ts";

const fmtRange = (r: { min: number; max: number | null }) => (r.max === null ? `${r.min} or more` : r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

/** Facts panel rows: [label, value, where it comes from]. */
export function factRows(sample: NonNullable<AddressResult["sample"]>): [string, string, string][] {
  const f = sample.facts;
  const src = sample.source;
  return [
    ["Year built", f.built ? f.built.from.slice(0, 4) : "Unknown", src.built === "csv" ? "property record" : "not in the data"],
    ["Units", f.units ? fmtRange(f.units) : "Unknown", src.units === "csv" ? "property record" : src.units === "use_code" ? "from the use code" : "not in the data"],
    [
      "Use",
      f.use_class ? f.use_class.replace(/_/g, " ") : "Unknown",
      src.use_class === "use_code" ? "from the use code" : src.use_class === "assumption" ? "assumed" : "not in the data",
    ],
    [
      "Subsidised",
      f.subsidised === null ? "Unknown" : f.subsidised ? "Yes" : "No",
      src.subsidised === "use_code"
        ? "from the use code"
        : src.subsidised === "assumption"
          ? f.subsidised === false
            ? "assumed: no affordability code in the record"
            : "assumed"
          : "not in the data",
    ],
    ["Owner type", "Unknown", "never in the data"],
  ];
}

const cities = (n: number) => (n === 1 ? "1 city" : `${n} cities`);

/**
 * Lead for a state or county searched on its own, which has no local level of its own:
 * "HomeRule has California state rules, and local rules for 5 cities here." Null otherwise
 * (a city, a ZIP, or a town not on the list that fell back to its state).
 */
export function placeLead(r: PlaceResult): string | null {
  if (r.coverage === "not_covered" || !r.children.length) return null;
  const last = r.tree[r.tree.length - 1];
  const state = r.tree.find((l) => l.level === "state");
  if (!state) return null;
  if (last.level === "county" && r.matched.via === "county") {
    return `HomeRule has ${state.name} state rules, and local rules for ${cities(r.children.length)} in this county.`;
  }
  if (last.level === "state" && r.matched.via === "state" && r.matched.text === state.name) {
    return `HomeRule has ${state.name} state rules, and local rules for ${cities(r.children.length)} here.`;
  }
  return null;
}

/** Review flags from the batch run ("units: CSV says 15, but …") in plain language, by field prefix. */
export function reviewText(review: string[], facts: Pick<Facts, "units" | "built">): string[] {
  const out = new Set<string>();
  for (const r of review) {
    const field = r.split(":")[0].trim();
    if (field === "units") {
      out.add(
        facts.units
          ? "The property records disagree on the number of units; check the figure shown."
          : "The property records disagree on the number of units, so it's shown as unknown.",
      );
    } else if (field === "built") {
      out.add("The year built in the property record can't be read, so it's shown as unknown.");
    } else if (field === "jurisdiction") {
      out.add("The address records disagree on which city this address is in, or couldn't confirm it; check the city shown above.");
    } else {
      out.add("Some of this building's records need checking by hand.");
    }
  }
  return [...out];
}
