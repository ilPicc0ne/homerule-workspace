// Subscribe / confirm / unsubscribe, independent of Next.js so the tests can run them with a mocked store and mailer.
import { randomBytes } from "node:crypto";
import { confirmEmail } from "./confirm-email.ts";
import { isEmail, normEmail, type Mailer, type Message } from "./mail.ts";
import type { Store, Subscription } from "./store.ts";

export type Deps = {
  store: Store;
  mailer: Mailer | null;
  allow: Set<string>;
  site: string;
  asOfText: string;
  now?: () => Date;
  newToken?: () => string;
};

/**
 * sent: confirmation email sent · closed_test: saved, not on the allowlist, nothing sent ·
 * not_configured: on the allowlist but no Resend key, saved, nothing sent · already: confirmed before ·
 * failed: the send failed, saved as pending · invalid: bad input
 */
export type SubscribeStatus = "sent" | "closed_test" | "not_configured" | "already" | "failed" | "invalid";

export type Preview = Pick<Message, "from" | "to" | "subject" | "html">;

export type SubscribeResult = { status: SubscribeStatus; preview?: Preview; error?: string };

/** The token shown in on-page previews: never a working link, so the preview cannot bypass the opt-in. */
export const PREVIEW_TOKEN = "preview-only";

const token = () => randomBytes(24).toString("base64url");

export async function subscribe(input: { email: string; addressId: string; label: string }, d: Deps): Promise<SubscribeResult> {
  const email = normEmail(input.email ?? "");
  if (!isEmail(email) || !input.addressId) return { status: "invalid", error: "Please enter a valid email." };
  const preview = (): Preview => {
    const m = confirmEmail({ to: email, label: input.label, site: d.site, token: PREVIEW_TOKEN, asOfText: d.asOfText });
    return { from: m.from, to: m.to, subject: m.subject, html: m.html };
  };

  const existing = await d.store.get((await d.store.tokenFor(email, input.addressId)) ?? "");
  if (existing?.status === "confirmed") return { status: "already" };

  const allowed = d.allow.has(email);
  const sub: Subscription = existing ?? {
    token: (d.newToken ?? token)(),
    email,
    address_id: input.addressId,
    label: input.label,
    status: "pending",
    created_at: (d.now?.() ?? new Date()).toISOString(),
    confirmed_at: null,
    allowlisted: allowed,
  };
  sub.allowlisted = allowed;
  await d.store.save(sub);

  if (!allowed) return { status: "closed_test", preview: preview() };
  if (!d.mailer) return { status: "not_configured", preview: preview() };
  const r = await d.mailer.send(confirmEmail({ to: email, label: sub.label, site: d.site, token: sub.token, asOfText: d.asOfText }));
  return r.ok ? { status: "sent", preview: preview() } : { status: "failed", preview: preview(), error: r.error };
}

export async function confirm(t: string | null, d: Pick<Deps, "store" | "now">): Promise<Subscription | null> {
  if (!t || t === PREVIEW_TOKEN) return null;
  const sub = await d.store.get(t);
  if (!sub) return null;
  if (sub.status !== "confirmed") {
    sub.status = "confirmed";
    sub.confirmed_at = (d.now?.() ?? new Date()).toISOString();
    await d.store.save(sub);
  }
  return sub;
}

export async function unsubscribe(t: string | null, d: Pick<Deps, "store">): Promise<Subscription | null> {
  if (!t || t === PREVIEW_TOKEN) return null;
  return d.store.remove(t);
}
