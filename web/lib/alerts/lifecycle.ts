// Lifecycle alert events per (rule × subscribed address), computed at run time from the build-time data the site
// shows (rules, the per-address listing at the data's as-of date, and the per-address diff). Nothing is recomputed
// by an engine here: date arithmetic and lookups only.
//
// Triggers (owner's concept, notes/plan/alert-engine.md §2):
//   discovered    A  a newly found ENACTED rule (an `ingest` source in the diff), whatever its effective date;
//                    never a pending bill. Due on the next run once the rule is approved.
//   upcoming_30d  B  30 days before the effective date (window start for month/year precision or disputed dates)
//   in_force      B  on the effective date (day precision only)
//   ending_30d    C  30 days before the end date (sunset / repeal; `effective_until`, PR #71's field name)
//   ended         C  on the end date
//   correction       something we told this email (date, status) changed in the data (daily.ts builds these)
// Only when the result at the address changes: B needs the rule listed as `not_yet_effective`, C needs it listed as
// applying (or maybe applying); superseded rows and pending bills never fire. "Today" is the jurisdiction's local
// date (America/Los_Angeles for CA, America/New_York for NJ and MA).
import type { Change, ChangesFile } from "../changes/types.ts";
import { longDate } from "../changes/wording.ts";

export type Trigger = "discovered" | "upcoming_30d" | "in_force" | "ending_30d" | "ended" | "correction";
export type Precision = "day" | "month" | "year";

/** The rule fields the engine reads (a subset of web/data/live/rules.json). */
export type LifeRule = {
  rule_id: string;
  jurisdiction_id: string;
  category: string;
  title: string;
  summary?: string;
  status: string;
  effective_date: string | null;
  /** First day the rule no longer applies (sunset or repeal); PR #71 adds it to the live data. */
  effective_until?: string | null;
  /** "day" when absent. Month/year: no day-exact reminder, worded "in July 2027". */
  effective_precision?: Precision;
  /** Conflicting published dates: no day-exact reminder, both dates in words. */
  effective_dates_disputed?: { date: string; source: string }[];
  /** A rehearsal record: demo-flagged subscribers only. */
  fictional?: boolean;
};

/** One listed rule at an address; `conflict_with`: rules it may conflict with (flagged, never decided). */
export type ListedRow = { rule_id: string; result: string; conflict_with?: string[] };

export type LifeData = {
  /** The as-of date of the listing (meta.default_as_of). */
  as_of: string;
  rules: Map<string, LifeRule>;
  /** Rules listed at an address at `as_of`, with their result; null for an unknown address. */
  listing: (addressId: string) => ListedRow[] | null;
  changes: ChangesFile;
};

export type Verdict = "better" | "worse";

export type LifeEvent = {
  /** <rule_id>|<address_id>|<trigger>|<anchor>: stable while the date stays the same. */
  id: string;
  trigger: Trigger;
  rule_id: string;
  address_id: string;
  /** The date the event is about (effective date, window start, end date), "undated" when the data has none. */
  anchor: string;
  /** Local date the event is due; null = due on the next run (discovered, correction). */
  fire_date: string | null;
  tz: string;
  precision: Precision | "disputed";
  /** The date in words, with its precision: "on July 1, 2027", "in July 2027", "on a date sources disagree on (…)". */
  when: string;
  /** The result at the address once the event happens (diff, else listing), for the "may apply" wording. */
  result: string | null;
  /** Flagged as possibly conflicting with another rule here (worded, never decided). */
  conflict: boolean;
  /** Plus/minus for the renter, from the diff's renter_impact (#59); null = no badge. */
  verdict: Verdict | null;
  demo: boolean;
  /** What the email tells, kept per email for corrections: the start or the end date. */
  told: { kind: "start" | "end"; date: string | null };
  correction?: { kind: "start" | "end"; was: string | null; now: string | null; withdrawn: boolean; pending: boolean };
};

export const LEAD_DAYS = 30;
/** A missed or failed run is caught up for this many days; older due events are dropped, never sent late. */
export const CATCH_UP_DAYS = 3;

const TZ: Record<string, string> = { CA: "America/Los_Angeles", NJ: "America/New_York", MA: "America/New_York" };

export const tzOf = (jurisdictionId: string) => TZ[jurisdictionId.slice(0, 2)] ?? "America/New_York";

/** The calendar date in a time zone: 2027-07-01T05:00Z -> "2027-07-01" in New York, "2027-06-30" in Los Angeles. */
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

export type DateInfo = { anchor: string; precision: Precision | "disputed"; when: string };

