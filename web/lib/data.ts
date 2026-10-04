import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DATA_SOURCE } from "./config";
import type { Address, Dataset, Excerpt, Finding, LookupsByDate, Meta, Rule } from "./types";

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

export { ancestry, childrenOf, jurisdictionById, jurisdictions } from "./jurisdiction-tree.ts";

/** Snap a requested date to the published list (shared with the API payload). */
export { snapAsOf } from "./address-payload.ts";
