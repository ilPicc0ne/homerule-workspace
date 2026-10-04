// The alert email for one address and one change source, rendered from the same diff as the change log
// (I6). Inbox: sender "HomeRule Alerts", a factual subject (where, what, when), a preheader with the direction and when.
// Body: the address, the first line, one card per change (verdict, topic, the address page's plain line), one button
// to the address page. Frame and styles: web/lib/alerts/layout.ts.
// Rendering only: sending is dispatchAlerts (web/lib/alerts/dispatch.ts), triggered after a deploy, never on its own.
import type { AddressChanges, ChangesFile, Change, Entry } from "./types.ts";
import { esc } from "../alerts/html.ts";
import { footerHtml, footerText } from "../alerts/disclaimer.ts";
import { BADGE_STYLE, button, C, card, layout, link, para } from "../alerts/layout.ts";
import { featuredEntry, longDate } from "./wording.ts";
import { PLAIN, TOPICS } from "../plain.ts";
import { formatDate } from "../format.ts";
import rulesData from "../../data/live/rules.json" with { type: "json" };
import { badgeFor, changeDate, endsIn, firstLine, isPending } from "./impact.ts";
import type { Badge, BadgeKind } from "./impact.ts";

/** The sender as the inbox shows it: who, and that it is an alert. */
export const FROM = "HomeRule Alerts <alerts@yourhomerule.com>";
export const SITE = "https://yourhomerule.com";
/** Filled in per subscriber by the sender (P1); the preview shows the placeholder. */
export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_token}}";

export type AddressChange = {
  address_id: string;
  label: string;
  /** The as-of date of the data the email is built from. */
  as_of: string;
  entry: Entry;
};

export type RenderedEmail = {
  from: string;
  subject: string;
  /** The inbox preview line after the subject (hidden at the top of the html). */
  preheader: string;
  html: string;
  text: string;
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": string };
  unsubscribe_url: string;
};

export type RenderOptions = {
  site?: string;
  token?: string;
  /** Replaces the demo banner text (the sample alert on the address page says what it is). */
  banner?: string;
};

/** The email input for one address: the given source, or the featured one (a new document first). */
export function addressChange(file: ChangesFile, addressId: string, source?: string): AddressChange | null {
  const rec: AddressChanges | undefined = file.addresses[addressId];
  if (!rec) return null;
  const entry = source ? rec.entries.find((e) => e.source === source) : featuredEntry(rec.entries, file.as_of);
  return entry ? { address_id: addressId, label: rec.label, as_of: file.as_of, entry } : null;
}

export { esc };

const q = (addressId: string, token: string) => `a=${encodeURIComponent(addressId)}&t=${encodeURIComponent(token)}`;

/** The unsubscribe page for one address (one button that POSTs). `token` is the subscription's own token. */
export function unsubscribeUrl(site: string, addressId: string, token: string): string {
  return `${site.replace(/\/$/, "")}/unsubscribe?${q(addressId, token)}`;
}

/** The RFC 8058 one-click endpoint for the List-Unsubscribe header (mail apps POST to it). */
export function oneClickUrl(site: string, addressId: string, token: string): string {
  return `${site.replace(/\/$/, "")}/api/unsubscribe?${q(addressId, token)}`;
}

