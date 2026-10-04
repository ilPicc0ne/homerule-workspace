// The one layout both emails share (confirmation and change alert), matching the site: warm white background,
// the brand mark + "HomeRule" header, Figtree with a system fallback, pill buttons. Chrome, buttons and links are
// neutral ink; green and clay are status colours, used only for the renter-impact badge in the alert.
// Table layout and inline styles (email clients), max 560 px, light + dark colour scheme, hidden preheader.
import { esc } from "./html.ts";

export const C = {
  bg: "#fdfcfa",
  ink: "#2B3B4E",
  text: "#1d2b2f",
  muted: "#5b6573",
  faint: "#8a939e",
  line: "#e8ebee",
  panel: "#f3f4f6",
} as const;

export const FONT = "font-family:Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** A pill button (bulletproof enough for Gmail, Apple Mail and Outlook web). */
export function button(href: string, label: string): string {
  return `<a href="${esc(href)}" class="btn" style="display:inline-block;background:${C.ink};color:#ffffff;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;line-height:1.2">${esc(label)}</a>`;
}

export function link(href: string, label: string, color: string = C.ink): string {
  return `<a href="${esc(href)}" style="color:${color};text-decoration:underline">${esc(label)}</a>`;
}

export type Layout = {
  title: string;
  /** The inbox preview line (hidden in the body). */
  preheader: string;
  /** Grey notice above the content (demo / example). */
  banner?: string | null;
  /** Rows of the content table: each a full `<tr>…</tr>`. */
  rows: string;
  /** Footer HTML (unsubscribe, not legal advice, as-of, prototype notice). */
  footer: string;
  site: string;
};

/**
 * The brand mark (concept 9 "Roof scales", navy tile, white mark) as a hosted PNG, 60 px for 2x screens shown at
 * 30 px. Emails can't use inline SVG; the cell behind it is the same navy tile with an "H" alt text, so a client
 * that blocks images still shows a branded square.
 */
export function markUrl(site: string): string {
  return `${site.replace(/\/$/, "")}/email-mark.png`;
}

export function layout(o: Layout): string {
  const pad = "&#8203;&nbsp;".repeat(40);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&amp;display=swap" rel="stylesheet">
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
 .bg{background:#15191d!important} .tx{color:#e7eaee!important} .mu{color:#a3acb7!important}
 .pn{background:#22282e!important;color:#c7cdd4!important} .ln{border-color:#2c333a!important}
 .btn{background:#e7eaee!important;color:#15191d!important} a{color:#c9d3df!important}
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};color:${C.text};${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(o.preheader)}${pad}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:24px 0 12px"><a href="${esc(o.site)}" style="text-decoration:none;color:${C.text}" class="tx"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="30" height="30" align="center" valign="middle" style="width:30px;height:30px;background:${C.ink};color:#ffffff;border-radius:9px;font-weight:700;font-size:16px;${FONT}"><img src="${esc(markUrl(o.site))}" width="30" height="30" alt="H" style="display:block;width:30px;height:30px;border:0;border-radius:9px;color:#ffffff;font-weight:700;font-size:16px;line-height:30px;text-align:center;${FONT}"></td>
<td class="tx" style="padding-left:8px;font-weight:700;font-size:17px;letter-spacing:-0.01em;color:${C.text};${FONT}">HomeRule</td>
</tr></table></a></td></tr>
${o.banner ? `<tr><td class="pn" style="padding:10px 14px;background:${C.panel};color:${C.muted};border-radius:10px;font-size:13px;line-height:1.45">${esc(o.banner)}</td></tr>` : ""}
${o.rows}
<tr><td class="mu ln" style="padding:16px 0 32px;border-top:1px solid ${C.line};font-size:12px;line-height:1.55;color:${C.faint}">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}
