// The change log for a whole city or state: the per-address diff (I6) of the sample addresses there, grouped by
// rule, with how many addresses each transition touches. Counts only; nothing is recomputed.
import type { ChangesFile, Entry } from "./types.ts";
import { changeLine } from "./wording.ts";

export type PlaceRuleChange = {
  team_rule_id: string;
  title: string | null;
  citation: string | null;
  requirement_quote: string | null;
  source_url: string | null;
  effective_from: string | null;
  jurisdiction_id: string;
  category: string;
  /** "Enacted, not yet in effect → Applies" → number of addresses. */
  transitions: Record<string, number>;
  affected: number;
  address_ids: string[];
  sources: string[];
  demo_label: string | null;
};

/** In a date window: the entry's later as-of date inside [from, to] (either end open). */
export function entryInWindow(e: Entry, from?: string, to?: string): boolean {
  return (!from || e.after_as_of >= from) && (!to || e.after_as_of <= to);
}

export function changesForPlace(file: ChangesFile, jurisdictionId: string, window: { from?: string; to?: string } = {}) {
  const ids = Object.entries(file.addresses)
    .filter(([, a]) => Object.values(a.jurisdictions).includes(jurisdictionId))
    .map(([id]) => id);
  const byRule = new Map<string, PlaceRuleChange & { _ids: Set<string> }>();
  for (const id of ids) {
    for (const e of file.addresses[id].entries) {
      if (!entryInWindow(e, window.from, window.to)) continue;
      for (const c of e.changes) {
        const g =
          byRule.get(c.team_rule_id) ??
          ({
            team_rule_id: c.team_rule_id,
            title: c.title,
            citation: c.citation,
            requirement_quote: c.requirement_quote,
            source_url: c.source_url,
            effective_from: c.effective_from,
            jurisdiction_id: c.jurisdiction_id,
            category: c.category,
            transitions: {},
            affected: 0,
            address_ids: [],
            sources: [],
            demo_label: e.demo_label,
            _ids: new Set<string>(),
          } as PlaceRuleChange & { _ids: Set<string> });
        const line = changeLine(c) || "no change in result";
        g.transitions[line] = (g.transitions[line] ?? 0) + 1;
        g._ids.add(id);
        if (!g.sources.includes(e.source)) g.sources.push(e.source);
        g.demo_label = g.demo_label ?? e.demo_label;
        byRule.set(c.team_rule_id, g);
      }
    }
  }
  const rules = [...byRule.values()]
    .map(({ _ids, ...g }) => ({ ...g, affected: _ids.size, address_ids: [..._ids].sort() }))
    .sort((a, b) => b.affected - a.affected || a.team_rule_id.localeCompare(b.team_rule_id));
  return { sample_addresses: ids.length, rules };
}
