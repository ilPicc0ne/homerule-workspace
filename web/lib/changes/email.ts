// The alert email for one address and one change source, rendered from the same diff as the change log
// (I6). PREVIEW ONLY: nothing here sends mail. Sending (Resend, double opt-in) is a P1 row in the PRD.
import type { AddressChanges, ChangesFile, Change, Entry } from "./types.ts";
import { changeLine, entryHeading, featuredEntry, longDate, resultWords, ruleName } from "./wording.ts";

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

export type RenderOptions = { site?: string; token?: string };

/** The email input for one address: the given source, or the featured one (a new document first). */
export function addressChange(file: ChangesFile, addressId: string, source?: string): AddressChange | null {
  const rec: AddressChanges | undefined = file.addresses[addressId];
  if (!rec) return null;
  const entry = source ? rec.entries.find((e) => e.source === source) : featuredEntry(rec.entries, file.as_of);
  return entry ? { address_id: addressId, label: rec.label, as_of: file.as_of, entry } : null;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function safeUrl(u: string | null): string | null {
  return u && /^https?:\/\//.test(u) ? u : null;
}

function block(c: Change) {
  const quote = c.requirement_quote;
  const url = safeUrl(c.source_url);
  const why = c.after?.explanation ?? c.before?.explanation ?? "";
  return { name: ruleName(c), line: changeLine(c), quote, url, why, citation: c.citation, eff: c.effective_from, c };
}

export function render(ac: AddressChange, opts: RenderOptions = {}): RenderedEmail {
  const site = (opts.site ?? SITE).replace(/\/$/, "");
  const token = opts.token ?? UNSUBSCRIBE_TOKEN;
  const unsubscribe = `${site}/unsubscribe?a=${encodeURIComponent(ac.address_id)}&t=${token}`;
  const page = `${site}/changes/${encodeURIComponent(ac.address_id)}`;
  const demo = ac.entry.demo_label;
  const n = ac.entry.changes.length;
  const subject = `${demo ? `[${demo}] ` : ""}${n === 1 ? "A housing rule changed" : `${n} housing rules changed`} for ${ac.label}`;
  const blocks = ac.entry.changes.map(block);
  const asOf = longDate(ac.as_of);
  const header = `Not legal advice. HomeRule shows which published housing rules may apply to an address, with quotes and dates. Data as of ${asOf}.`;

  const text = [
    ...(demo ? [`${demo.toUpperCase()}: this example is built from a fictional test document, not real law.`, ""] : []),
    header,
    "",
    `${ac.label}`,
    `${entryHeading(ac.entry)}:`,
    "",
    ...blocks.flatMap((b) => [
      `• ${b.name}`,
      `  What changed: ${b.line}`,
      ...(b.why ? [`  Why: ${b.why}`] : []),
      ...(b.quote ? [`  The rule says: "${b.quote}"`] : []),
      `  Citation: ${b.citation ?? "not stated"} · in effect from ${longDate(b.eff)}`,
      ...(b.url ? [`  Official source: ${b.url}`] : []),
      "",
    ]),
    `See the change log: ${page}`,
    "",
    `You get this because you asked for alerts on ${ac.label}. Unsubscribe: ${unsubscribe}`,
    `HomeRule · ${FROM.replace(/^.*<|>$/g, "")} · Not legal advice · as of ${asOf}`,
  ].join("\n");

  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const htmlBlocks = blocks
    .map(
      (b) => `<tr><td style="padding:16px 0;border-top:1px solid #e4eae9">
<p style="margin:0 0 4px;font-weight:700;font-size:16px">${esc(b.name)}</p>
<p style="margin:0 0 8px"><span style="color:#5a6a6e">What changed:</span> ${esc(resultWords(b.c.before))} &rarr; <strong>${esc(resultWords(b.c.after))}</strong>${
        b.c.conflict_flag_changed || b.c.after?.conflict_flag
          ? `<br><span style="color:#6b4500">${b.c.after?.conflict_flag ? "May conflict with another rule: flagged, not decided." : "Conflict flag removed."}</span>`
          : ""
      }</p>
${b.why ? `<p style="margin:0 0 8px;color:#1d2b2f">${esc(b.why)}</p>` : ""}
${b.quote ? `<blockquote style="margin:0 0 8px;padding:8px 12px;border-left:3px solid #0f766e;background:#e8f5f2">&ldquo;${esc(b.quote)}&rdquo;</blockquote>` : ""}
<p style="margin:0;font-size:14px;color:#5a6a6e">${esc(b.citation ?? "Citation not stated")} &middot; in effect from ${esc(longDate(b.eff))}${
        b.url ? ` &middot; <a href="${esc(b.url)}" style="color:#0f766e">Official source</a>` : ""
      }</p>
</td></tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#fdfcfa;color:#1d2b2f;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:16px">
${demo ? `<tr><td style="padding:10px 12px;background:#fff4e0;color:#6b4500;border-radius:8px;font-weight:700">${esc(demo)}: built from a fictional test document, not real law.</td></tr>` : ""}
<tr><td style="padding:12px 0;font-size:13px;color:#5a6a6e"><strong>Not legal advice.</strong> HomeRule shows which published housing rules may apply to an address, with quotes and dates. Data as of ${esc(asOf)}.</td></tr>
<tr><td style="padding:8px 0"><p style="margin:0;font-size:20px;font-weight:700">${esc(ac.label)}</p><p style="margin:4px 0 0;color:#5a6a6e">${esc(entryHeading(ac.entry))}</p></td></tr>
${htmlBlocks}
<tr><td style="padding:16px 0"><a href="${esc(page)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600">See the change log</a></td></tr>
<tr><td style="padding:16px 0;border-top:1px solid #e4eae9;font-size:12px;color:#5a6a6e">You get this because you asked for alerts on ${esc(ac.label)}. <a href="${esc(unsubscribe)}" style="color:#5a6a6e">Unsubscribe</a>.<br>HomeRule &middot; Not legal advice &middot; as of ${esc(asOf)}</td></tr>
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
