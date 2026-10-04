// The one frame both emails share (confirmation and change alert), in the address page's look (app/a/[id]/v3.css):
// a light wash around one white card, the brand mark + "HomeRule", Figtree with a system fallback, slate navy for
// actions, green / red only for the renter-impact verdict, always with an arrow and words (never colour alone).
//
// Bulletproof on purpose: tables and inline styles only, 600 px max (an Outlook ghost table holds the width), no
// images and no SVG (topic chips are text, so nothing breaks when images are blocked), buttons are a coloured cell +
// link (mso-padding-alt for Outlook), tap targets ≥ 44 px, light + dark (`color-scheme`, `supported-color-schemes`,
// prefers-color-scheme overrides on classes; Gmail apps invert on their own), a hidden preheader.
import { esc } from "./html.ts";
import type { Badge, BadgeKind } from "../changes/impact.ts";

/** Light tokens (v3.css). Dark ones live in the <style> block below, keyed by class. */
export const C = {
  wash: "#F4F6F9",
  card: "#ffffff",
  text: "#15222E",
  muted: "#5B6875",
  line: "#DCE3EA",
  /** Slate navy, the UI accent: buttons, links, chips. */
  accent: "#2B3B4E",
  accentInk: "#1E2B3A",
  accentTint: "#EEF1F4",
} as const;

export const FONT = "font-family:Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Verdict colours: a solid circle (white arrow, ≥ 4.5:1) and the words in the ink shade (AA on white). */
export const BADGE_STYLE: Record<BadgeKind, { cls: string; dot: string; color: string }> = {
  adds: { cls: "vb-up", dot: "#1C8150", color: "#11643D" },
  narrows: { cls: "vb-dn", dot: "#B03A35", color: "#9B2C2C" },
  unclear: { cls: "vb-un", dot: "#4D5256", color: "#4D5256" },
};

/** The main button: full width on phones, 48 px high. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" class="btn-t" style="border-collapse:separate"><tr>
<td class="btn" bgcolor="${C.accent}" style="background:${C.accent};border-radius:12px;mso-padding-alt:14px 24px;text-align:center">
<a href="${esc(href)}" class="btn-a" style="display:block;padding:14px 24px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:20px;${FONT}">${esc(label)}</a>
</td></tr></table>`;
}

/** A text link; `tap` (default) gives it a 44 px tap area (padding via the `lk` class), off for links inside a sentence. */
export function link(href: string, label: string, color: string = C.accentInk, tap = true): string {
  return `<a href="${esc(href)}"${tap ? ' class="lk"' : ""} style="color:${color};text-decoration:underline">${esc(label)}</a>`;
}

/** A topic chip (text, no icon: icons would be images, which Outlook blocks by default and dark mode can't recolour). */
export function chip(label: string): string {
  return `<span class="chip" style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.accentTint};color:${C.accentInk};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">${esc(label)}</span>`;
}

