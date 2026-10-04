// The alert email for one address and one change source, rendered from the same diff as the change log
// (I6). Plain on purpose: one sentence per change (the same words as the address page) and a link to the page.
// Rendering only: sending is dispatchAlerts (web/lib/alerts/dispatch.ts), triggered after a deploy, never on its own.
import type { AddressChanges, ChangesFile, Change, Entry } from "./types.ts";
import { esc } from "../alerts/html.ts";
import { footerHtml, footerText } from "../alerts/disclaimer.ts";
import { button, C, layout, link } from "../alerts/layout.ts";
import { featuredEntry, longDate } from "./wording.ts";
import { PLAIN, TOPICS } from "../plain.ts";
import { formatDate } from "../format.ts";
import rulesData from "../../data/live/rules.json" with { type: "json" };

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

/** The unsubscribe page for one address (one button that POSTs). `token` is the HMAC from alerts/unsub.ts. */
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

/** Renter-facing impact from the classifier: "impact" or "renter_impact" on the change or the rule record. */
export type Impact = "more_protection" | "less_protection" | "neutral";

export const IMPACT_LABEL: Record<Exclude<Impact, "neutral">, { text: string; color: string; bg: string }> = {
  more_protection: { text: "More protection for renters", color: "#1F6B4A", bg: "#E6F2EC" },
  less_protection: { text: "Less protection for renters", color: "#9A4A2E", bg: "#F7EAE3" },
};

type RuleRec = { rule_id: string; category?: string; summary?: string; title?: string; impact?: unknown; renter_impact?: unknown };
const RULES = new Map((rulesData as unknown as RuleRec[]).map((r) => [r.rule_id, r]));

function impactOf(...recs: (object | undefined)[]): Impact | null {
  for (const r of recs) {
    const o = r as { impact?: unknown; renter_impact?: unknown } | undefined;
    const v = o?.impact ?? o?.renter_impact;
    if (v === "more_protection" || v === "less_protection" || v === "neutral") return v;
  }
  return null;
}

/** The short address for subject and button: the part before the first comma. */
export function shortAddress(label: string): string {
  return label.split(",")[0].trim();
}

export type PlainChange = { topic: string; sentence: string; impact: Impact | null };

/** One change in renter words: topic + the address page's plain line + the date. No titles, statuses or citations. */
export function plainChange(c: Change, asOf: string, rules: Map<string, RuleRec> = RULES): PlainChange {
  const rule = rules.get(c.team_rule_id);
  const topic = TOPICS.find((t) => t.cat === (c.category || rule?.category))?.title ?? "Housing rules";
  let line = (PLAIN[c.team_rule_id]?.line ?? rule?.summary ?? "A rule for this address changed.").trim();
  if (!/[.!?]$/.test(line)) line += ".";
  const date = formatDate(c.effective_from);
  if (c.change === "removed") line = `This rule no longer shows for your address: ${line}`;
  else if (date && !line.includes(date)) line = `${(c.effective_from ?? "") > asOf ? "From" : "Since"} ${date}: ${line}`;
  return { topic, sentence: line, impact: impactOf(c, rule) };
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
  const items = ac.entry.changes.map((c) => plainChange(c, ac.as_of));
  const asOf = longDate(ac.as_of);
  const greeting = `Hi, a housing rule for ${short} is changing. Here is what's new:`;
  const cta = `See what this means for ${short}`;

  const text = [
    ...(banner ? [banner.toUpperCase(), ""] : []),
    greeting,
    "",
    ...items.flatMap((i) => [`• ${i.topic} — ${i.sentence}${i.impact && i.impact !== "neutral" ? ` (${IMPACT_LABEL[i.impact].text})` : ""}`]),
    "",
    `${cta}: ${page}`,
    `Change log: ${log}`,
    "",
    `You get this because you asked for alerts on ${ac.label}. Unsubscribe: ${unsubscribe}`,
    `HomeRule · Not legal advice · data as of ${asOf}`,
    ...footerText(),
  ].join("\n");

  const badge = (i: PlainChange) =>
    i.impact && i.impact !== "neutral"
      ? `<span style="display:inline-block;margin:0 0 6px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:${IMPACT_LABEL[i.impact].color};background:${IMPACT_LABEL[i.impact].bg}">${esc(IMPACT_LABEL[i.impact].text)}</span><br>`
      : "";
  const htmlItems = items
    .map(
      (i) => `<tr><td class="tx ln" style="padding:12px 0;border-top:1px solid ${C.line};font-size:16px;line-height:1.5;color:${C.text}">${badge(i)}<strong>${esc(i.topic)}</strong> &mdash; ${esc(i.sentence)}</td></tr>`,
    )
    .join("\n");

  const html = layout({
    title: subject,
    preheader: items.length === 1 ? `${items[0].topic}: ${items[0].sentence}` : `${items.length} housing rules change for ${short}.`,
    banner,
    site,
    rows: `<tr><td class="tx" style="padding:16px 0 8px;font-size:16px;line-height:1.5;color:${C.text}">${esc(greeting)}</td></tr>
${htmlItems}
<tr><td style="padding:20px 0 10px">${button(page, cta)}</td></tr>
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
