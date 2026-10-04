// The alert email for one address and one change source, rendered from the same diff as the change log
// (I6). Plain on purpose: one sentence per change (the same words as the address page) and a link to the page.
// Rendering only: sending is `make notify SEND=1` (web/scripts/notify.ts), never automatic.
import type { AddressChanges, ChangesFile, Change, Entry } from "./types.ts";
import { esc } from "../alerts/html.ts";
import { footerHtml, footerText } from "../alerts/disclaimer.ts";
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

/** The one-click unsubscribe link for a subscription token (URL-encoded). */
export function unsubscribeUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, "")}/api/unsubscribe?token=${encodeURIComponent(token)}`;
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
  const unsubscribe = unsubscribeUrl(site, token);
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

  const ink = "#2B3B4E";
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const badge = (i: PlainChange) =>
    i.impact && i.impact !== "neutral"
      ? `<span style="display:inline-block;margin:0 0 6px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:${IMPACT_LABEL[i.impact].color};background:${IMPACT_LABEL[i.impact].bg}">${esc(IMPACT_LABEL[i.impact].text)}</span><br>`
      : "";
  const htmlItems = items
    .map(
      (i) => `<tr><td style="padding:12px 0;border-top:1px solid #e8ebee">${badge(i)}<p style="margin:0;font-size:16px;line-height:1.5"><strong>${esc(i.topic)}</strong> &mdash; ${esc(i.sentence)}</p></td></tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#ffffff;color:${ink};${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:20px 16px">
${banner ? `<tr><td style="padding:8px 12px;background:#f3f4f6;color:#5b6573;border-radius:8px;font-size:13px">${esc(banner)}</td></tr>` : ""}
<tr><td style="padding:16px 0 8px;font-size:16px;line-height:1.5">${esc(greeting)}</td></tr>
${htmlItems}
<tr><td style="padding:20px 0 8px"><a href="${esc(page)}" style="display:inline-block;background:${ink};color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">${esc(cta)}</a></td></tr>
<tr><td style="padding:0 0 24px;font-size:13px"><a href="${esc(log)}" style="color:${ink}">See the full change log</a></td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid #e8ebee;font-size:11px;line-height:1.5;color:#8a939e">You get this because you asked for alerts on ${esc(ac.label)}. <a href="${esc(unsubscribe)}" style="color:#8a939e">Unsubscribe</a>.<br>Not legal advice &middot; data as of ${esc(asOf)}<br>${footerHtml()}</td></tr>
</table></body></html>`;

  return {
    from: FROM,
    subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    unsubscribe_url: unsubscribe,
  };
}
