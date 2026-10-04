// `make notify`: who would get a change alert, and the email each would get. Sending only with SEND=1, never automatic.
import { addressChange, render, type RenderedEmail } from "../changes/email.ts";
import type { ChangesFile } from "../changes/types.ts";
import type { Mailer } from "./mail.ts";
import type { Subscription } from "./store.ts";

export type Planned = { sub: Subscription; email: RenderedEmail; source: string; allowed: boolean };

/** Confirmed subscribers whose address has a change in the diff, with the rendered email. */
export function plan(subs: Subscription[], file: ChangesFile, o: { site: string; allow: Set<string>; source?: string }): Planned[] {
  const out: Planned[] = [];
  for (const sub of subs) {
    if (sub.status !== "confirmed") continue;
    const ac = addressChange(file, sub.address_id, o.source);
    if (!ac || !ac.entry.changes.length) continue;
    out.push({ sub, email: render(ac, { site: o.site, token: sub.token }), source: ac.entry.source, allowed: o.allow.has(sub.email) });
  }
  return out;
}

export function describe(p: Planned[]): string {
  if (!p.length) return "No confirmed subscriber has a change in this diff. Nothing to send.";
  return p
    .map(
      (x, i) =>
        `── ${i + 1}/${p.length} ${x.allowed ? "" : "[NOT ON ALERTS_ALLOWLIST: would be skipped] "}to ${x.sub.email} · ${x.sub.address_id} · ${x.source}\n` +
        `From: ${x.email.from}\nSubject: ${x.email.subject}\nList-Unsubscribe: ${x.email.headers["List-Unsubscribe"]}\n\n${x.email.text}\n`,
    )
    .join("\n");
}

/** Sends to allowlisted recipients only. Returns one line per recipient. */
export async function send(p: Planned[], mailer: Mailer): Promise<string[]> {
  const lines: string[] = [];
  for (const x of p) {
    if (!x.allowed) {
      lines.push(`skipped ${x.sub.email} (not on ALERTS_ALLOWLIST)`);
      continue;
    }
    const r = await mailer.send({ from: x.email.from, to: x.sub.email, subject: x.email.subject, html: x.email.html, text: x.email.text, headers: x.email.headers });
    lines.push(r.ok ? `sent ${x.sub.email} (${r.id})` : `FAILED ${x.sub.email}: ${r.error}`);
  }
  return lines;
}
