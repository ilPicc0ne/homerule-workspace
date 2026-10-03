// Building facts for the sample addresses, as ranges in the vocabulary of contracts/facts.json (I7).
// A missing or contradictory fact stays null ("unknown"), never guessed.
import type { FactSources, Facts, IntRange, SampleRow, UseClass } from "./types.ts";

export type FactOptions = {
  /** Count unit ranges read from use codes ("5+", "7–30", NJ class 4C) as known facts. Default on. */
  unitsFromUseCode?: boolean;
};

type CodeInfo = { units: IntRange | null; use_class: UseClass | null; subsidised: boolean | null; why: string };

const range = (min: number, max: number | null): IntRange => ({ min, max });

function intersect(a: IntRange, b: IntRange): IntRange | null {
  const min = Math.max(a.min, b.min);
  const max = a.max === null ? b.max : b.max === null ? a.max : Math.min(a.max, b.max);
  return max !== null && min > max ? null : { min, max };
}

const show = (r: IntRange) => (r.max === null ? `${r.min}+` : r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

/**
 * Unit count from an NJ MOD-IV building description: "3S-B-D-6U-H" → 6, "3B-7U/4B-24U-G" (two
 * buildings) → 24–31. Storeys ("3SB" = 3 storeys, brick) are never units, and glued tokens like
 * "3SB2UG" are ambiguous and ignored.
 */
export function unitsFromDescription(desc: string): IntRange | null {
  const d = desc.toUpperCase().replace(/(\d)O(?=U)/g, (_m, digit: string) => `${digit}0`); // "5B-1OU" typo
  const counts: number[] = [];
  const parts = d.split("/");
  for (const part of parts) {
    const m = part.match(/(?<![\d.])(\d+)U(?![A-Z])/);
    if (m) counts.push(Number(m[1]));
  }
  if (!counts.length) return null;
  const sum = counts.reduce((a, b) => a + b, 0);
  return parts.length > 1 ? range(Math.max(...counts), sum) : range(counts[0], counts[0]);
}

/** What the dataset's use code and description say about the building. */
export function codeInfo(row: SampleRow): CodeInfo | null {
  const desc = row.use_description.trim();
  const D = desc.toUpperCase();
  const code = row.use_code.trim();

  if (code === "4C" || /NJOGIS/.test(row.source_dataset)) {
    // NJ property class 4C = apartments, five or more dwelling units (N.J.A.C. 18:12-2.2).
    const klass = code === "4C" ? range(5, null) : null;
    const parsed = unitsFromDescription(desc);
    let units = klass;
    let why = `NJ class ${code}`;
    if (parsed) {
      units = klass ? intersect(klass, parsed) : parsed;
      why = units ? `NJ class ${code}, building description "${desc}"` : `NJ class ${code} (${klass ? show(klass) : "?"}) contradicts "${desc}" (${show(parsed)})`;
    }
    const use_class: UseClass | null = /CO-?OP/.test(D) ? "co_op" : code === "4C" ? "apartment" : null;
    return { units, use_class, subsidised: null, why };
  }

  if (/SUBSD HOUSING/.test(D)) return { units: null, use_class: "subsidised_housing", subsidised: true, why: desc };
  if (/ELDERLY HOME/.test(D)) return { units: null, use_class: null, subsidised: null, why: desc };
  if (/LUXURY APARTMENT/.test(D)) return { units: null, use_class: "apartment", subsidised: null, why: desc };

  let m: RegExpMatchArray | null;
  if ((m = D.match(/APT (\d+)-(\d+) UNITS/))) return { units: range(+m[1], +m[2]), use_class: "apartment", subsidised: null, why: desc };
  if ((m = D.match(/^(MXD )?(\d+)-(\d+)-UNIT-APT$/))) return { units: range(+m[2], +m[3]), use_class: m[1] ? "mixed_use" : "apartment", subsidised: null, why: desc };
  if ((m = D.match(/^(MXD )?>(\d+)-UNIT-APT$/))) return { units: range(+m[2] + 1, null), use_class: m[1] ? "mixed_use" : "apartment", subsidised: null, why: desc };
  if ((m = D.match(/(\d+) TO (\d+) UNITS/))) {
    return { units: range(+m[1], +m[2]), use_class: /STORE/.test(D) ? "mixed_use" : "apartment", subsidised: null, why: desc };
  }
  if ((m = D.match(/(\d+) UNITS OR MORE/))) return { units: range(+m[1], null), use_class: "apartment", subsidised: null, why: desc };
  if ((m = D.match(/(\d+) UNITS OR LESS/))) return { units: range(1, +m[1]), use_class: null, subsidised: null, why: desc };
  if (/FIVE OR MORE APARTMENTS|\(5\+ UNITS\)/.test(D)) return { units: range(5, null), use_class: "apartment", subsidised: null, why: desc };
  return null;
}

export type BuiltFacts = { facts: Facts; source: FactSources; confidence: { built: number; units: number }; review: string[] };

export function buildFacts(row: SampleRow, opts: FactOptions = {}): BuiltFacts {
  const unitsFromUseCode = opts.unitsFromUseCode ?? true;
  const review: string[] = [];

  const y = row.year_built.trim();
  const year = /^\d{4}$/.test(y) && +y >= 1700 && +y <= 2030 ? +y : null;
  if (y && year === null) review.push(`built: unreadable year "${y}"`);

  const info = codeInfo(row);
  if (info && !info.units && /contradicts/.test(info.why)) review.push(`units: ${info.why}`);

  const csvUnits = /^\d+$/.test(row.units.trim()) ? Number(row.units.trim()) : null;
  let units: IntRange | null = null;
  let unitSource: FactSources["units"] = "none";
  if (csvUnits !== null) {
    if (info?.units && !intersect(info.units, range(csvUnits, csvUnits))) {
      review.push(`units: CSV says ${csvUnits}, but ${info.why} says ${show(info.units)}`);
    } else {
      units = range(csvUnits, csvUnits);
      unitSource = "csv";
    }
  } else if (unitsFromUseCode && info?.units) {
    units = info.units;
    unitSource = "use_code";
  }

  return {
    facts: {
      built: year === null ? null : { from: `${year}-01-01`, to: `${year}-12-31` },
      units,
      use_class: info?.use_class ?? null,
      subsidised: info?.subsidised ?? null,
      owner_type: null,
      owner_occupied: null,
    },
    source: {
      built: year === null ? "none" : "csv",
      units: unitSource,
      use_class: info?.use_class ? "use_code" : "none",
      subsidised: info?.subsidised !== null && info?.subsidised !== undefined ? "use_code" : "none",
    },
    confidence: {
      built: year === null ? 0 : 0.9,
      units: unitSource === "csv" ? 0.95 : unitSource === "use_code" ? 0.85 : 0,
    },
    review,
  };
}
