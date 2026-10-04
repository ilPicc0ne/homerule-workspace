// The daily lifecycle run: for every confirmed subscriber, the events due today at their addresses (lifecycle.ts),
// through the gates, into one digest email per person (digest.ts), sent through Resend.
// Gates per event, in order:
//   1. audience: demo events (fictional rules or demo-labelled sources) only to `demo` subscribers; everything else
//      only to `allowed` subscribers while the closed test is on (same rule as dispatch.ts);
//   2. idempotency: alerts:sent:<event_id>:<hash(email)> exists → "already";
//   3. approval: the rule needs alerts:approved:<rule_id> (set once with `alerts approve <rule_id>`), else "queued";
//      `discovered` only for subscribers confirmed before the approval (later ones get the date events).
// The sent: keys and the told: record (what this email was told, for corrections) are written only after Resend
// accepts the digest, so a failed send is retried on the next run (catch-up window, lifecycle.ts). A dry run sends
// nothing and writes nothing.
import { eventText, renderDigest, type DigestGroup } from "./digest.ts";
import { calendar, corrections, isDue, localDate, tzOf as zoneOf, type LifeData, type LifeEvent, type Told, type Trigger } from "./lifecycle.ts";
import type { Mailer } from "./mail.ts";
import { EVENT_SENT_TTL, K, type Store, type Subscriber } from "./store.ts";
import { emailHash, maskEmail } from "./unsub.ts";

export type RunDeps = {
  store: Store;
  mailer: Mailer | null;
  closed: boolean;
  site: string;
  now: Date;
  /** Simulated local date for every jurisdiction (YYYY-MM-DD); else each jurisdiction's own date at `now`. */
  asOf?: string;
  dryRun: boolean;
};

export type RunOutcome = "sent" | "would_send" | "already" | "queued" | "skipped_demo" | "skipped_closed_test" | "failed" | "deferred";
export type RunLine = { event_id: string; trigger: Trigger; rule_id: string; address_id: string; to: string; outcome: RunOutcome; detail?: string };
export type DigestLine = { to: string; subject: string; events: number; addresses: number; outcome: "sent" | "would_send" | "failed" | "deferred"; detail?: string; lines: string[] };

export type RunReport = {
  dry_run: boolean;
  simulated: string | null;
  today: Record<string, string>;
  data_as_of: string;
  subscribers: number;
  addresses: number;
  lines: RunLine[];
  digests: DigestLine[];
  counts: Partial<Record<RunOutcome, number>>;
  queued_rules: string[];
};

export type Approval = { at: string; by: string };

export async function approveRule(store: Store, ruleId: string, at: Date, by = "cli"): Promise<void> {
  await store.set(K.approved(ruleId), JSON.stringify({ at: at.toISOString(), by } satisfies Approval));
}

export async function unapproveRule(store: Store, ruleId: string): Promise<boolean> {
  return (await store.clear([K.approved(ruleId)])) > 0;
}

/** Which line a digest shows when one rule has several events at one address the same day (all are marked sent). */
const ORDER: Trigger[] = ["correction", "in_force", "ended", "upcoming_30d", "ending_30d", "discovered"];
const TZS = ["America/Los_Angeles", "America/New_York"];
const DIGEST_TTL = 60 * 60 * 24 * 7;

/** The zone of an address: from the jurisdiction of its first listed rule (state code), New York when none. */
function tzOf(addressId: string, d: LifeData): string {
  const r = (d.listing(addressId) ?? []).map((x) => d.rules.get(x.rule_id)).find(Boolean);
  return r ? zoneOf(r.jurisdiction_id) : "America/New_York";
}

const confirmedBy = (confirmedAt: string, at: string) => {
  const c = Date.parse(confirmedAt);
  return Number.isNaN(c) || c <= Date.parse(at);
};

