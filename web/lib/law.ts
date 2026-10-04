import type { Category, Result, ResultValue, Rule, RuleStatus } from "./types";

/* Plain-language vocabulary and the small pieces of logic the pages share. */

export const CATEGORIES: Category[] = [
  "rent_increase_limits",
  "just_cause_eviction",
  "security_deposits",
  "application_screening_fees",
  "screening_restrictions",
  "algorithmic_rent_setting",
];

export const QUESTION: Record<Category, string> = {
  rent_increase_limits: "How much can my rent go up?",
  just_cause_eviction: "When can they end my tenancy?",
  security_deposits: "How much deposit can they ask?",
  application_screening_fees: "What can they charge me to apply?",
  screening_restrictions: "What can they check about me?",
  algorithmic_rent_setting: "Can rent-setting software be used on my rent?",
};

export const CATEGORY_SHORT: Record<Category, string> = {
  rent_increase_limits: "Rent increases",
  just_cause_eviction: "Eviction protection",
  security_deposits: "Deposits",
  application_screening_fees: "Application fees",
  screening_restrictions: "Screening",
  algorithmic_rent_setting: "Rent-setting software",
};

export const RESULT_WORDS: Record<ResultValue, string> = {
  applies: "Applies",
  unknown: "Unknown",
  superseded: "Replaced by a stricter rule",
  not_yet_effective: "Not yet in force",
  pending: "Proposed, not law",
};

export const STATUS_WORDS: Record<RuleStatus, string> = {
  in_force: "In force",
  not_yet_effective: "Enacted, not yet in force",
  pending: "Proposed, not law",
  failed: "Failed, never became law",
  effective_date_disputed: "Effective date disputed",
};

export const LEVEL_WORDS = { state: "State law", county: "County", city: "City law" } as const;

/** Rule status on a date, from its status history. null = not on the books yet. */
export function ruleStatusOn(rule: Rule, asOf: string): RuleStatus | null {
  const hist = rule.status_history;
  if (!hist || hist.length === 0) return rule.status;
  let current: RuleStatus | null = null;
  for (const h of hist) {
    if (h.from === null || h.from <= asOf) current = h.status;
  }
  return current;
}

/** Next status change strictly after a date, if any. */
export function nextChange(rule: Rule, asOf: string): { date: string; status: RuleStatus } | null {
  for (const h of rule.status_history ?? []) {
    if (h.from && h.from > asOf) return { date: h.from, status: h.status };
  }
  return null;
}

// ---------- the six cards ----------

export type CardStatus = "applies" | "unknown" | "none";

export type Card = {
  category: Category;
  status: CardStatus;
  /** Something enacted-but-later or proposed is in this category. */
  changing: boolean;
  lead: Result | null;
  results: Result[];
};

const LEVEL_RANK = { city: 0, state: 1 } as const;

export function buildCard(category: Category, results: Result[], rules: Record<string, Rule>): Card {
  const inCat = results.filter((r) => r.category === category);
  const byLevel = (a: Result, b: Result) =>
    LEVEL_RANK[rules[a.rule_id]?.level ?? "state"] - LEVEL_RANK[rules[b.rule_id]?.level ?? "state"];

  const applies = inCat.filter((r) => r.result === "applies" && rules[r.rule_id]?.kind === "rule").sort(byLevel);
  const unknown = inCat.filter((r) => r.result === "unknown").sort(byLevel);
  const finding = inCat.filter((r) => r.result === "applies" && rules[r.rule_id]?.kind === "no_rule");
  const coming = inCat.filter((r) => r.result === "not_yet_effective" || r.result === "pending");
  const superseded = inCat.filter((r) => r.result === "superseded");

  const status: CardStatus = applies.length ? "applies" : unknown.length ? "unknown" : "none";
  const lead = applies[0] ?? unknown[0] ?? finding[0] ?? coming[0] ?? null;
  const order = [...applies, ...unknown, ...finding, ...coming, ...superseded];
  return { category, status, changing: coming.length > 0, lead, results: order };
}

export function buildCards(results: Result[], rules: Record<string, Rule>): Card[] {
  return CATEGORIES.map((c) => buildCard(c, results, rules));
}

// ---------- diff between two dates (one computation for change log, email, coming up) ----------

export type ChangeEntry = {
  rule_id: string;
  from: ResultValue | null;
  to: ResultValue | null;
  conflictAdded?: boolean;
};

export function diffResults(before: Result[], after: Result[]): ChangeEntry[] {
  const a = new Map(before.map((r) => [r.rule_id, r]));
  const b = new Map(after.map((r) => [r.rule_id, r]));
  const ids = new Set([...a.keys(), ...b.keys()]);
  const out: ChangeEntry[] = [];
  for (const id of ids) {
    const x = a.get(id);
    const y = b.get(id);
    const from = x?.result ?? null;
    const to = y?.result ?? null;
    const conflictAdded = !x?.conflict_with?.length && !!y?.conflict_with?.length;
    if (from !== to || conflictAdded) out.push({ rule_id: id, from, to, conflictAdded: conflictAdded || undefined });
  }
  return out;
}

export function resultWord(v: ResultValue | null): string {
  return v ? RESULT_WORDS[v] : "Not listed";
}
