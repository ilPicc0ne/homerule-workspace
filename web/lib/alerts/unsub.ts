// Small helpers for tokens and logs. Unsubscribe tokens are random per subscription, stored on the subscriber record
// (store.ts), so nothing needs a server secret.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newToken = () => randomBytes(24).toString("base64url");

/** Constant-time string compare (hashes both sides first, so lengths never leak or throw). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b)) && a.length === b.length;
}

/** Short, stable hash of an email for idempotency keys (no address in the key). */
export const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);

/** "b***@gmail.com": what logs and the dispatch response show instead of the address. */
export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");