/** The verdict row: a 36 px circle with the arrow, the badge words, "Your unit may differ." underneath. */
export function verdict(b: Badge): string {
  const st = BADGE_STYLE[b.kind];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px" title="${esc(b.label)}"><tr>
<td width="36" valign="top" style="width:36px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="36" height="36" align="center" valign="middle" class="${st.cls}-dot" bgcolor="${st.dot}" style="width:36px;height:36px;border-radius:18px;background:${st.dot};color:#ffffff;font-size:20px;font-weight:700;line-height:36px;text-align:center;${FONT}"><span aria-hidden="true">${b.arrow}</span></td></tr></table></td>
<td style="padding-left:12px;padding-top:1px" valign="top"><span class="${st.cls}" style="display:block;font-size:16px;line-height:21px;font-weight:700;color:${st.color}">${esc(b.text)}</span><span class="mu" style="display:block;font-size:13px;line-height:18px;color:${C.muted}">Your unit may differ.</span></td>
</tr></table>`;
}

/** Bold the leading date of a plain line ("From Jul 1, 2027: …", "Ends on …: …") so the when stands out. */
export function sentence(s: string): string {
  const m = s.match(/^((?:From|Since|Ends on|Ended on) [A-Z][a-z]{2} \d{1,2}, \d{4}:|This rule no longer shows for your address:)\s([\s\S]*)$/);
  return m ? `<strong>${esc(m[1])}</strong> ${esc(m[2])}` : esc(s);
}

/** One change card: verdict, topic chip, the plain line, an optional summary. */
export function card(o: { badge: Badge | null; topic: string; sentence: string; extra?: string; tag?: string }): string {
  return `<tr><td style="padding:0 0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cd" style="border:1px solid ${C.line};border-radius:14px;background:${C.card};border-collapse:separate"><tr><td class="cd-p" style="padding:18px 18px 16px">
${o.badge ? verdict(o.badge) : ""}<div style="margin:0 0 8px">${chip(o.topic)}${o.tag ? `<span class="mu" style="display:block;margin-top:6px;font-size:13px;font-weight:700;color:${C.muted}">${esc(o.tag)}</span>` : ""}</div>
<div class="tx" style="font-size:17px;line-height:26px;color:${C.text}">${sentence(o.sentence)}</div>${o.extra ?? ""}
</td></tr></table>
</td></tr>`;
}

/** A paragraph row inside the card. */
export function para(html: string, style = ""): string {
  return `<tr><td class="tx" style="padding:0 0 12px;font-size:16px;line-height:24px;color:${C.text};${style}">${html}</td></tr>`;
}

export type Layout = {
  title: string;
  /** The inbox preview line (hidden in the body). */
  preheader: string;
  /** Small label right of the brand ("Rule alert", "Confirm alerts"). */
  kind: string;
  /** Dashed notice above the card (demo / example). */
  banner?: string | null;
  /** The address hero: eyebrow, street (large), city (small). */
  hero: { eyebrow: string; street: string; city: string };
  /** Rows of the card's content table: each a full `<tr>…</tr>`. */
  rows: string;
  /** Footer HTML (why you get this, unsubscribe, not legal advice, as-of, prototype notice). */
  footer: string;
  site: string;
};

export function layout(o: Layout): string {
  // Filler after the preheader so mail apps don't pull body text into the preview line.
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(o.title)}</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&amp;display=swap" rel="stylesheet"><!--<![endif]-->
<!--[if mso]><style>body,table,td,a,span,div,strong{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
a.lk{display:inline-block;padding:12px 0;text-underline-offset:3px}
@media (max-width:620px){
 .px{padding-left:16px!important;padding-right:16px!important}
 .cd-p{padding:16px 14px 14px!important}
 .st{font-size:26px!important;line-height:32px!important}
 .btn-t{width:100%!important}
}
@media (prefers-color-scheme:dark){
 .bg{background:#0E1318!important} .cv{background:#161D24!important;border-color:#26303A!important}
 .tx{color:#E7ECF1!important} .mu{color:#A3AEBA!important}
 .hero{background:#1F2A36!important} .ey{color:#A9C0D8!important}
 .cd{background:#1A222B!important;border-color:#2C3743!important}
 .chip{background:#26323F!important;color:#C9D6E4!important}
 .btn{background:#DCE4EE!important} .btn-a{color:#15222E!important}
 .mk{background:#E7ECF1!important;color:#15222E!important}
 .ban{border-color:#6B7682!important;color:#C7CDD4!important}
 a{color:#C9D6E4!important}
 .vb-up{color:#8FD9AF!important} .vb-dn{color:#F6B5AE!important} .vb-un{color:#C7CDD4!important}
 .vb-un-dot{background:#5C6268!important}
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.wash};color:${C.text};${FONT}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px">${esc(o.preheader)}${pad}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.wash}" style="background:${C.wash}"><tr><td align="center" class="px" style="padding:0 24px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;${FONT}">
<tr><td style="padding:24px 0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="${esc(o.site)}" style="text-decoration:none;color:${C.text}" class="tx"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td class="mk" width="30" height="30" align="center" valign="middle" bgcolor="${C.text}" style="width:30px;height:30px;background:${C.text};color:#ffffff;border-radius:9px;font-weight:800;font-size:16px;line-height:30px;text-align:center;${FONT}">H</td>
<td class="tx" style="padding-left:9px;font-weight:800;font-size:19px;letter-spacing:-0.015em;color:${C.text};${FONT}">HomeRule</td>
</tr></table></a></td>
<td align="right" class="mu" style="font-size:13px;font-weight:700;color:${C.muted}">${esc(o.kind)}</td>
</tr></table></td></tr>
${o.banner ? `<tr><td style="padding:0 0 12px"><div class="ban" style="padding:10px 14px;border:1.5px dashed #8A95A1;border-radius:12px;color:#4D5256;font-size:14px;line-height:20px;font-weight:700">${esc(o.banner)}</div></td></tr>` : ""}
<tr><td class="cv" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="px" style="padding:24px 28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="hero" bgcolor="${C.accentTint}" style="background:${C.accentTint};border-radius:14px;padding:18px 20px">
<div class="ey" style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.accent}">${esc(o.hero.eyebrow)}</div>
<div class="tx st" style="margin-top:6px;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.02em;color:${C.text}">${esc(o.hero.street)}</div>
${o.hero.city ? `<div class="mu" style="margin-top:2px;font-size:15px;line-height:22px;color:${C.muted}">${esc(o.hero.city)}</div>` : ""}
</td></tr></table></td></tr>
${o.rows}
</table></td></tr></table></td></tr>
<tr><td class="mu" style="padding:20px 4px 36px;font-size:13px;line-height:20px;color:${C.muted}">${o.footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
