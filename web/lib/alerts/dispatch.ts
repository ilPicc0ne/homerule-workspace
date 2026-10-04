// Change alerts for one change source: per address in that diff entry (I6, the same data as the change log and
// changes.json, nothing recomputed), per confirmed subscriber, the one alert template (render) with that subscriber's
// unsubscribe link, sent through Resend.
//   - Idempotent: alerts:sent:<source>:<address>:<hash(email)> is written only after Resend accepts the mail,
//     so a failed send is retried on the next run and a sent one never goes twice.
//   - Demo-labelled sources (fictional law) go only to DEMO_RECIPIENTS. While the closed test is on, so does everything.
//   - resetSent clears a source's keys for DEMO_RECIPIENTS only, so rehearsals don't eat the live take.
import { addressChange, render } from "../changes/email.ts";
import type { ChangesFile } from "../changes/types.ts";
import type { Mailer } from "./mail.ts";
import { K, type Store } from "./store.ts";
import { emailHash, maskEmail, unsubToken } from "./unsub.ts";

export type DispatchDeps = {
  store: Store;
  mailer: Mailer | null;
  allow: Set<string>;
  closed: boolean;
  secret: string;
  site: string;
  /** List who would get what, send nothing, write nothing. */
  dryRun?: boolean;
};

export type Outcome = "sent" | "already" | "failed" | "skipped_demo" | "skipped_closed_test" | "would_send";
export type Line = { address_id: string; to: string; outcome: Outcome; detail?: string; subject?: string };

export type DispatchReport = {
  source: string;
  title: string;
  demo: boolean;
  addresses: number;
  lines: Line[];
  counts: Partial<Record<Outcome, number>>;
};

export class DispatchError extends Error {
  readonly code: "unknown_source" | "not_configured";
  constructor(msg: string, code: DispatchError["code"]) {
    super(msg);
    this.code = code;
  }
}

/** Addresses with an entry for this source (from the per-address diff, the change log's own data). */
export function sourceAddresses(file: ChangesFile, source: string): string[] {
  return Object.keys(file.addresses).filter((id) => file.addresses[id].entries.some((e) => e.source === source && e.changes.length));
}

export async function dispatchAlerts(file: ChangesFile, source: string, d: DispatchDeps): Promise<DispatchReport> {
  const src = file.sources[source];
  if (!src) throw new DispatchError(`Unknown change source "${source}" in this build (as of ${file.as_of}).`, "unknown_source");
  if (!d.dryRun && !d.mailer) throw new DispatchError("No RESEND_API_KEY: nothing can be sent.", "not_configured");
  const demo = !!src.demo_label;
  const ids = sourceAddresses(file, source);
  const lines: Line[] = [];

  for (const id of ids) {
    const ac = addressChange(file, id, source)!;
    for (const sub of await d.store.subscribers(id)) {
      const to = maskEmail(sub.email);
      const line = (outcome: Outcome, detail?: string, subject?: string) => lines.push({ address_id: id, to, outcome, detail, subject });
      if (!d.allow.has(sub.email) && (demo || d.closed)) {
        line(demo ? "skipped_demo" : "skipped_closed_test");
        continue;
      }
      const key = K.sent(source, id, emailHash(sub.email));
      if (await d.store.isSent(key)) {
        line("already");
        continue;
      }
      const m = render(ac, { site: d.site, token: unsubToken(d.secret, sub.email, id) });
      if (d.dryRun) {
        line("would_send", undefined, m.subject);
        continue;
      }
      const r = await d.mailer!.send({ from: m.from, to: sub.email, subject: m.subject, html: m.html, text: m.text, headers: m.headers });
      if (r.ok) {
        await d.store.markSent(key);
        line("sent", r.id, m.subject);
      } else line("failed", r.error, m.subject);
    }
  }
  const counts: DispatchReport["counts"] = {};
  for (const l of lines) counts[l.outcome] = (counts[l.outcome] ?? 0) + 1;
  return { source, title: src.title, demo, addresses: ids.length, lines, counts };
}

/** Clears this source's sent: keys for the DEMO_RECIPIENTS only. Returns how many existed. */
export async function resetSent(file: ChangesFile, source: string, store: Store, recipients: Set<string>): Promise<number> {
  const ids = file.sources[source] ? sourceAddresses(file, source) : [];
  const keys = ids.flatMap((id) => [...recipients].map((e) => K.sent(source, id, emailHash(e))));
  return store.clear(keys);
}

export function describe(r: DispatchReport): string {
  const head = `${r.source} · ${r.title}${r.demo ? " · DEMO (DEMO_RECIPIENTS only)" : ""} · ${r.addresses} address(es)`;
  if (!r.lines.length) return `${head}\nNo confirmed subscriber at these addresses. Nothing to send.`;
  const body = r.lines.map((l) => `  ${l.outcome.padEnd(20)} ${l.address_id} ${l.to}${l.detail ? ` (${l.detail})` : ""}`).join("\n");
  const sum = Object.entries(r.counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  return `${head}\n${body}\n${sum}`;
}
