// Building facts for the sample addresses, as ranges in the vocabulary of contracts/facts.json (I7).
// A missing or contradictory fact stays null ("unknown"). Where a fact is filled in by a rule of thumb
// rather than read from the record, it is named in `assumptions` and its source says so.
//
// Remaining named assumptions describe Boston use-code interpretations only.
// A missing affordability code does not establish that a property is unsubsidised.
import type { FactSourceDetail, FactSources, Facts, IntRange, SampleRow, UseClass } from "./types.ts";

export type FactOptions = {
  /** Count unit ranges read from use codes ("5+", "7–30", NJ class 4C) as known facts. Default on. */
  unitsFromUseCode?: boolean;
};

export const ASSUMPTIONS = {
  bostonA7: "boston_land_use_A_is_7_plus",
  elderlyApartment: "boston_elderly_home_is_apartment",
} as const;

type CodeInfo = {
  units: IntRange | null;
  use_class: UseClass | null;
  subsidised: boolean | null;
  why: string;
  /** Short human strings for source_detail. */
  unitsDetail: string;
  useClassDetail: string;
  subsidisedDetail: string;
  /** Assumptions behind units (only count when units come from the use code) and behind use_class. */
  unitsAssumptions: string[];
  useClassAssumptions: string[];
};

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

type Partial3 = { units: IntRange | null; use_class: UseClass | null; subsidised: boolean | null };

/** Use-code tables of the non-NJ datasets: description → units, use class, subsidised. */
function fromDescription(D: string): Partial3 | null {
  if (/SUBSD HOUSING/.test(D)) return { units: null, use_class: "subsidised_housing", subsidised: true };
  if (/ELDERLY HOME/.test(D)) return { units: null, use_class: null, subsidised: null };
  if (/LUXURY APARTMENT/.test(D)) return { units: null, use_class: "apartment", subsidised: null };

  let m: RegExpMatchArray | null;
  if ((m = D.match(/APT (\d+)-(\d+) UNITS/))) return { units: range(+m[1], +m[2]), use_class: "apartment", subsidised: null };
  if ((m = D.match(/^(MXD )?(\d+)-(\d+)-UNIT-APT$/))) return { units: range(+m[2], +m[3]), use_class: m[1] ? "mixed_use" : "apartment", subsidised: null };
  if ((m = D.match(/^(MXD )?>(\d+)-UNIT-APT$/))) return { units: range(+m[2] + 1, null), use_class: m[1] ? "mixed_use" : "apartment", subsidised: null };
  if ((m = D.match(/(\d+) TO (\d+) UNITS/))) return { units: range(+m[1], +m[2]), use_class: /STORE/.test(D) ? "mixed_use" : "apartment", subsidised: null };
  if ((m = D.match(/(\d+) UNITS OR MORE/))) return { units: range(+m[1], null), use_class: "apartment", subsidised: null };
  if ((m = D.match(/(\d+) UNITS OR LESS/))) return { units: range(1, +m[1]), use_class: null, subsidised: null };
  if (/FIVE OR MORE APARTMENTS|\(5\+ UNITS\)/.test(D)) return { units: range(5, null), use_class: "apartment", subsidised: null };
  return null;
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
    let unitsDetail = klass ? `NJ class ${code} (${show(klass)} units)` : `NJ class ${code}`;
    if (parsed) {
      units = klass ? intersect(klass, parsed) : parsed;
      why = units ? `NJ class ${code}, building description "${desc}"` : `NJ class ${code} (${klass ? show(klass) : "?"}) contradicts "${desc}" (${show(parsed)})`;
      unitsDetail = `NJ class ${code}, building description "${desc}"`;
    }
    const coop = /CO-?OP/.test(D);
    const use_class: UseClass | null = coop ? "co_op" : code === "4C" ? "apartment" : null;
    const affordable = /AFFORDABL/.test(D);
    return {
      units,
      use_class,
      subsidised: affordable ? true : null,
      why,
      unitsDetail,
      useClassDetail: coop ? `NJ building description "${desc}" (co-op)` : `NJ class ${code} (apartments, 5+ units)`,
      subsidisedDetail: `NJ building description "${desc}"`,
      unitsAssumptions: [],
      useClassAssumptions: [],
    };
  }

  const found = fromDescription(D);
  const detail = `use code ${code} '${desc}'`;
  const info: CodeInfo | null = found && {
    ...found,
    why: desc,
    unitsDetail: detail,
    useClassDetail: detail,
    subsidisedDetail: detail,
    unitsAssumptions: [],
    useClassAssumptions: [],
  };

  // Boston land use "A" = apartment building with 7+ units (Boston assessing land-use table). Used only when the
  // description gives no range of its own ("APT 7-30 UNITS" keeps 7–30).
  if (/^Boston Property Assessment/.test(row.source_dataset) && code.startsWith("A/")) {
    const b: CodeInfo = info ?? { units: null, use_class: null, subsidised: null, why: desc, unitsDetail: detail, useClassDetail: detail, subsidisedDetail: detail, unitsAssumptions: [], useClassAssumptions: [] };
    if (!b.units) {
      b.units = range(7, null);
      b.unitsDetail = `Boston land use ${code} '${desc}' (land use A = 7+ units, assumed)`;
      b.unitsAssumptions = [ASSUMPTIONS.bostonA7];
    }
    if (!b.use_class && /ELDERLY HOME/.test(D)) {
      b.use_class = "apartment";
      b.useClassDetail = `Boston land use ${code} '${desc}' (counted as an apartment building, assumed)`;
      b.useClassAssumptions = [ASSUMPTIONS.elderlyApartment];
    }
    return b;
  }
  return info;
}

