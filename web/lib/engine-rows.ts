import type { Category, EvaluatedValue, Result, ResultValue, Rule } from "./types.ts";

export const FACT_WORDS: Record<string, string> = {
  built: "the year the building was built",
  units: "the number of units",
  use_class: "what the building is used for",
  subsidised: "whether the building is subsidised",
  owner_type: "who owns the building (a person or a company)",
  owner_occupied: "whether the owner lives in the building",
};

/** I4's full engine row, before the existing page projection. */
export type EngineRow = {
  value?: EvaluatedValue;
  team_rule_id: string;
  category: Category;
  result: ResultValue;
  confidence?: number;
  explanation: string;
  missing: string[];
  missing_deciding?: string[];
  governed_by?: string | null;
  conflict_with?: string[];
  conflict_flag?: boolean;
};

/** One mapping for build-time sample rows and live typed-address rows. */
export function engineRows(rows: EngineRow[], rules: Pick<Rule, "rule_id" | "what_next">[]): Result[] {
  const byId = new Map(rules.map(r => [r.rule_id, r]));
  return rows.filter(r => byId.has(r.team_rule_id)).map(r => {
    const rule = byId.get(r.team_rule_id)!;
    const missing = (r.missing_deciding ?? r.missing)
      .filter(m => !m.startsWith("unparsed")).map(m => FACT_WORDS[m] ?? m);
    const out: Result = {
      rule_id: r.team_rule_id,
      category: r.category,
      result: r.result,
      confidence: r.confidence ?? 0,
      explanation: r.explanation,
      ...(r.value != null ? { value: r.value } : {}),
      what_next: r.result === "unknown" && missing.length
        ? { label: `Ask your landlord or the city's housing office about ${missing.join(" and ")}` }
        : rule.what_next,
    };
    if (r.governed_by) out.governed_by = r.governed_by;
    if (r.conflict_with?.length) out.conflict_with = r.conflict_with;
    if (missing.length) out.missing_facts = missing;
    return out;
  });
}