export async function runDaily(d: LifeData, deps: RunDeps): Promise<RunReport> {
  if (!deps.dryRun && !deps.mailer) throw new Error("No RESEND_API_KEY: nothing can be sent.");
  const todayFor = (tz: string) => deps.asOf ?? localDate(deps.now, tz);
  const approvals = new Map<string, Approval | null>();
  const approval = async (ruleId: string) => {
    if (!approvals.has(ruleId)) {
      const v = await deps.store.get(K.approved(ruleId));
      approvals.set(ruleId, v ? (JSON.parse(v) as Approval) : null);
    }
    return approvals.get(ruleId)!;
  };

  const addressIds = await deps.store.subscribedAddresses();
  const people = new Map<string, Subscriber[]>();
  for (const a of addressIds) for (const s of await deps.store.subscribers(a)) people.set(s.email, [...(people.get(s.email) ?? []), s]);

  const lines: RunLine[] = [];
  const digests: DigestLine[] = [];
  const queued = new Set<string>();

  for (const email of [...people.keys()].sort()) {
    const subs = people.get(email)!.sort((a, b) => a.address_id.localeCompare(b.address_id));
    const hash = emailHash(email);
    const to = maskEmail(email);
    const told = await deps.store.hgetall(K.told(hash));
    const groups: (DigestGroup & { all: LifeEvent[] })[] = [];
    const line = (ev: LifeEvent, outcome: RunOutcome, detail?: string) =>
      lines.push({ event_id: ev.id, trigger: ev.trigger, rule_id: ev.rule_id, address_id: ev.address_id, to, outcome, ...(detail ? { detail } : {}) });

    for (const sub of subs) {
      const due: LifeEvent[] = [];
      const today = todayFor(tzOf(sub.address_id, d));
      for (const ev of [...corrections(d, sub.address_id, told, today), ...calendar(d, sub.address_id)]) {
        if (!isDue(ev, todayFor(ev.tz))) continue;
        if (ev.trigger === "discovered" && told[`${sub.address_id}|${ev.rule_id}|start`]) continue; // already told about it
        if (ev.demo ? !sub.demo : deps.closed && !sub.allowed) {
          line(ev, ev.demo ? "skipped_demo" : "skipped_closed_test");
          continue;
        }
        if (await deps.store.isSent(K.sentEvent(ev.id, hash))) {
          line(ev, "already");
          continue;
        }
        const ap = await approval(ev.rule_id);
        if (!ap) {
          queued.add(ev.rule_id);
          line(ev, "queued", "rule not approved");
          continue;
        }
        if (ev.trigger === "discovered" && !confirmedBy(sub.confirmed_at, ap.at)) continue; // subscribed after it was new
        due.push(ev);
      }
      if (!due.length) continue;
      const byRule = new Map<string, LifeEvent[]>();
      for (const ev of due) byRule.set(ev.rule_id, [...(byRule.get(ev.rule_id) ?? []), ev]);
      // a correction always shows; other events of one rule on one day show as one line (the most urgent)
      const shown = [
        ...due.filter((e) => e.trigger === "correction"),
        ...[...byRule.values()].map((evs) => evs.filter((e) => e.trigger !== "correction").sort((a, b) => ORDER.indexOf(a.trigger) - ORDER.indexOf(b.trigger))[0]).filter(Boolean),
      ].sort((a, b) => ORDER.indexOf(a.trigger) - ORDER.indexOf(b.trigger) || a.rule_id.localeCompare(b.rule_id));
      groups.push({
        address_id: sub.address_id,
        label: sub.label,
        token: sub.token,
        items: shown.map((ev) => ({ ev, text: eventText(ev, d, todayFor(ev.tz)) })),
        all: due,
      });
    }
    if (!groups.length) continue;

    const msg = renderDigest({ to: email, groups, site: deps.site, dataAsOf: d.as_of });
    const all = groups.flatMap((g) => g.all);
    const summary = groups.flatMap((g) => g.items.map((i) => `${g.address_id} ${i.ev.trigger} ${i.ev.rule_id}: ${i.text.lead} · ${i.text.topic}${i.text.badge ? ` · ${i.text.badge}` : ""} — ${i.text.sentence}`));
    const digest = (outcome: DigestLine["outcome"], detail?: string) =>
      digests.push({ to, subject: msg.subject, events: all.length, addresses: groups.length, outcome, ...(detail ? { detail } : {}), lines: summary });
    if (deps.dryRun) {
      for (const ev of all) line(ev, "would_send");
      digest("would_send");
      continue;
    }
    // one digest per email per local day (the first address's zone): a second run that day leaves the rest for tomorrow
    const day = todayFor(all[0].tz);
    if (await deps.store.get(K.digest(hash, day))) {
      for (const ev of all) line(ev, "deferred", "a digest already went out today");
      digest("deferred");
      continue;
    }
    const r = await deps.mailer!.send(msg);
    if (!r.ok) {
      for (const ev of all) line(ev, "failed", r.error);
      digest("failed", r.error);
      continue;
    }
    for (const ev of all) {
      await deps.store.markSent(K.sentEvent(ev.id, hash), EVENT_SENT_TTL);
      const field = `${ev.address_id}|${ev.rule_id}|${ev.told.kind}`;
      if (ev.correction?.withdrawn) await deps.store.hdel(K.told(hash), field);
      else {
        const t: Told = {
          date: ev.told.date,
          status: ev.correction?.pending ? "pending" : (d.rules.get(ev.rule_id)?.status ?? "enacted"),
          trigger: ev.trigger,
          event_id: ev.id,
          sent_on: todayFor(ev.tz),
        };
        await deps.store.hset(K.told(hash), field, JSON.stringify(t));
      }
      line(ev, "sent", r.id);
    }
    await deps.store.set(K.digest(hash, day), r.id, DIGEST_TTL);
    digest("sent", r.id);
  }

  const counts: RunReport["counts"] = {};
  for (const l of lines) counts[l.outcome] = (counts[l.outcome] ?? 0) + 1;
  return {
    dry_run: deps.dryRun,
    simulated: deps.asOf ?? null,
    today: Object.fromEntries(TZS.map((tz) => [tz, todayFor(tz)])),
    data_as_of: d.as_of,
    subscribers: people.size,
    addresses: addressIds.length,
    lines,
    digests,
    counts,
    queued_rules: [...queued].sort(),
  };
}

