// Subscribe / confirm / unsubscribe, independent of Next.js so the tests can run them with a fake store and mailer.
import { confirmEmail, PENDING_HOURS } from "./confirm-email.ts";
import { isEmail, normEmail, type Mailer, type Message } from "./mail.ts";
import { K, type Store, type Subscriber } from "./store.ts";
import { newToken, safeEqual } from "./unsub.ts";

export type Deps = {
  store: Store;
  mailer: Mailer | null;
  /** Closed test: only emails the seed script allowed get mail. */
  closed: boolean;
  site: string;
  asOfText: string;
  now?: () => Date;
  newToken?: () => string;
};

/**
 * What the form shows. Never says whether this email is already subscribed (no enumeration):
 * sent: "check your inbox" (also when already subscribed, nothing is sent then) · closed_test: saved, nothing sent ·
 * not_configured: no Resend key · failed: the send failed · invalid: bad input · rate_limited: too many tries from this IP
 */
export type SubscribeStatus = "sent" | "closed_test" | "not_configured" | "failed" | "invalid" | "rate_limited";

export type Preview = Pick<Message, "from" | "to" | "subject" | "html">;

export type SubscribeResult = { status: SubscribeStatus; preview?: Preview; error?: string };

/** The token shown in on-page previews: never a working link, so the preview cannot bypass the opt-in. */
export const PREVIEW_TOKEN = "preview-only";

export const RATE = { max: 5, windowSec: 600 };

const nowOf = (d: Pick<Deps, "now">) => d.now?.() ?? new Date();

export async function subscribe(input: { email: string; addressId: string; label: string; ip?: string }, d: Deps): Promise<SubscribeResult> {
  const email = normEmail(input.email ?? "");
  if (!isEmail(email) || !input.addressId) return { status: "invalid", error: "Please enter a valid email." };

  const now = nowOf(d);
  const window = Math.floor(now.getTime() / 1000 / RATE.windowSec);
  if ((await d.store.hit(K.rl(input.ip || "unknown", window), RATE.windowSec)) > RATE.max) return { status: "rate_limited" };

  const mail = (token: string) =>
    confirmEmail({
      to: email,
      label: input.label,
      addressId: input.addressId,
      site: d.site,
      token,
      // the confirm token becomes the subscription's unsubscribe token, so this link works once confirmed
      unsubToken: token,
      asOfText: d.asOfText,
    });
  const preview = (): Preview => {
    const m = mail(PREVIEW_TOKEN);
    return { from: m.from, to: m.to, subject: m.subject, html: m.html };
  };

  const subs = await d.store.subscribers(input.addressId);
  if (subs.some((s) => s.email === email)) return { status: "sent", preview: preview() };

  const token = (d.newToken ?? newToken)();
  await d.store.putPending(token, { email, address_id: input.addressId, label: input.label, created_at: now.toISOString() }, PENDING_HOURS * 3600);

  if (d.closed && !(await d.store.isAllowed(email))) return { status: "closed_test", preview: preview() };
  if (!d.mailer) return { status: "not_configured", preview: preview() };
  const r = await d.mailer.send(mail(token));
  return r.ok ? { status: "sent", preview: preview() } : { status: "failed", preview: preview(), error: r.error };
}

/** Moves a pending request to `sub:<address_id>`. Null when the token is unknown, used or older than 48 h. */
export async function confirm(t: string | null, d: Pick<Deps, "store" | "now">): Promise<Subscriber | null> {
  if (!t || t === PREVIEW_TOKEN) return null;
  const p = await d.store.takePending(t);
  if (!p) return null;
  const sub: Subscriber = {
    email: p.email,
    address_id: p.address_id,
    label: p.label,
    confirmed_at: nowOf(d).toISOString(),
    token: t,
    allowed: await d.store.isAllowed(p.email),
    demo: false,
  };
  await d.store.addSubscriber(sub);
  return sub;
}

/** Removes the subscriber at this address whose token matches (constant-time). Null when none does. */
export async function unsubscribe(addressId: string | null, t: string | null, d: Pick<Deps, "store">): Promise<Subscriber | null> {
  if (!addressId || !t || t === PREVIEW_TOKEN) return null;
  const sub = (await d.store.subscribers(addressId)).find((s) => !!s.token && safeEqual(s.token, t));
  if (!sub) return null;
  await d.store.removeSubscriber(addressId, sub.email);
  return sub;
}
