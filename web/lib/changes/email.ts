// The alert email for one address and one change source, rendered from the same diff as the change log
// (I6). Plain on purpose: one sentence per change (the same words as the address page) and a link to the page.
// Rendering only: sending is dispatchAlerts (web/lib/alerts/dispatch.ts), triggered after a deploy, never on its own.
import type { AddressChanges, ChangesFile, Change, Entry } from "./types.ts";
import { esc } from "../alerts/html.ts";
import { footerHtml, footerText } from "../alerts/disclaimer.ts";
import { BADGE_STYLE, badgeHtml, badgeText, button, C, layout, link, topicHtml } from "../alerts/layout.ts";
import { featuredEntry, longDate } from "./wording.ts";
import { PLAIN, TOPICS } from "../plain.ts";
import { formatDate } from "../format.ts";
import rulesData from "../../data/live/rules.json" with { type: "json" };
import { badgeFor, EMAIL_BANNED, endsIn, firstLine, whyOk } from "./impact.ts";
import type { Badge } from "./impact.ts";

export const FROM = "HomeRule <alerts@yourhomerule.com>";
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

/** Badge colours and markup live in the shared layout (lib/alerts/layout.ts), so the lifecycle digest uses the same. */
export { BADGE_STYLE };

type RuleRec = { rule_id: string; category?: string; summary?: string; title?: string };
const RULES = new Map((rulesData as unknown as RuleRec[]).map((r) => [r.rule_id, r]));

/** The short address for subject and button: the part before the first comma. */
export function shortAddress(label: string): string {
  return label.split(",")[0].trim();
}

export type PlainChange = { rule_id: string; topic: string; sentence: string; badge: Badge | null };

/** The rule's plain line for the email. A line that fails the email word lint (EMAIL_BANNED, e.g. Jersey City's
 *  "must come with a sworn statement") is replaced by the change's lint-clean `why`, else a neutral fallback; never
 *  dropped. Returns whether the why was used, so it is not repeated as the summary. */
export function emailLine(c: Change, rule?: RuleRec): { line: string; fromWhy: boolean } {
  const line = (PLAIN[c.team_rule_id]?.line ?? rule?.summary ?? "A rule for this address changed.").trim();
  if (!EMAIL_BANNED.test(line)) return { line, fromWhy: false };
  const why = c.renter_impact?.why;
  if (whyOk(why) && !EMAIL_BANNED.test(why)) return { line: why.trim(), fromWhy: true };
  return { line: "A rule for this address changed.", fromWhy: false };
}

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
  const picked = emailLine(c, rule);
  let line = picked.line;
  if (!/[.!?]$/.test(line)) line += ".";
  const date = formatDate(c.effective_from);
  if (endsIn(c, win)) line = `${(c.effective_until ?? "") > asOf ? "Ends" : "Ended"} on ${formatDate(c.effective_until)}: ${line}`;
  else if (c.change === "removed") line = `This rule no longer shows for your address: ${line}`;
  else if (date && !line.includes(date)) line = `${(c.effective_from ?? "") > asOf ? "From" : "Since"} ${date}: ${line}`;
  const badge = badgeFor(c);
  return { rule_id: c.team_rule_id, topic, sentence: line, badge: picked.fromWhy && badge ? { ...badge, why: null } : badge };
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
  const subject = `${demo ? `[${demo}] ` : ""}Something changes for your rent rules at ${short}`;
  const items = ac.entry.changes.map((c) => plainChange(c, ac.as_of, RULES, ac.entry));
  const asOf = longDate(ac.as_of);
  const lead = firstLine(ac.entry.changes, short, ac.as_of, ac.entry.after_as_of, ac.entry);
  const intro = "Here is what's new:";
  const cta = "See the details";
  const history = `${page}#h-ahead`;
  const quote = (i: PlainChange) => `${log}#c-${encodeURIComponent(i.rule_id)}`;

  const text = [
    ...(banner ? [banner.toUpperCase(), ""] : []),
    lead,
    intro,
    "",
    ...items.flatMap((i) => [
      `• ${i.topic} — ${i.sentence}${i.badge ? ` (${badgeText(i.badge)})` : ""}`,
      ...(i.badge?.why ? [`  Summary: ${i.badge.why} · see the law text: ${quote(i)}`] : []),
    ]),
    "",
    `${cta}: ${history}`,
    `Change log: ${log}`,
    "",
    `You get this because you asked for alerts on ${ac.label}. Unsubscribe: ${unsubscribe}`,
    `HomeRule · Not legal advice · data as of ${asOf}`,
    ...footerText(),
  ].join("\n");

  const why = (i: PlainChange) =>
    i.badge?.why
      ? `<br><span class="mu" style="font-size:14px;color:${C.muted}">Summary: ${esc(i.badge.why)} &middot; ${link(quote(i), "see the law text", C.muted)}</span>`
      : "";
  const htmlItems = items
    .map(
      (i) => `<tr><td class="tx ln" style="padding:12px 0;border-top:1px solid ${C.line};font-size:16px;line-height:1.5;color:${C.text}">${topicHtml(i.topic)}${badgeHtml(i.badge)}${esc(i.sentence)}${why(i)}</td></tr>`,
    )
    .join("\n");

  const html = layout({
    title: subject,
    preheader: lead,
    banner,
    site,
    rows: `<tr><td class="tx" style="padding:16px 0 8px;font-size:16px;line-height:1.5;color:${C.text}"><strong>${esc(lead)}</strong><br>${esc(intro)}</td></tr>
${htmlItems}
<tr><td style="padding:20px 0 10px">${button(history, cta)}</td></tr>
<tr><td style="padding:0 0 24px;font-size:14px">${link(log, "See the full change log")}</td></tr>`,
    footer: `You get this because you asked for alerts on ${esc(ac.label)}. ${link(unsubscribe, "Unsubscribe", C.faint)} in one click.<br>Not legal advice &middot; data as of ${esc(asOf)}<br>${footerHtml()}`,
  });

  return {
    from: FROM,
    subject,
    html,
    text,
    headers: unsubscribeHeaders(site, ac.address_id, token),
    unsubscribe_url: unsubscribe,
  };
}
