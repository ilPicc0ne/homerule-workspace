import { addressPageData } from "./address-page-data.ts";
import type { TimelineEvent } from "./address-view.ts";
import type { Address, Dataset, Result } from "./types.ts";

export const MIN_DATE = "1900-01-01";
export const MAX_DATE = "2100-12-31";
export function validAsOf(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= MIN_DATE && value <= MAX_DATE &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function requestedDate(value: string | string[] | null | undefined, fallback: string): string | null {
  if (value === undefined || value === null) return fallback;
  return typeof value === "string" && validAsOf(value) ? value : null;
}
export type DateControls = { selected: string; baseline: string; retrieved: string; timeline: TimelineEvent[] };
/** Pin the navigation to the existing dataset timeline so dates never disappear after selection. */
export function addressDates(data: Dataset, address: Address, selected: string,
  options: { typed?: boolean; results?: Result[] } = {}): DateControls {
  const results = options.results ?? data.lookups[data.meta.default_as_of]?.[address.address_id] ?? [];
  const { view } = addressPageData(data, address, results, { typed: options.typed, historySince: MIN_DATE });
  return { selected, baseline: data.meta.default_as_of, retrieved: data.meta.retrieved_at,
    timeline: [...view.future, ...view.past] };
}
