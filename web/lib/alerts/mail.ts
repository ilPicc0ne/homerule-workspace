// Sending through Resend (REST, plain fetch) and the closed-test allowlist.
// Until the freeze only addresses on ALERTS_ALLOWLIST (comma-separated) get mail; everyone else is saved, not mailed.

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

export function resendMailer(apiKey: string, f: typeof fetch = fetch): Mailer {
  return {
    async send(m) {
      try {
        const r = await f("https://api.resend.com/emails", {
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
  return env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY) : null;
}

export const normEmail = (e: string) => e.trim().toLowerCase();

export function allowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.ALERTS_ALLOWLIST ?? "").split(",").map(normEmail).filter(Boolean));
}

export const isEmail = (e: string) => e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(e);
