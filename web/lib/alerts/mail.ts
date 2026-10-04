// Sending through Resend (REST, plain fetch) and the one recipient allowlist, DEMO_RECIPIENTS.
// DEMO_RECIPIENTS (comma-separated, Vercel env and .env.local only, never in the repo) is the only list of who may get mail:
//   - demo-labelled sources (fictional law) go only to these addresses, always;
//   - while the closed test is on (the postal-address footer is still a placeholder), every mail does:
//     confirmation emails and real alerts to anyone else are saved, not sent.
import { POSTAL_ADDRESS } from "./disclaimer.ts";

export type Message = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface Mailer {
  send(m: Message): Promise<SendResult>;
}

/** `base` is overridable (RESEND_API_URL) only so a local end-to-end run can point at a fake Resend. */
export function resendMailer(apiKey: string, f: typeof fetch = fetch, base = "https://api.resend.com"): Mailer {
  return {
    async send(m) {
      try {
        const r = await f(`${base.replace(/\/$/, "")}/emails`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
        });
        const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
        return r.ok && j.id ? { ok: true, id: j.id } : { ok: false, error: j.message ?? `Resend ${r.status}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

/** The mailer from env (RESEND_API_KEY), or null when no key is set: then nothing can be sent. */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  return env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, fetch, env.RESEND_API_URL || undefined) : null;
}

export const normEmail = (e: string) => e.trim().toLowerCase();

/** DEMO_RECIPIENTS: comma-separated, trimmed, case-insensitive. */
export function demoRecipients(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.DEMO_RECIPIENTS ?? "").split(",").map(normEmail).filter(Boolean));
}

/** The closed test lasts until the owner fills in the postal address (CAN-SPAM); until then only DEMO_RECIPIENTS get mail. */
export const closedTest = (postal: string = POSTAL_ADDRESS) => postal.includes("PLACEHOLDER");

export const isEmail = (e: string) => e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(e);
