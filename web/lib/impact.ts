import { ruleStatusOn } from "./law.ts";
import type { Address, Dataset, LookupsByDate, Result, Rule } from "./types";

/*
  Impact colouring for a rule across all sample addresses on one date.
  Demo addresses use their hand-prepared results. Every other address is coloured
  from jurisdiction membership and the rule's dates only ("demo colouring"): where a
  rule depends on building facts, it shows "in the area, coverage not checked".
*/

export type ImpactClass = "applies" | "unknown" | "superseded" | "not_yet_effective" | "pending" | "area" | "none";

export const IMPACT_ORDER: ImpactClass[] = ["applies", "unknown", "not_yet_effective", "pending", "superseded", "area", "none"];

export const IMPACT_WORDS: Record<ImpactClass, string> = {
  applies: "Applies",
  unknown: "Unknown",
  not_yet_effective: "Not yet in force",
  pending: "Pending, not law",
  superseded: "Replaced by a stricter rule",
  area: "In the area, coverage not checked",
  none: "Not covered",
};

function stackOf(a: Address) {
  return [a.jurisdictions.state, a.jurisdictions.county, a.jurisdictions.city];
}

export function impactClass(rule: Rule, a: Address, date: string, lookups: LookupsByDate): ImpactClass {
  if (a.demo) {
    const r = lookups[date]?.[a.address_id]?.find((x) => x.rule_id === rule.rule_id);
    return r ? r.result : "none";
  }
  if (!stackOf(a).includes(rule.jurisdiction_id)) return "none";
  const st = ruleStatusOn(rule, date);
  if (!st || st === "failed") return "none";
  if (st === "pending") return "pending";
  if (st === "not_yet_effective") return "not_yet_effective";
  if (st === "effective_date_disputed") return "unknown";
  return rule.coverage_facts.length > 0 ? "area" : "applies";
}

/** Addresses where a level conflict is flagged on this date. */
export function conflictOn(rule: Rule, a: Address, date: string, lookups: LookupsByDate, rules: Rule[]): boolean {
  if (a.demo) {
    const r = lookups[date]?.[a.address_id]?.find((x) => x.rule_id === rule.rule_id);
    return !!r?.conflict_with?.length;
  }
  if (!stackOf(a).includes(rule.jurisdiction_id)) return false;
  const live = (r: Rule) => {
    const st = ruleStatusOn(r, date);
    return st === "in_force" || st === "not_yet_effective";
  };
  if (rule.interaction.type === "may_preempt_local" && live(rule)) {
    return rules.some(
      (r) => r.category === rule.category && r.interaction.type === "may_be_preempted" && r.jurisdiction_id === a.jurisdictions.city && live(r),
    );
  }
  if (rule.interaction.type === "may_be_preempted" && live(rule)) {
    return rules.some(
      (r) => r.category === rule.category && r.interaction.type === "may_preempt_local" && r.jurisdiction_id === a.jurisdictions.state && live(r),
    );
  }
  return false;
}

export type RuleImpact = {
  /** date → address id → class; the sample addresses in the rule's state only */
  classes: Record<string, Record<string, ImpactClass>>;
  /** date → address ids with a conflict flag */
  conflicts: Record<string, string[]>;
  /** addresses in the rule's state without coordinates (counted, not drawn) */
  noCoords: number;
  /** the featured example addresses in the state and their engine result per date (left out if never listed) */
  demo: { id: string; street: string; city: string; results: Record<string, Result | null> }[];
};

/** Which sample buildings a rule reaches, per as-of date: the rule page's impact section (/r/[id]) and the MCP get_rule. */
export function ruleImpact(data: Dataset, rule: Rule, stateId: string): RuleImpact {
  const dates = data.meta.as_of_dates.map((d) => d.date);
  const inState = data.addresses.filter((a) => a.jurisdictions.state === stateId);
  const classes: Record<string, Record<string, ImpactClass>> = {};
  const conflicts: Record<string, string[]> = {};
  for (const d of dates) {
    classes[d] = {};
    conflicts[d] = [];
    for (const a of inState) {
      classes[d][a.address_id] = impactClass(rule, a, d, data.lookups);
      if (conflictOn(rule, a, d, data.lookups, data.rules)) conflicts[d].push(a.address_id);
    }
  }
  const noCoords = inState.filter((a) => !a.coords).length;
  const demo = data.meta.demo_address_ids
    .map((aid) => data.addresses.find((a) => a.address_id === aid)!)
    .filter((a) => a.jurisdictions.state === stateId)
    .map((a) => ({
      id: a.address_id,
      street: a.street,
      city: a.postal_city,
      results: Object.fromEntries(
        dates.map((d) => [d, (data.lookups[d]?.[a.address_id]?.find((x) => x.rule_id === rule.rule_id) ?? null) as Result | null]),
      ),
    }))
    .filter((d) => Object.values(d.results).some(Boolean));
  return { classes, conflicts, noCoords, demo };
}

/** Count per class, in IMPACT_ORDER, zeros left out (the legend on the rule page). */
export function impactCounts(cls: Record<string, ImpactClass>): { cls: ImpactClass; count: number }[] {
  const counts = new Map<ImpactClass, number>();
  for (const c of Object.values(cls)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return IMPACT_ORDER.filter((c) => counts.get(c)).map((c) => ({ cls: c, count: counts.get(c)! }));
}
