import type { Badge } from "./changes/impact.ts";
import { ruleEnds } from "./changes/ends.ts";
import type { AddressChanges, Source } from "./changes/types.ts";
import { contactFor, type Contact } from "./contacts.ts";
import { formatDate } from "./format.ts";
import { missingFacts } from "./missing.ts";
import { CALL_ITEMS, FACT_PLAIN, PLAIN, TOPICS, isCarveOut, type TopicId } from "./plain.ts";
import type { Address, Finding, Result, Rule } from "./types";

export { contactFor, type Contact };

/*
  View model for the one-view address page (mockup v3). Pure: the server page feeds it the
  address, its engine results for one as-of date and the rules; the client only renders.
  Engine results decide every status; this file only words them.
*/

export type TileStatus = "protect" | "depends" | "none";

/** The tile status in words, as the address page shows it. */
export const TILE_STATUS_WORDS: Record<TileStatus, string> = {
  protect: "There’s a rule",
  depends: "We’re missing one fact",
  none: "No local rule — state basics only",
};

/** The page's "at a glance" sentences, from the tile statuses. */
export function glanceSummary(tiles: { status: TileStatus }[]): string[] {
  const counts = { protect: 0, depends: 0, none: 0 } as Record<TileStatus, number>;
  tiles.forEach((t) => counts[t.status]++);
  const n = (k: TileStatus, one: string, many: string) => `${counts[k]} ${counts[k] === 1 ? one : many}`;
  const sum: string[] = [];
  if (counts.protect === 6) sum.push("There’s a rule for each of the 6 topics at this address.");
  else if (counts.protect) sum.push(`There’s a rule for ${n("protect", "topic", "topics")}.`);
  if (counts.depends) sum.push(`For ${n("depends", "topic", "topics")}, we’re missing one fact.`);
  if (counts.none) sum.push(`For ${n("none", "topic", "topics")}, there’s no local rule, so state basics apply.`);
  return sum;
}

export type RuleRow = {
  rule_id: string;
  level: "state" | "city";
  where: string;
  title: string;
  /** applies · replaced · depends · starts · proposed */
  st: "applies" | "replaced" | "depends" | "starts" | "proposed";
  stWord: string;
  quote: string | null;
  why: string | null;
  citation: string;
  sourceUrl: string | null;
  sourceName: string | null;
  meta: string[];
};

export type Helper =
  | { kind: "call" | "check"; title: string; items: string[] }
  | { kind: "email"; title: string; text: string };

export type Tile = {
  id: TopicId;
  title: string;
  q: string;
  icon: string;
  group: "live" | "move";
  short: string;
  status: TileStatus;
  line: string;
  notes: { kind: "depends" | "date" | "proposed" | "failed" | "flag"; text: string }[];
  from: string;
  fromCity: boolean;
  expl: string;
  missing: { fact: string; why: string }[];
  flag: { head: string; body: string } | null;
  contact: Contact | null;
  helpers: Helper[];
  next: { label: string; url: string }[];
  lawNotes: string[];
  rules: RuleRow[];
};

/** `badge`: the renter-impact badge of this rule's diff change at this address (lib/changes/impact.ts eventBadge), set by
 *  view-props only when PAGE_BADGES is on; never derived from the event itself. */
export type TimelineEvent = {
  date: string;
  dateText: string;
  topic: TopicId;
  title: string;
  body?: string;
  ruleId: string;
  /** "end": the rule's own end date (sunset or repeal, lib/changes/ends.ts); its badge comes from endBadge. */
  kind?: "start" | "end";
  badge?: Badge | null;
};

export type AddressView = {
  street: string;
  postal: string;
  asOf: string;
  asOfText: string;
  next: TimelineEvent | null;
  tiles: Tile[];
  future: TimelineEvent[];
  past: TimelineEvent[];
  proposed: { rule_id: string; title: string; citation: string; url: string | null }[];
};

const STATE_NAME: Record<string, string> = { CA: "California", MA: "Massachusetts", NJ: "New Jersey" };

function hostName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function confWord(n: number): string {
  return n >= 0.85 ? "high" : n >= 0.65 ? "medium" : "low";
}

function plainLine(rule: Rule | undefined): string {
  if (!rule) return "";
  return PLAIN[rule.rule_id]?.line || rule.summary;
}

