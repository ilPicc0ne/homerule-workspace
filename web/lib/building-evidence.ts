import snapshot from "../data/building-evidence.json" with { type: "json" };
import { evidenceFingerprint } from "./evidence-fingerprint.ts";
import type { Address, Dataset } from "./types.ts";
import type { EvidenceSnapshot, EvidenceView } from "./building-evidence-types.ts";
const hashes = new WeakMap<Dataset, string>();
export function evidenceFor(data: Dataset, address: Address, typed = false, file = snapshot as unknown as EvidenceSnapshot, asOf = data.meta.default_as_of): EvidenceView {
  if (typed || data.meta.data_source !== "live" || !/^\d/.test(address.street)) return { status: "unavailable" };
  // Hypothetical outcomes were evaluated for the saved date, not the selected timeline date.
  if (asOf !== data.meta.default_as_of) return { status: "unavailable" };
  let hash = hashes.get(data);
  if (!hash) { hash = evidenceFingerprint(data); hashes.set(data, hash); }
  if (file.as_of !== data.meta.default_as_of || file.dataset_sha256 !== hash) return { status: "stale" };
  const record = file.addresses[address.address_id];
  if (!record || record.street !== address.street || record.city !== address.postal_city) return { status: "unavailable" };
  return { status: "available", data: record };
}
