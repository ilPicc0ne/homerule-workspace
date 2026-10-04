import resolved from "../data/addresses.resolved.json" with { type: "json" };
import { evaluateRecord } from "./live-engine.ts";
import { requestedDate } from "./address-dates.ts";
import { addressPayload, base, type Payload } from "./address-payload.ts";
import { DATA_SOURCE } from "./config.ts";
import type { Dataset, Result } from "./types.ts";

const records = new Map(resolved.addresses.map(a => [a.address_id, a]));
export type AddressEvaluation = { asOf: string; results: Result[]; engine?: string; mode: "live" | "snapshot" };

/** Exact date only: an offline snapshot is safe only when it matches the requested day. */
export async function evaluateSample(data: Dataset, id: string, asOf: string,
  options: Parameters<typeof evaluateRecord>[3] = {}): Promise<AddressEvaluation | null> {
  const record = records.get(id);
  const live = DATA_SOURCE === "live" && record ? await evaluateRecord(record, data.rules, asOf, options) : null;
  if (live) return { asOf, ...live, mode: "live" };
  const saved = data.lookups[asOf]?.[id];
  return saved ? { asOf, results: saved, mode: "snapshot" } : null;
}

export async function liveAddressPayload(data: Dataset | null, id: string, requested: string | null,
  options: Parameters<typeof evaluateRecord>[3] = {}): Promise<Payload> {
  if (!data) return { status: 503, body: { ...base(), as_of: requested, error: "Data unavailable." } };
  const asOf = requestedDate(requested, data.meta.default_as_of);
  if (!asOf) return { status: 400, body: { ...base(), as_of: requested,
    error: "as_of must be a real date between 1900-01-01 and 2100-12-31 (YYYY-MM-DD)." } };
  if (!data.addresses.some(a => a.address_id === id))
    return { status: 404, body: { ...base(), as_of: asOf, error: `Unknown address id ${id}.` } };
  const evaluation = await evaluateSample(data, id, asOf, options);
  if (!evaluation) return { status: 503, body: { ...base(), as_of: asOf,
    error: "We could not calculate this date. Try again; no results from another date have been substituted." } };
  const payload = addressPayload(data, id, asOf, evaluation);
  return { ...payload, body: { ...payload.body, evaluation: evaluation.mode, engine: evaluation.engine ?? null } };
}
