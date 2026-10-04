import { CATEGORIES, ruleStatusOn } from "./law.ts";
import { ancestry, childrenOf, jurisdictionById } from "./jurisdiction-tree.ts";
import type { Address, Category, Dataset, Jurisdiction, Rule, RuleStatus } from "./types.ts";

/*
  What the jurisdiction page (/j/[id]) shows, as data: the crumb, the rules at this level and above
  (a county shows its state's rules only), the cities below it and the sample addresses here. Pure, so the
  page and the MCP tool get_jurisdiction build from one function.
*/

export type JurisdictionPageData = {
  j: Jurisdiction;
  chain: Jurisdiction[];
  rules: Rule[];
  children: Jurisdiction[];
  inPlace: Address[];
  demo: Address[];
};

export function jurisdictionPageData(data: Dataset, id: string): JurisdictionPageData | null {
  const j = jurisdictionById(id);
  if (!j) return null;
  const chain = ancestry(id);
  const stackIds = new Set(j.level === "county" ? chain.filter((x) => x.level === "state").map((x) => x.id) : chain.map((x) => x.id));
  const rules = data.rules
    .filter((r) => stackIds.has(r.jurisdiction_id))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "city" ? -1 : 1));
  const children = childrenOf(id);
  const inPlace = data.addresses.filter((a) => Object.values(a.jurisdictions).includes(id));
  const demo = inPlace.filter((a) => a.demo);
  return { j, chain, rules, children, inPlace, demo };
}

/** The six questions on a date: each question's rules with their status then; rules not on the books yet are left out. */
export function rulesByQuestion(rules: Rule[], asOf: string): { category: Category; list: { r: Rule; st: RuleStatus }[] }[] {
  return CATEGORIES.map((c) => ({
    category: c,
    list: rules
      .filter((r) => r.category === c)
      .map((r) => ({ r, st: ruleStatusOn(r, asOf) }))
      .filter((x): x is { r: Rule; st: RuleStatus } => x.st !== null),
  }));
}