/** The start date of a rule with its precision. Disputed dates anchor on the earliest one. */
export function startInfo(rule: Pick<LifeRule, "effective_date" | "effective_precision" | "effective_dates_disputed">): DateInfo | null {
  const disputed = [...new Set([rule.effective_date, ...(rule.effective_dates_disputed ?? []).map((d) => d.date)].filter(isIsoDate))].sort();
  if ((rule.effective_dates_disputed?.length ?? 0) > 0 && disputed.length > 1)
    return { anchor: disputed[0], precision: "disputed", when: `on a date sources disagree on (${disputed.map(longDate).join(" or ")})` };
  const d = rule.effective_date;
  if (!isIsoDate(d)) return null;
  const p = rule.effective_precision ?? "day";
  if (p === "month") return { anchor: `${d.slice(0, 7)}-01`, precision: p, when: `in ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` };
  if (p === "year") return { anchor: `${d.slice(0, 4)}-01-01`, precision: p, when: `in ${d.slice(0, 4)}` };
  return { anchor: d, precision: "day", when: `on ${longDate(d)}` };
}

function verdictOf(c: Change | undefined): Verdict | null {
  const v = (c as { renter_impact?: { verdict?: unknown } | null } | undefined)?.renter_impact?.verdict;
  return v === "better" || v === "worse" ? v : null;
}

const NEVER = new Set(["pending", "superseded"]);
const LIVE = new Set(["applies", "unknown", "not_yet_effective"]);

/** Every lifecycle event for one address (all fire dates; `due` picks today's). Deterministic order. */
export function calendar(d: LifeData, addressId: string): LifeEvent[] {
  const rows = d.listing(addressId) ?? [];
  const changes = (d.changes.addresses[addressId]?.entries ?? []).flatMap((e) => e.changes.map((c) => ({ e, c })));
  const out = new Map<string, LifeEvent>();
  const add = (ev: Omit<LifeEvent, "id">) => {
    const id = `${ev.rule_id}|${ev.address_id}|${ev.trigger}|${ev.anchor}`;
    if (!out.has(id)) out.set(id, { id, ...ev });
  };

  for (const row of rows) {
    const rule = d.rules.get(row.rule_id);
    if (!rule || rule.status === "pending" || NEVER.has(row.result)) continue;
    const conflict = (row.conflict_with?.length ?? 0) > 0;
    const base = { rule_id: rule.rule_id, address_id: addressId, tz: tzOf(rule.jurisdiction_id), result: row.result, conflict, demo: !!rule.fictional };

    // B · takes effect: the rule is listed here but not in effect yet.
    const start = startInfo(rule);
    if (start && row.result === "not_yet_effective") {
      const c = changes.find(({ c }) => c.team_rule_id === rule.rule_id && c.change !== "removed" && c.effective_from === rule.effective_date)?.c;
      const ev = {
        ...base,
        result: c?.after?.result ?? null,
        conflict: conflict || !!c?.after?.conflict_flag,
        anchor: start.anchor,
        precision: start.precision,
        when: start.when,
        verdict: verdictOf(c),
        told: { kind: "start" as const, date: start.anchor },
      };
      add({ ...ev, trigger: "upcoming_30d", fire_date: addDays(start.anchor, -LEAD_DAYS) });
      if (start.precision === "day") add({ ...ev, trigger: "in_force", fire_date: start.anchor });
    }

    // C · ends: the rule applies (or may) here and has an end date, unless a successor on the same topic starts that day.
    const until = rule.effective_until;
    if (isIsoDate(until) && LIVE.has(row.result)) {
      const successor = rows.some((r) => {
        const o = r.rule_id !== rule.rule_id ? d.rules.get(r.rule_id) : undefined;
        return !!o && o.jurisdiction_id === rule.jurisdiction_id && o.category === rule.category && o.effective_date === until;
      });
      if (!successor) {
        const v = verdictOf(
          changes.find(({ c }) => c.team_rule_id === rule.rule_id && (c.change === "removed" || (c as { effective_until?: string | null }).effective_until === until))?.c,
        );
        const ev = { ...base, anchor: until, precision: "day" as const, when: `on ${longDate(until)}`, verdict: v, told: { kind: "end" as const, date: until } };
        add({ ...ev, trigger: "ending_30d", fire_date: addDays(until, -LEAD_DAYS) });
        add({ ...ev, trigger: "ended", fire_date: until });
      }
    }
  }

  // A · discovered: a rule from a newly ingested document that is enacted law and listed at this address.
  for (const { e, c } of changes) {
    if (e.kind !== "ingest" || c.change === "removed" || !c.after) continue;
    if (c.document_status === "pending" || NEVER.has(c.after.result)) continue;
    const rule = d.rules.get(c.team_rule_id);
    const start = startInfo(rule ?? { effective_date: c.effective_from });
    add({
      trigger: "discovered",
      rule_id: c.team_rule_id,
      address_id: addressId,
      anchor: start?.anchor ?? "undated",
      fire_date: null,
      tz: tzOf(c.jurisdiction_id),
      precision: start?.precision ?? "day",
      when: start?.when ?? "on a date the text does not give",
      result: c.after.result,
      conflict: c.after.conflict_flag,
      verdict: verdictOf(c),
      demo: !!e.demo_label || !!rule?.fictional,
      told: { kind: "start", date: start?.anchor ?? null },
    });
  }
  return [...out.values()];
}