function whereName(rule: Rule, cityName: string): string {
  return rule.level === "city" ? `City of ${cityName}` : `State of ${STATE_NAME[rule.jurisdiction_id] ?? rule.jurisdiction_id}`;
}

const isWeak = (id: string) => !!PLAIN[id]?.weak;
const ORDER = Object.keys(PLAIN);
const rank = (id: string) => (ORDER.indexOf(id) < 0 ? 999 : ORDER.indexOf(id));


export function buildAddressView(args: {
  address: Address;
  results: Result[];
  rules: Record<string, Rule>;
  asOf: string;
  cityName: string;
  findings: Record<string, Finding[]>;
  /** The diff's change sources (for `ending_rule_ids`) and this address's diff record (null for a typed address). */
  changes?: { sources: Record<string, Source>; rec: AddressChanges | null };
}): AddressView {
  const { address, results, rules, asOf, cityName } = args;
  const state = address.jurisdictions.state;
  const city = address.jurisdictions.city || null;
  const stateName = STATE_NAME[state] ?? state;

  const tiles: Tile[] = TOPICS.map((t) => {
    const inCat = results.filter((r) => r.category === t.cat && rules[r.rule_id]);
    const cityFirst = (a: Result, b: Result) =>
      Number(isCarveOut(rules[a.rule_id])) - Number(isCarveOut(rules[b.rule_id])) ||
      (rules[a.rule_id].level === "city" ? 0 : 1) - (rules[b.rule_id].level === "city" ? 0 : 1) || rank(a.rule_id) - rank(b.rule_id);
    const strong = inCat.filter((r) => r.result === "applies" && !isWeak(r.rule_id)).sort(cityFirst);
    const weak = inCat.filter((r) => r.result === "applies" && isWeak(r.rule_id)).sort(cityFirst);
    const unknown = inCat.filter((r) => r.result === "unknown").sort(cityFirst);
    const pending = inCat.filter((r) => r.result === "pending");
    const later = inCat.filter((r) => r.result === "not_yet_effective");
    const replaced = inCat.filter((r) => r.result === "superseded");
    // A state "no protection here" rule (e.g. MA bars rent control) the engine doesn't list as a result.
    if (!strong.length && !unknown.length && !weak.length) {
      const basic = Object.values(rules).find((r) => r.category === t.cat && r.level === "state" && isWeak(r.rule_id) && r.status === "in_force");
      if (basic)
        weak.push({ rule_id: basic.rule_id, category: basic.category, result: "applies", confidence: basic.audit.model_extracted.confidence, explanation: `Statewide ${stateName} rule (${basic.citation}).`, what_next: basic.what_next });
    }

    const status: TileStatus = strong.length ? "protect" : unknown.length ? "depends" : "none";

    // The plain answer: the lead rule's line; a second line only when it adds a level.
    const lines: string[] = [];
    const lead = strong[0] ?? unknown[0] ?? weak[0];
    if (lead) lines.push(plainLine(rules[lead.rule_id]));
    if (status === "protect" && strong[1] && !isCarveOut(rules[strong[1].rule_id]) && rules[strong[1].rule_id].level !== rules[strong[0].rule_id].level) {
      lines.push(plainLine(rules[strong[1].rule_id]));
    }
    if (status === "none" && !lead) {
      lines.push(
        city
          ? `No ${cityName} rule on this in our sources, and no ${stateName} rule either.`
          : `No local rule here in our sources, and no ${stateName} rule either.`,
      );
    }
    if (status === "none" && pending.length) {
      lines.push(`${pending.length === 1 ? "One bill is" : `${pending.length} bills are`} proposed; a bill is not law.`);
    }

    const notes: Tile["notes"] = [];
    if (unknown.length && status === "protect") notes.push({ kind: "depends", text: "One more rule depends on a missing fact" });
    for (const r of later) {
      const rule = rules[r.rule_id];
      notes.push({ kind: "date", text: `New ${rule.level} rule from ${formatDate(rule.effective_date)}` });
    }
    if (pending.length) notes.push({ kind: "proposed", text: `${pending.length === 1 ? "1 bill" : `${pending.length} bills`} proposed, not law` });
    // A ballot question, bill or measure the sources report as failed or struck (findings.json, from a news link):
    // shown so "no rule" reads as checked, not missing. Its text is not in our sources, so no quote.
    const failed = (args.findings[state] ?? []).filter((f) => f.kind === "measure_failed" && f.category === t.cat);
    if (failed.length) notes.push({ kind: "failed", text: `${failed.length === 1 ? "1 measure" : `${failed.length} measures`} failed or struck, not law` });
    const conflict = inCat.find((r) => r.conflict_with?.length);
    if (conflict) notes.push({ kind: "flag", text: "Possible overlap between state and city, flagged" });

    const shown = [...strong, ...unknown, ...weak];
    const levels = new Set(shown.map((r) => rules[r.rule_id].level));
    const from =
      levels.size === 0
        ? `${stateName} law`
        : levels.size === 2
          ? `${cityName} and ${stateName} law`
          : levels.has("city")
            ? `${cityName} law`
            : `${stateName} law`;

    // Explanation: hand-written words for the lead rule, else the engine's own sentence.
    const leadRule = lead ? rules[lead.rule_id] : undefined;
    let expl = (leadRule && PLAIN[leadRule.rule_id]?.expl) || (lead?.explanation ?? "");
    if (!lead && pending.length) expl = "If a bill passes, HomeRule shows it here with its date.";
    if (!lead && !pending.length) expl = `HomeRule found no ${cityName ? "city or " : ""}state rule on this topic for this address. That doesn't mean there are no rules at all: federal law and your lease still apply.`;

    // What we don't know yet: the engine's missing facts (lead rule first, one line per fact), the
    // approval date when the build year can't settle a cutoff, or an exception in the text.
    const contact = contactFor(city, state, t.cat);
    const missing: Tile["missing"] = missingFacts(unknown, rules, contact?.name ?? null);

    const lawNotes = replaced.map((r) => {
      const rule = rules[r.rule_id];
      return `${whereName(rule, cityName)}'s rule (${rule.citation}) is replaced here by the ${rules[r.governed_by ?? ""]?.level ?? "local"} rule.`;
    });
    if (failed.length)
      lawNotes.push(
        `Our sources report ${failed.length === 1 ? "a ballot question, bill or measure" : `${failed.length} ballot questions, bills or measures`} on this that failed or was struck. It never became law, so it adds no rule here. Its text is not in our sources; the report is the only source.`,
      );

    const flag = conflict
      ? {
          head: "Possible overlap, not decided",
          body: "A state law may limit city rules on this topic. Whether it does here is a legal question. HomeRule shows both sources and flags it for review; it doesn't decide which one governs.",
        }
      : null;

    // J7 helpers: neutral, ask for information or point to an office.
    const helpers: Helper[] = [];
    const callItems = CALL_ITEMS[t.id];
    if (t.id === "evict" && inCat.some((r) => r.rule_id === "MA-BOSTON-EVICT-10-11.7")) {
      helpers.push({
        kind: "check",
        title: "Check your notice",
        items: [
          "Did your notice include the Notice of Tenant's Rights and Resources?",
          "What date does your notice give?",
          "Have ready when you call: your notice, your lease, your move-in date",
        ],
      });
    } else if (callItems) helpers.push({ kind: "call", title: "Before you call, have ready", items: callItems });
    const askFacts = unknown
      .flatMap((r) => rules[r.rule_id].coverage_facts)
      .filter((f, i, a) => a.indexOf(f) === i && address.facts[f] === null && FACT_PLAIN[f] && f !== "owner_type");
    if (askFacts.length) {
      helpers.push({
        kind: "email",
        title: `Ask your landlord: ${FACT_PLAIN[askFacts[0]].name.toLowerCase()}`,
        text: `Hi,\n\nCould you tell me ${askFacts.map((f) => FACT_PLAIN[f].ask).join(", and ")}, for ${address.street}?\n\nThank you,\n[Your name], Unit [number]`,
      });
    }

    const next: Tile["next"] = [];
    if (leadRule?.source_url) next.push({ label: `Read ${leadRule.citation} at the source`, url: leadRule.source_url });

    const rows: RuleRow[] = [...strong, ...unknown, ...weak, ...later, ...pending, ...replaced].map((r) => {
      const rule = rules[r.rule_id];
      const st: RuleRow["st"] =
        r.result === "superseded"
          ? "replaced"
          : r.result === "unknown"
            ? "depends"
            : r.result === "not_yet_effective"
              ? "starts"
              : r.result === "pending"
                ? "proposed"
                : "applies";
      const stWord =
        st === "replaced"
          ? "Replaced here by the city rule"
          : st === "depends"
            ? "Missing one fact"
            : st === "starts"
              ? `Starts ${formatDate(rule.effective_date)}`
              : st === "proposed"
                ? "Proposed, not law"
                : "Applies";
      const meta = [
        st === "proposed"
          ? "A bill, not law"
          : st === "starts"
            ? `Starts ${formatDate(rule.effective_date)}`
            : rule.effective_date && rule.effective_date <= asOf
              ? `In effect since ${formatDate(rule.effective_date)}`
              : "In effect",
        rule.retrieved_at ? `Checked ${formatDate(rule.retrieved_at)}` : "Not yet checked against a source",
        `Confidence: ${confWord(r.confidence)}`,
      ];
      if (rule.effective_until && rule.effective_until > asOf && st !== "proposed") meta.splice(1, 0, `Ends ${formatDate(rule.effective_until)}`);
      return {
        rule_id: rule.rule_id,
        level: rule.level,
        where: whereName(rule, cityName),
        title: rule.title,
        st,
        stWord,
        quote: rule.quoted_span,
        why: st === "applies" ? null : r.explanation,
        citation: rule.citation,
        sourceUrl: rule.source_url,
        sourceName: hostName(rule.source_url),
        meta,
      };
    });

    return {
      id: t.id,
      title: t.title,
      q: t.q,
      icon: t.icon,
      group: t.group,
      short: t.short,
      status,
      line: lines.filter(Boolean).join(" "),
      notes,
      from,
      fromCity: levels.has("city"),
      expl,
      missing,
      flag,
      contact,
      helpers,
      next,
      lawNotes,
      rules: rows,
    };
  });

  // ---- Coming up and recently changed: from the rules' effective dates (live has one as-of date).
  const topicOf = (cat: string) => TOPICS.find((t) => t.cat === cat)!.id;
  const listed = new Map(results.map((r) => [r.rule_id, r]));
  const future: TimelineEvent[] = [];
  const past: TimelineEvent[] = [];
  const yearAgo = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;
  for (const r of listed.values()) {
    const rule = rules[r.rule_id];
    if (!rule?.effective_date || r.result === "pending") continue;
    const ev: TimelineEvent = {
      date: rule.effective_date,
      dateText: formatDate(rule.effective_date),
      topic: topicOf(rule.category),
      title: PLAIN[rule.rule_id]?.line ?? rule.title,
      ruleId: rule.rule_id,
      kind: "start",
    };
    if (rule.effective_date > asOf) future.push({ ...ev, title: `Takes effect: ${ev.title}` });
    else if (rule.effective_date >= yearAgo && r.result !== "superseded") past.push({ ...ev, body: `Took effect. ${whereName(rule, cityName)} · ${rule.citation}` });
  }
  // Rules ending at this address (sunset or repeal). A version swap (a successor starting that day) is not an end:
  // the successor's start event says it replaces the earlier version instead.
  if (args.changes) {
    const { ends, swaps } = ruleEnds({ asOf, results, rules, sources: args.changes.sources, rec: args.changes.rec });
    for (const e of ends) {
      const rule = rules[e.ruleId];
      if (!rule) continue;
      const ev: TimelineEvent = {
        date: e.date,
        dateText: formatDate(e.date),
        topic: topicOf(rule.category),
        title: `Ends: ${PLAIN[rule.rule_id]?.line ?? rule.title}`,
        ruleId: rule.rule_id,
        kind: "end",
      };
      if (e.when === "future") future.push(ev);
      else past.push({ ...ev, body: `Ended. ${whereName(rule, cityName)} · ${rule.citation}` });
    }
    for (const sw of swaps) {
      const old = rules[sw.from];
      const ev = [...future, ...past].find((x) => x.ruleId === sw.to && x.date === sw.date);
      if (ev && old) ev.body = `${ev.body ? `${ev.body} · ` : ""}Replaces the earlier version (${old.citation})`;
    }
  }
  future.sort((a, b) => a.date.localeCompare(b.date));
  past.sort((a, b) => b.date.localeCompare(a.date));

  const proposed = results
    .filter((r) => r.result === "pending" && rules[r.rule_id])
    .map((r) => {
      const rule = rules[r.rule_id];
      return { rule_id: rule.rule_id, title: rule.title, citation: rule.citation, url: rule.source_url };
    });

  return {
    street: address.street,
    postal: address.postal_city,
    asOf,
    asOfText: formatDate(asOf),
    next: future[0] ?? null,
    tiles,
    future,
    past,
    proposed,
  };
}
