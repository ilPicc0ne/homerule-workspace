import { createHash } from "node:crypto";
import type { Dataset } from "./types.ts";
/** Bind hypotheses to the exact published rule/address/results dataset. Server/build use only. */
export function evidenceFingerprint(data: Pick<Dataset, "rules" | "addresses" | "lookups">): string {
  return createHash("sha256").update(JSON.stringify({ rules: data.rules, addresses: data.addresses, lookups: data.lookups })).digest("hex");
}
