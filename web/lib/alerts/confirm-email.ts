// The double opt-in email: the address, one button, what you'll get (with a mini example card), the 48 h expiry,
// "didn't ask? ignore it". Same frame, card and footer as the alert email (layout.ts).
import { cityOf, FROM, shortAddress, unsubscribeHeaders, unsubscribeUrl } from "../changes/email.ts";
import { BADGE_TEXT, UNIT_MAY_DIFFER } from "../changes/impact.ts";
import type { Badge } from "../changes/impact.ts";
import { esc } from "./html.ts";
import { footerHtml, footerText, PRIVACY } from "./disclaimer.ts";
import { button, C, card, layout, link, para } from "./layout.ts";
import type { Message } from "./mail.ts";

export { PRIVACY };
export const PENDING_HOURS = 48;

/** The confirm page (a POST button: mail scanners prefetch GET links, so a GET never confirms). */
export function confirmUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, "")}/confirm?t=${encodeURIComponent(token)}`;
}

/** The mini card in the confirmation: what an alert looks like. Made-up wording, labelled, about no real rule. */
const EXAMPLE: Badge = { kind: "adds", arrow: "↑", text: BADGE_TEXT.adds, label: `${BADGE_TEXT.adds}. ${UNIT_MAY_DIFFER}`, why: null };
const EXAMPLE_LINE = "From Jul 1, 2027: a new limit on application fees takes effect.";

export function confirmEmail(o: {
  to: string;
  label: string;
  addressId: string;
  site: string;
  token: string;
  unsubToken: string;
  asOfText: string;
}): Message {
  const site = o.site.replace(/\/$/, "");
  const confirm = confirmUrl(site, o.token);
  const unsub = unsubscribeUrl(site, o.addressId, o.unsubToken);
  const short = shortAddress(o.label);
  const cta = `Confirm alerts for ${short}`;
  const subject = `Confirm alerts for ${short}`;
  const preheader = `One tap and you get an email only when a housing rule for ${short} changes. The link works for ${PENDING_HOURS} hours.`;
  const get = "One short email when a housing rule for this address changes: what changes, from when, and whether it adds or narrows renter protection. Nothing else.";
  const text = [
    "HomeRule · Confirm alerts",
    "",
    short,
    ...(cityOf(o.label) ? [cityOf(o.label)] : []),
    "",
    `Someone asked for HomeRule alerts for ${o.label}. If that was you, confirm here:`,
    confirm,
    "",
    `What you'll get: ${get}`,
    "",
    "Example of an alert (not about this address):",
    `   ${EXAMPLE.arrow} ${EXAMPLE.text}. ${UNIT_MAY_DIFFER}`,
    `   Application fees: ${EXAMPLE_LINE}`,
    "",
    `The link works for ${PENDING_HOURS} hours.`,
    "Didn't ask for this? Ignore this email. You will get no more mail.",
    "",
    PRIVACY,
    "",
    "--",
    `Unsubscribe: ${unsub}`,
    `HomeRule · Not legal advice · data as of ${o.asOfText}`,
    ...footerText(),
  ].join("\n");
  const html = layout({
    title: subject,
    preheader,
    kind: "Confirm alerts",
    site,
    hero: { eyebrow: "Turn on alerts for", street: short, city: cityOf(o.label) },
    rows: [
      para("Someone asked for HomeRule alerts for this address. If that was you, confirm with one tap."),
      `<tr><td style="padding:4px 0 8px">${button(confirm, cta)}</td></tr>`,
      para(`The button works for ${PENDING_HOURS} hours. Didn't ask for this? Ignore this email. You will get no more mail.`, `font-size:14px;line-height:21px;color:${C.muted};padding-bottom:20px`),
      para(`<strong>What you'll get:</strong> ${esc(get)}`),
      `<tr><td class="mu" style="padding:4px 0 8px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">Example of an alert</td></tr>`,
      card({ badge: EXAMPLE, topic: "Application fees", sentence: EXAMPLE_LINE, tag: "Example, not about this address" }),
      `<tr><td class="mu" style="padding:4px 0 16px;font-size:14px;line-height:21px;color:${C.muted}">${esc(PRIVACY)}</td></tr>`,
    ].join("\n"),
    footer: `You get this because someone entered this email for alerts on ${esc(o.label)}.<br>${link(unsub, "Unsubscribe at any time", C.muted)}<br><strong>Not legal advice</strong> &middot; data as of ${esc(o.asOfText)}<br>${footerHtml()}`,
  });
  return { from: FROM, to: o.to, subject, html, text, headers: unsubscribeHeaders(site, o.addressId, o.unsubToken) };
}
