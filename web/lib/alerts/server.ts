import "server-only";
import { getDataset } from "@/lib/data";
import { longDate } from "@/lib/changes/wording.ts";
import { allowlist, mailerFromEnv } from "./mail.ts";
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

export function depsFor(req: Request): Deps | null {
  const store = storeFromEnv();
  if (!store) return null;
  return { store, mailer: mailerFromEnv(), allow: allowlist(), site: siteFor(req), asOfText: asOfText() };
}
