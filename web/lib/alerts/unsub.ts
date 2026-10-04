// Unsubscribe tokens: HMAC-SHA256 over "email|address_id" with ALERTS_HMAC_SECRET. Nothing is stored for them:
// the link carries the address and the token, and the server finds the subscriber whose token matches.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function unsubToken(secret: string, email: string, addressId: string): string {
  return createHmac("sha256", secret).update(`${email.trim().toLowerCase()}|${addressId}`).digest("base64url");
}

/** Constant-time string compare (hashes both sides first, so lengths never leak or throw). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b)) && a.length === b.length;
}

export function verifyUnsub(secret: string, email: string, addressId: string, token: string): boolean {
  return !!secret && !!token && safeEqual(unsubToken(secret, email, addressId), token);
}

/** Short, stable hash of an email for idempotency keys (no address in the key). */
export const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);

/** "b***@gmail.com": what logs and the dispatch response show instead of the address. */
export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");
