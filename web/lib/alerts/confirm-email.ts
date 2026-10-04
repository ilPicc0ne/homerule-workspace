// The double opt-in email: one short message with a confirm button. Same look and footer as the alert email.
import { FROM, unsubscribeUrl } from "../changes/email.ts";
import { esc } from "./html.ts";
import { footerHtml, footerText } from "./disclaimer.ts";
import type { Message } from "./mail.ts";

export function confirmUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, "")}/api/confirm?token=${encodeURIComponent(token)}`;
}

export function confirmEmail(o: { to: string; label: string; site: string; token: string; asOfText: string }): Message {
  const confirm = confirmUrl(o.site, o.token);
  const unsub = unsubscribeUrl(o.site, o.token);
  const subject = `Confirm alerts for ${o.label}`;
  const text = [
    `Not legal advice. Data as of ${o.asOfText}.`,
    "",
    `Someone asked for HomeRule alerts for ${o.label}.`,
    "If that was you, tap this link to turn them on:",
    confirm,
    "",
    "We will email you when a housing rule for this address changes.",
    "If it was not you, do nothing. You will get no more mail.",
    "",
    `Stop at any time: ${unsub}`,
    `HomeRule · Not legal advice · as of ${o.asOfText}`,
    ...footerText(),
  ].join("\n");
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#fdfcfa;color:#1d2b2f;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:16px">
<tr><td style="padding:12px 0;font-size:13px;color:#5a6a6e"><strong>Not legal advice.</strong> Data as of ${esc(o.asOfText)}.</td></tr>
<tr><td style="padding:8px 0"><p style="margin:0;font-size:20px;font-weight:700">Turn on alerts?</p><p style="margin:4px 0 0;color:#5a6a6e">${esc(o.label)}</p></td></tr>
<tr><td style="padding:8px 0;font-size:16px;line-height:1.5"><p style="margin:0 0 8px">Someone asked for HomeRule alerts for this address. If that was you, tap the button.</p><p style="margin:0">We will email you when a housing rule for this address changes. If it was not you, do nothing. You will get no more mail.</p></td></tr>
<tr><td style="padding:16px 0"><a href="${esc(confirm)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600">Yes, send me alerts</a></td></tr>
<tr><td style="padding:16px 0;border-top:1px solid #e4eae9;font-size:12px;color:#5a6a6e"><a href="${esc(unsub)}" style="color:#5a6a6e">Unsubscribe</a> at any time.<br>HomeRule &middot; Not legal advice &middot; as of ${esc(o.asOfText)}<br><br>${footerHtml()}</td></tr>
</table></body></html>`;
  return {
    from: FROM,
    to: o.to,
    subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
