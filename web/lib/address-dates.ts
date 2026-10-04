import type { Address, Dataset } from "./types.ts";

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
export const dateDay = (date: string) => Date.parse(date) / 86400000;
export const dayDate = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
export type DateControls = { selected: string; baseline: string; retrieved: string; events: string[] };
export function addressDates(data: Dataset, address: Address, selected: string): DateControls {
  const stack = new Set(Object.values(address.jurisdictions));
  const events = new Set<string>();
  for (const r of data.rules.filter(r => stack.has(r.jurisdiction_id))) {
    for (const d of [r.effective_date, r.effective_until, ...(r.status_history ?? []).map(h => h.from)])
      if (d && validAsOf(d)) events.add(d);
  }
  return { selected, baseline: data.meta.default_as_of, retrieved: data.meta.retrieved_at,
    events: [...events].sort() };
}
