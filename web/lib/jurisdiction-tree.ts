import jurisdictionsFile from "../data/jurisdictions.json" with { type: "json" };
import type { Jurisdiction } from "./types.ts";

/*
  The jurisdiction list the pages use (web/data/jurisdictions.json) and its tree helpers. Pure (relative
  imports, no server-only), so the pages (via lib/data) and the MCP tools share one lookup.
*/

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
