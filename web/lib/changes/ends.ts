// Rules ending (sunset or repeal) at one address, for the history column ("Ends: …").
// Only rules the engine marks as ending (a change source's `ending_rule_ids`, engine/diff.py until_sources) and only
// where the rule applies or may apply at this address; nothing is recomputed here.
//   Coming up: the rule is in this address's results today (applies / unknown) and its `effective_until` is after as-of.
//   Recently changed: the address's own end change in the diff (removed, before = applies / unknown), end date within
//   the last year. Typed addresses have no diff, so they only get upcoming ends.
// A version swap is not a protection ending: when a successor (same jurisdiction and topic, starting on the end date)
// applies at the address, the end is not listed; the successor's start event says it replaces the earlier version.
import type { AddressChanges, Source } from "./types.ts";

export type EndRule = { rule_id: string; jurisdiction_id: string; category: string; effective_date: string | null; effective_until?: string | null; citation: string };
export type EndResult = { rule_id: string; result: string };

export type RuleEnd = { ruleId: string; date: string; when: "future" | "past" };
export type VersionSwap = { from: string; to: string; date: string };

const LIVE = new Set(["applies", "unknown"]);

/** Every rule id some change source marks as ending. */
export function endingRuleIds(sources: Record<string, Pick<Source, "ending_rule_ids">> | null | undefined): Set<string> {
  return new Set(Object.values(sources ?? {}).flatMap((s) => s.ending_rule_ids ?? []));
}

export function ruleEnds(args: {
  asOf: string;
  results: EndResult[];
  rules: Record<string, EndRule>;
  sources: Record<string, Pick<Source, "ending_rule_ids">> | null | undefined;
  rec?: AddressChanges | null;
}): { ends: RuleEnd[]; swaps: VersionSwap[] } {
  const { asOf, results, rules, sources, rec } = args;
  const ending = endingRuleIds(sources);
  const yearAgo = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;
  const ends: RuleEnd[] = [];
  const swaps: VersionSwap[] = [];
  const seen = new Set<string>();
  const add = (ruleId: string, date: string, when: RuleEnd["when"], successor: string | undefined) => {
    const k = `${ruleId}@${date}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (successor) swaps.push({ from: ruleId, to: successor, date });
    else ends.push({ ruleId, date, when });
  };

  // Coming up: from today's results.
  const listed = new Map(results.map((r) => [r.rule_id, r.result]));
  for (const r of results) {
    const rule = rules[r.rule_id];
    const until = rule?.effective_until;
    if (!rule || !until || until <= asOf || !ending.has(rule.rule_id) || !LIVE.has(r.result)) continue;
    const succ = Object.values(rules).find(
      (s) =>
        s.rule_id !== rule.rule_id &&
        s.jurisdiction_id === rule.jurisdiction_id &&
        s.category === rule.category &&
        s.effective_date === until &&
        listed.has(s.rule_id) &&
        listed.get(s.rule_id) !== "pending",
    );
    add(rule.rule_id, until, "future", succ?.rule_id);
  }

  // Recently changed: from the address's own end changes in the diff.
  for (const e of rec?.entries ?? []) {
    const ids = sources?.[e.source]?.ending_rule_ids;
    if (!ids?.length) continue;
    for (const c of e.changes) {
      const until = c.effective_until;
      if (!until || !ids.includes(c.team_rule_id) || c.change !== "removed" || !LIVE.has(c.before?.result ?? "")) continue;
      if (until > asOf || until < yearAgo) continue;
      const succ = e.changes.find(
        (s) =>
          s.team_rule_id !== c.team_rule_id &&
          s.jurisdiction_id === c.jurisdiction_id &&
          s.category === c.category &&
          s.effective_from === until &&
          LIVE.has(s.after?.result ?? ""),
      );
      add(c.team_rule_id, until, "past", succ?.team_rule_id);
    }
  }
  return { ends, swaps };
}
