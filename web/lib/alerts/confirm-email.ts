// The double opt-in email: one button, what you'll get, the 48 h expiry, "didn't ask? ignore it". Same layout and
// footer as the alert email (layout.ts).
import { FROM, shortAddress, unsubscribeHeaders, unsubscribeUrl } from "../changes/email.ts";
import { esc } from "./html.ts";
import { footerHtml, footerText, PRIVACY } from "./disclaimer.ts";
import { button, C, layout, link } from "./layout.ts";
import type { Message } from "./mail.ts";

export { PRIVACY };
export const PENDING_HOURS = 48;

/** The confirm page (a POST button: mail scanners prefetch GET links, so a GET never confirms). */
export function confirmUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, "")}/confirm?t=${encodeURIComponent(token)}`;
}

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
  const text = [
    `Someone asked for HomeRule alerts for ${o.label}.`,
    `If that was you, open this link and confirm: ${confirm}`,
    "",
    "What you'll get: one short email when a housing rule for this address changes, in plain words, with a link to what it means. Nothing else.",
    `The link works for ${PENDING_HOURS} hours.`,
    "Didn't ask for this? Ignore this email. You will get no more mail.",
    "",
    PRIVACY,
    `Unsubscribe: ${unsub}`,
    `HomeRule · Not legal advice · data as of ${o.asOfText}`,
    ...footerText(),
  ].join("\n");
  const p = (s: string, extra = "") => `<tr><td class="tx" style="padding:6px 0;font-size:16px;line-height:1.5;color:${C.text}${extra}">${s}</td></tr>`;
  const html = layout({
    title: subject,
    preheader: `One tap to get an email when a housing rule for ${short} changes.`,
    site,
    rows: [
      `<tr><td class="tx" style="padding:16px 0 4px;font-size:22px;font-weight:700;line-height:1.3;color:${C.text}">Turn on alerts?</td></tr>`,
      `<tr><td class="mu" style="padding:0 0 8px;font-size:15px;color:${C.muted}">${esc(o.label)}</td></tr>`,
      p("Someone asked for HomeRule alerts for this address. If that was you, confirm below."),
      `<tr><td style="padding:16px 0 12px">${button(confirm, cta)}</td></tr>`,
      p(`<strong>What you'll get:</strong> one short email when a housing rule for this address changes, in plain words, with a link to what it means. Nothing else.`),
      p(`The button works for ${PENDING_HOURS} hours. Didn't ask for this? Ignore this email. You will get no more mail.`),
      `<tr><td class="pn" style="padding:10px 14px;margin:8px 0;background:${C.panel};color:${C.muted};border-radius:10px;font-size:13px;line-height:1.45">${esc(PRIVACY)}</td></tr>`,
      `<tr><td style="height:20px;line-height:20px">&nbsp;</td></tr>`,
    ].join("\n"),
    footer: `${link(unsub, "Unsubscribe", C.faint)} at any time.<br>Not legal advice &middot; data as of ${esc(o.asOfText)}<br>${footerHtml()}`,
  });
  return { from: FROM, to: o.to, subject, html, text, headers: unsubscribeHeaders(site, o.addressId, o.unsubToken) };
}
