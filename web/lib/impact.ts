import { ruleStatusOn } from "./law";
import type { Address, LookupsByDate, Rule } from "./types";

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