/** The report in a few lines for the terminal (emails are masked already). */
export function describeRun(r: RunReport, o: { verbose?: boolean; maxDigests?: number } = {}): string {
  const today = Object.entries(r.today).map(([tz, d]) => `${tz.split("/")[1]} ${d}`).join(", ");
  const out = [
    `Lifecycle alerts · today ${today}${r.simulated ? " (simulated)" : ""} · data as of ${r.data_as_of} · ${r.dry_run ? "DRY RUN: nothing is sent or written" : "SENDING"}`,
    `${r.subscribers} subscriber(s) at ${r.addresses} address(es)`,
  ];
  const byKey = new Map<string, number>();
  for (const l of r.lines) byKey.set(`${l.rule_id} · ${l.trigger} · ${l.outcome}`, (byKey.get(`${l.rule_id} · ${l.trigger} · ${l.outcome}`) ?? 0) + 1);
  out.push(`Events: ${Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none due"}`);
  for (const [k, v] of [...byKey].sort()) out.push(`  ${String(v).padStart(4)} × ${k}`);
  const max = o.verbose ? Infinity : (o.maxDigests ?? 3);
  out.push(`Digests: ${r.digests.length}${r.digests.length ? ` (${[...new Set(r.digests.map((x) => x.outcome))].join(", ")})` : ""}`);
  for (const g of r.digests.slice(0, max)) {
    out.push(`  ${g.outcome.padEnd(10)} ${g.to} · "${g.subject}" · ${g.events} event(s)${g.detail ? ` (${g.detail})` : ""}`);
    for (const s of g.lines) out.push(`      ${s}`);
  }
  if (r.digests.length > max) out.push(`  … and ${r.digests.length - max} more digest(s) (--verbose lists all)`);
  if (r.queued_rules.length) out.push(`Queued, waiting for approval: ${r.queued_rules.join(", ")}  →  make alerts-approve RULE=<rule_id>`);
  return out.join("\n");
}