export function unsubscribeHeaders(site: string, addressId: string, token: string) {
  return { "List-Unsubscribe": `<${oneClickUrl(site, addressId, token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export { BADGE_STYLE };

type RuleRec = { rule_id: string; category?: string; summary?: string; title?: string };
const RULES = new Map((rulesData as unknown as RuleRec[]).map((r) => [r.rule_id, r]));

/** The short address for subject and button: the part before the first comma. */
export function shortAddress(label: string): string {
  return label.split(",")[0].trim();
}

/** The rest of the label after the street ("Hoboken, NJ"), for the small line under the street. */
export function cityOf(label: string): string {
  return label.split(",").slice(1).join(",").trim();
}

export type PlainChange = { rule_id: string; topic: string; sentence: string; badge: Badge | null };

/** One change in renter words: topic + the address page's plain line + the date. No titles, statuses or citations.
 *  `win`: the entry's before/after dates; a removed rule whose end date falls inside it reads "Ends on <date>". */
export function plainChange(
  c: Change,
  asOf: string,
  rules: Map<string, RuleRec> = RULES,
  win?: { before_as_of: string; after_as_of: string } | null,
): PlainChange {
  const rule = rules.get(c.team_rule_id);
  const topic = TOPICS.find((t) => t.cat === (c.category || rule?.category))?.title ?? "Housing rules";
  let line = (PLAIN[c.team_rule_id]?.line ?? rule?.summary ?? "A rule for this address changed.").trim();
  if (!/[.!?]$/.test(line)) line += ".";
  const date = formatDate(c.effective_from);
  if (endsIn(c, win)) line = `${(c.effective_until ?? "") > asOf ? "Ends" : "Ended"} on ${formatDate(c.effective_until)}: ${line}`;
  else if (c.change === "removed") line = `This rule no longer shows for your address: ${line}`;
  else if (date && !line.includes(date)) line = `${(c.effective_from ?? "") > asOf ? "From" : "Since"} ${date}: ${line}`;
  return { rule_id: c.team_rule_id, topic, sentence: line, badge: badgeFor(c) };
}

type Win = { before_as_of: string; after_as_of: string };

/** The dates a set of changes is about (end date for an ending rule), ignoring pending bills when anything else is there. */
function timing(changes: Change[], asOf: string, win: Win | null, fallback?: string | null) {
  const live = changes.filter((c) => !isPending(c));
  const dates = [...new Set((live.length ? live : changes).map((c) => changeDate(c, win)).filter((d): d is string => !!d))].sort();
  const earliest = dates[0] ?? fallback ?? null;
  const past = dates.length > 0 ? dates.every((d) => d <= asOf) : !!earliest && earliest <= asOf;
  return { earliest, past, single: dates.length <= 1 };
}

/** Topic nouns for the subject line ("Rent-setting software rule changes on …"). */
const SUBJECT_NOUN: Record<string, string> = {
  rent: "rent increase",
  evict: "eviction",
  soft: "rent-setting software",
  dep: "security deposit",
  fee: "application fee",
  scr: "tenant screening",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The subject: where, what and when, no direction and no alarm ("327 Jackson St: Rent-setting software rule changes on
 * Jul 1, 2027"). A demo-labelled source is prefixed "[Demo: …]".
 */
export function subjectLine(ac: AddressChange): string {
  // a pending bill is not law: it doesn't count as a rule that changes, unless it is all there is
  const live = ac.entry.changes.filter((c) => !isPending(c));
  const changes = live.length ? live : ac.entry.changes;
  const cats = [...new Set(changes.map((c) => c.category))];
  const noun = (cat: string) => SUBJECT_NOUN[TOPICS.find((t) => t.cat === cat)?.id ?? ""] ?? "housing";
  const n = changes.length;
  const what =
    cats.length === 1 ? (n === 1 ? `${noun(cats[0])} rule` : `${n} ${noun(cats[0])} rules`)
    : cats.length === 2 ? `${noun(cats[0])} and ${noun(cats[1])} rules`
    : `${n} housing rules`;
  const t = timing(changes, ac.as_of, ac.entry, ac.entry.after_as_of);
  const ending = n > 0 && changes.every((c) => endsIn(c, ac.entry));
  const verb = ending ? (t.past ? "ended" : n > 1 ? "end" : "ends") : t.past ? "changed" : n > 1 ? "change" : "changes";
  const date = t.earliest ? ` ${t.single ? "on" : t.past ? "since" : "from"} ${formatDate(t.earliest)}` : "";
  const demo = ac.entry.demo_label;
  return `${demo ? `[${demo}] ` : ""}${shortAddress(ac.label)}: ${cap(what)} ${verb}${date}`;
}

/**
 * The preheader (inbox preview after the subject): the direction and when, then where. Same rule as the first line
 * (impact.ts firstLine): a direction only when every badged change agrees, or "adds and narrows" when both show;
 * grey or no badges -> neutral. "Adds renter protection from Jul 1, 2027 · 134 Oxford St".
 */
export function preheaderLine(ac: AddressChange): string {
  const { changes } = ac.entry;
  const kinds = new Set(changes.filter((c) => !isPending(c)).map(badgeFor).filter((b): b is Badge => !!b).map((b) => b.kind));
  const t = timing(changes, ac.as_of, ac.entry, ac.entry.after_as_of);
  const d = t.earliest ? formatDate(t.earliest) : "";
  const at = d ? (t.past ? (t.single ? ` on ${d}` : ` since ${d}`) : ` from ${d}`) : "";
  const only = (k: BadgeKind) => kinds.size === 1 && kinds.has(k);
  const what = only("adds") ? (t.past ? "Added renter protection" : "Adds renter protection")
    : only("narrows") ? (t.past ? "Narrowed renter protection" : "Narrows renter protection")
    : kinds.has("adds") && kinds.has("narrows") ? (t.past ? "Added and narrowed renter protection" : "Adds and narrows renter protection")
    : t.past ? "Rules changed" : "Rules change";
  return `${ac.entry.demo_label ? "Demo, not real law · " : ""}${what}${at} · ${shortAddress(ac.label)}`;
}

export function render(ac: AddressChange, opts: RenderOptions = {}): RenderedEmail {
  const site = (opts.site ?? SITE).replace(/\/$/, "");
  const token = opts.token ?? UNSUBSCRIBE_TOKEN;
  const unsubscribe = unsubscribeUrl(site, ac.address_id, token);
  const page = `${site}/a/${encodeURIComponent(ac.address_id)}`;
  const log = `${site}/changes/${encodeURIComponent(ac.address_id)}`;
  const demo = ac.entry.demo_label;
  const banner = opts.banner ?? (demo ? `${demo}: built from a fictional test document, not real law.` : null);
  const short = shortAddress(ac.label);
  const city = cityOf(ac.label);
  const subject = subjectLine(ac);
  const preheader = preheaderLine(ac);
  const items = ac.entry.changes.map((c) => plainChange(c, ac.as_of, RULES, ac.entry));
  const asOf = longDate(ac.as_of);
  const lead = firstLine(ac.entry.changes, short, ac.as_of, ac.entry.after_as_of, ac.entry);
  const cta = `See what this means for ${short}`;
  const history = `${page}#h-ahead`;
  const quote = (i: PlainChange) => `${log}#c-${encodeURIComponent(i.rule_id)}`;
  const count = items.length === 1 ? "1 change" : `${items.length} changes`;

  const text = [
    ...(banner ? [banner.toUpperCase(), ""] : []),
    `HomeRule · Rule alert · ${count}`,
    "",
    short,
    ...(city ? [city] : []),
    "",
    lead,
    "",
    ...items.flatMap((i, k) => [
      `${k + 1}. ${i.topic}`,
      ...(i.badge ? [`   ${i.badge.arrow} ${i.badge.text}. Your unit may differ.`] : []),
      `   ${i.sentence}`,
      ...(i.badge?.why ? [`   Summary: ${i.badge.why} · see the law text: ${quote(i)}`] : []),
      "",
    ]),
    `${cta}: ${history}`,
    `Full change log: ${log}`,
    "",
    "--",
    `Why you get this: you asked for alerts on ${ac.label}.`,
    `Unsubscribe in one click: ${unsubscribe}`,
    `HomeRule · Not legal advice · data as of ${asOf}`,
    ...footerText(),
  ].join("\n");

  const why = (i: PlainChange) =>
    i.badge?.why
      ? `<div class="mu" style="margin-top:10px;font-size:14px;line-height:21px;color:${C.muted}">Summary: ${esc(i.badge.why)} &middot; ${link(quote(i), "see the law text", C.muted, false)}</div>`
      : "";

  const html = layout({
    title: subject,
    preheader,
    kind: `Data as of ${formatDate(ac.as_of)}`,
    banner,
    site,
    hero: { eyebrow: `Rule alert · ${count}`, street: short, city },
    rows: [
      para(esc(lead), "font-size:18px;line-height:27px;font-weight:700;padding-bottom:16px"),
      ...items.map((i) => card({ badge: i.badge, topic: i.topic, sentence: i.sentence, extra: why(i) })),
      `<tr><td style="padding:8px 0 0">${button(history, cta)}</td></tr>`,
      `<tr><td style="padding:2px 0 8px;font-size:15px">${link(log, "See the full change log")}</td></tr>`,
    ].join("\n"),
    footer: `Why you get this: you asked for alerts on ${esc(ac.label)}.<br>${link(unsubscribe, "Unsubscribe in one click", C.muted)}<br><strong>Not legal advice</strong> &middot; data as of ${esc(asOf)}<br>${footerHtml()}`,
  });

  return {
    from: FROM,
    subject,
    preheader,
    html,
    text,
    headers: unsubscribeHeaders(site, ac.address_id, token),
    unsubscribe_url: unsubscribe,
  };
}
