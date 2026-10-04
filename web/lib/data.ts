import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import jurisdictionsFile from "@/data/jurisdictions.json";
import { DATA_SOURCE } from "./config";
import type { Address, Dataset, Excerpt, Finding, Jurisdiction, LookupsByDate, Meta, Rule } from "./types";

/*
  Server-side loader. Reads web/data/<source>/*.json, where <source> comes from
  NEXT_PUBLIC_DATA_SOURCE. Returns null when the source has no files yet (live
  before the engine lands), so pages can show "Live data not available yet".
  The jurisdiction list is shared vocabulary, not demo data: always present.
*/

const FILES = {
  meta: "meta.json",
  rules: "rules.json",
  lookups: "lookups.json",
  addresses: "addresses.json",
  excerpts: "excerpts.json",
  findings: "findings.json",
} as const;

function dir() {
  return path.join(process.cwd(), "data", DATA_SOURCE);
}

function read<T>(name: string): T | null {
  const file = path.join(dir(), name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

let cached: Dataset | null | undefined;

export function getDataset(): Dataset | null {
  if (cached !== undefined) return cached;
  const meta = read<Meta>(FILES.meta);
  const rules = read<Rule[]>(FILES.rules);
  const lookups = read<LookupsByDate>(FILES.lookups);
  const addresses = read<Address[]>(FILES.addresses);
  const excerpts = read<Record<string, Excerpt>>(FILES.excerpts) ?? {};
  const findings = read<Record<string, Finding[]>>(FILES.findings) ?? {};
  cached = meta && rules && lookups && addresses ? { meta, rules, lookups, addresses, excerpts, findings } : null;
  return cached;
}

export const jurisdictions = (jurisdictionsFile as { jurisdictions: Jurisdiction[] }).jurisdictions;

export function jurisdictionById(id: string): Jurisdiction | undefined {
  return jurisdictions.find((j) => j.id === id);
}

/** State › County › City for a jurisdiction, top first. */
export function ancestry(id: string): Jurisdiction[] {
  const out: Jurisdiction[] = [];
  let cur = jurisdictionById(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parent ? jurisdictionById(cur.parent) : undefined;
  }
  return out;
}

export function childrenOf(id: string): Jurisdiction[] {
  return jurisdictions.filter((j) => j.parent === id);
}

/** Snap a requested date to the published list: the latest listed date on or before it. */
export function snapAsOf(meta: Meta, requested: string | null | undefined): string {
  const dates = meta.as_of_dates.map((d) => d.date);
  if (!requested) return meta.default_as_of;
  if (dates.includes(requested)) return requested;
  const earlier = dates.filter((d) => d <= requested);
  return earlier.length ? earlier[earlier.length - 1] : dates[0];
}