export type BuiltFacts = {
  facts: Facts;
  source: FactSources;
  source_detail: FactSourceDetail;
  /** Named assumptions behind the facts, sorted and unique. */
  assumptions: string[];
  confidence: { built: number; units: number };
  review: string[];
};

export function buildFacts(row: SampleRow, opts: FactOptions = {}): BuiltFacts {
  const unitsFromUseCode = opts.unitsFromUseCode ?? true;
  const review: string[] = [];
  const assumptions = new Set<string>();

  const y = row.year_built.trim();
  const year = /^\d{4}$/.test(y) && +y >= 1700 && +y <= 2030 ? +y : null;
  if (y && year === null) review.push(`built: unreadable year "${y}"`);

  const info = codeInfo(row);
  if (info && !info.units && /contradicts/.test(info.why)) review.push(`units: ${info.why}`);

  const csvUnits = /^\d+$/.test(row.units.trim()) ? Number(row.units.trim()) : null;
  let units: IntRange | null = null;
  let unitSource: FactSources["units"] = "none";
  let unitsDetail: string | null = null;
  if (csvUnits !== null) {
    if (info?.units && !intersect(info.units, range(csvUnits, csvUnits))) {
      review.push(`units: CSV says ${csvUnits}, but ${info.why} says ${show(info.units)}`);
    } else {
      units = range(csvUnits, csvUnits);
      unitSource = "csv";
      unitsDetail = `CSV units, ${row.source_dataset}`;
    }
  } else if (unitsFromUseCode && info?.units) {
    units = info.units;
    unitSource = "use_code";
    unitsDetail = info.unitsDetail;
    info.unitsAssumptions.forEach((a) => assumptions.add(a));
  }

  const use_class = info?.use_class ?? null;
  const useClassSource: FactSources["use_class"] = !use_class ? "none" : info?.useClassAssumptions.length ? "assumption" : "use_code";
  if (use_class) info?.useClassAssumptions.forEach((a) => assumptions.add(a));

  // Only an explicit affordability indicator establishes subsidy status.
  const subsidised: boolean | null = info?.subsidised ?? null;
  const subsidisedSource: FactSources["subsidised"] = subsidised === null ? "none" : "use_code";
  const subsidisedDetail: string | null = subsidised === null ? null : info!.subsidisedDetail;

  return {
    facts: {
      built: year === null ? null : { from: `${year}-01-01`, to: `${year}-12-31` },
      units,
      use_class,
      subsidised,
      owner_type: null,
      owner_occupied: null,
    },
    source: {
      built: year === null ? "none" : "csv",
      units: unitSource,
      use_class: useClassSource,
      subsidised: subsidisedSource,
    },
    source_detail: {
      built: year === null ? null : `year_built, ${row.source_dataset}`,
      units: unitsDetail,
      use_class: use_class ? info!.useClassDetail : null,
      subsidised: subsidisedDetail,
    },
    assumptions: [...assumptions].sort(),
    confidence: {
      built: year === null ? 0 : 0.9,
      units: unitSource === "csv" ? 0.95 : unitSource === "use_code" ? 0.85 : 0,
    },
    review,
  };
}