/** Due today (local date of the event's jurisdiction): fire date today or within the catch-up window. */
export function isDue(ev: Pick<LifeEvent, "fire_date">, today: string): boolean {
  if (!ev.fire_date) return true;
  return ev.fire_date <= today && ev.fire_date >= addDays(today, -CATCH_UP_DAYS);
}

/** A rule's info for corrections: the live rule, else what an ingest change in the diff says about it. */
export function ruleNow(d: LifeData, ruleId: string, addressId: string): { start: string | null; end: string | null; status: string } | null {
  const r = d.rules.get(ruleId);
  if (r) return { start: startInfo(r)?.anchor ?? null, end: isIsoDate(r.effective_until) ? r.effective_until : null, status: r.status };
  const c = (d.changes.addresses[addressId]?.entries ?? []).flatMap((e) => e.changes).find((x) => x.team_rule_id === ruleId && x.change !== "removed");
  if (!c) return null;
  return { start: isIsoDate(c.effective_from) ? c.effective_from : null, end: null, status: c.document_status === "pending" ? "pending" : "enacted" };
}

export type Told = { date: string | null; status: string; trigger: Trigger; event_id: string; sent_on: string };

/**
 * Corrections for one address from what this email was told (`alerts:told:<hash>` fields "<addr>|<rule>|<kind>").
 * A moved date, a removed end date, a rule that became a pending bill or left the data → one correction, due now.
 */
export function corrections(d: LifeData, addressId: string, told: Record<string, string>): LifeEvent[] {
  const out: LifeEvent[] = [];
  for (const [field, raw] of Object.entries(told)) {
    const [addr, ruleId, kind] = field.split("|");
    if (addr !== addressId || (kind !== "start" && kind !== "end")) continue;
    const t = JSON.parse(raw) as Told;
    const cur = ruleNow(d, ruleId, addressId);
    const withdrawn = !cur || cur.status === "failed";
    const pending = !!cur && cur.status === "pending";
    const now = cur ? (kind === "start" ? cur.start : cur.end) : null;
    if (!withdrawn && !pending && now === t.date) continue;
    if (pending && t.status === "pending") continue; // already corrected
    const rule = d.rules.get(ruleId);
    out.push({
      id: `${ruleId}|${addressId}|correction|${kind}:${t.date ?? "none"}>${withdrawn ? "withdrawn" : pending ? "pending" : (now ?? "none")}`,
      trigger: "correction",
      rule_id: ruleId,
      address_id: addressId,
      anchor: now ?? "none",
      fire_date: null,
      tz: tzOf(rule?.jurisdiction_id ?? addressId),
      precision: "day",
      when: now ? `on ${longDate(now)}` : "",
      result: null,
      conflict: false,
      verdict: null,
      demo: !!rule?.fictional,
      told: { kind, date: now },
      correction: { kind, was: t.date, now, withdrawn, pending },
    });
  }
  return out;
}

/** LifeData from the site's dataset (web/data/<source>: meta, rules, lookups) and the per-address diff. */
export function lifeDataFrom(
  ds: { meta: { default_as_of: string }; rules: unknown[]; lookups: Record<string, Record<string, ListedRow[]>> },
  changes: ChangesFile,
): LifeData {
  const asOf = ds.meta.default_as_of;
  const byDate = ds.lookups[asOf] ?? {};
  return {
    as_of: asOf,
    rules: new Map((ds.rules as LifeRule[]).map((r) => [r.rule_id, r])),
    listing: (id) => byDate[id]?.map((r) => ({ rule_id: r.rule_id, result: r.result, conflict_with: r.conflict_with })) ?? null,
    changes,
  };
}
