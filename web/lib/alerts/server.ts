import "server-only";
import { getDataset } from "@/lib/data";
import { longDate } from "@/lib/changes/wording.ts";
import { closedTest, demoRecipients, mailerFromEnv } from "./mail.ts";
import type { Deps } from "./service.ts";
import { storeFromEnv } from "./store.ts";

/** The site links in emails point to: ALERTS_SITE_URL, else the origin the request came in on. */
export function siteFor(req: Request): string {
  return process.env.ALERTS_SITE_URL || new URL(req.url).origin;
}

/** A known address: its label as the emails show it ("327 Jackson St, Hoboken, NJ"). */
export function addressLabel(id: string): string | null {
  const a = getDataset()?.addresses.find((x) => x.address_id === id);
  return a ? `${a.street}, ${a.postal_city}, ${a.state_code}` : null;
}

export function asOfText(): string {
  return longDate(getDataset()?.meta.default_as_of ?? null);
}

/** The caller's IP for the signup rate limit (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Everything the alert functions need, from env. Null when Redis or the HMAC secret is missing. */
export function depsFor(req: Request): Deps | null {
  const store = storeFromEnv();
  const secret = process.env.ALERTS_HMAC_SECRET ?? "";
  if (!store || !secret) return null;
  return {
    store,
    mailer: mailerFromEnv(),
    allow: demoRecipients(),
    closed: closedTest(),
    secret,
    site: siteFor(req),
    asOfText: asOfText(),
  };
}
