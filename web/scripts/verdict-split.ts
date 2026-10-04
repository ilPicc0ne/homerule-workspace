// Change verdict badges across all 500 sample addresses, and a random sample to hand-check against their quotes.
// Reads a changes file (default web/data/changes.full.json, the synced diff) and maps each change exactly as the
// site does (lib/changes/impact.ts badgeFor): ↑ / ↓ / = (no change) / grey; no badge only for missing or pending.
// Also counts the badges on the address page's dated history entries (lib/address-page-data.ts), which must all carry one.
// Prints Markdown for the PR.
//
//   node scripts/verdict-split.ts [--changes P] [--sample N] [--seed S]
import { readFileSync } from "node:fs";
import { badgeFor } from "../lib/changes/impact.ts";
import { addressPageData } from "../lib/address-page-data.ts";
import type { Dataset } from "../lib/types.ts";
import type { BadgeKind } from "../lib/changes/impact.ts";
import type { Change, ChangesFile } from "../lib/changes/types.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const here = new URL("..", import.meta.url).pathname;
const file = arg("--changes", `${here}data/changes.full.json`);
const sampleN = Number(arg("--sample", "15"));
let seed = Number(arg("--seed", "20261004"));

const data = JSON.parse(readFileSync(file, "utf8")) as ChangesFile;
const ids = (JSON.parse(readFileSync(`${here}data/addresses.resolved.json`, "utf8")) as { addresses: { address_id: string }[] }).addresses.map(
  (a) => a.address_id,
);

const SYM: Record<BadgeKind | "none", string> = { adds: "↑", narrows: "↓", neutral: "=", unclear: "grey", none: "none" };
const perChange: Record<string, number> = { "↑": 0, "↓": 0, "=": 0, grey: 0, none: 0 };
const perAddress: Record<string, number> = {};
const verdicts: Record<string, number> = {};
const badged: { id: string; label: string; source: string; c: Change; kind: BadgeKind; text: string }[] = [];
let withRi = 0;

for (const id of ids) {
  const rec = data.addresses[id];
  const kinds = new Set<string>();
  for (const e of rec?.entries ?? []) {
    for (const c of e.changes) {
      const v = c.renter_impact?.verdict ?? "(missing)";
      verdicts[v] = (verdicts[v] ?? 0) + 1;
      if (c.renter_impact) withRi++;
      const b = badgeFor(c);
      perChange[SYM[b?.kind ?? "none"]]++;
      if (b) {
        kinds.add(SYM[b.kind]);
        badged.push({ id, label: rec!.label, source: e.source, c, kind: b.kind, text: b.text });
      }
    }
  }
  const key = kinds.size === 0 ? (rec ? "none (changes, no badge)" : "none (no change)") : [...kinds].sort().join(" + ");
  perAddress[key] = (perAddress[key] ?? 0) + 1;
}

// Seeded shuffle (mulberry32), so the sample can be re-drawn by anyone.
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pool = [...badged];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}

// Every distinct (rule, badge, level before → after) first, so a rule that dominates the counts can't hide the rest;
// then random fill up to N.
const strata = new Map<string, (typeof pool)[number]>();
for (const x of pool) {
  const k = `${x.c.team_rule_id}|${x.kind}|${x.c.renter_impact?.level_before}|${x.c.renter_impact?.level_after}`;
  if (!strata.has(k)) strata.set(k, x);
}
const first = new Set(strata.values());
const sample = [...first, ...pool.filter((x) => !first.has(x))].slice(0, sampleN);

// Dated history entries on the address page (Coming up + Recently changed), built exactly as /a/[id] builds them.
const live = (f: string) => JSON.parse(readFileSync(`${here}data/live/${f}`, "utf8"));
const ds: Dataset = { meta: live("meta.json"), rules: live("rules.json"), lookups: live("lookups.json"), addresses: live("addresses.json"), excerpts: live("excerpts.json"), findings: live("findings.json") };
const perHistory: Record<string, number> = { "↑": 0, "↓": 0, "=": 0, grey: 0, none: 0 };
const unbadged: string[] = [];
for (const a of ds.addresses) {
  const core = addressPageData(ds, a, ds.lookups[ds.meta.default_as_of][a.address_id]);
  for (const e of [...core.view.future, ...core.view.past]) {
    if (!e.date) continue;
    perHistory[SYM[e.badge?.kind ?? "none"]]++;
    if (!e.badge) unbadged.push(`${a.address_id} ${e.ruleId} ${e.kind ?? "start"} ${e.date}`);
  }
}

const out: string[] = [];
out.push(`### Change verdict split (${file.replace(here, "web/")}, as of ${data.as_of})`, "");
out.push(`${ids.length} addresses · ${Object.values(perChange).reduce((a, b) => a + b, 0)} changes · ${withRi} carry renter_impact`, "");
out.push("| Engine verdict | Changes |", "|---|---|", ...Object.entries(verdicts).sort().map(([k, v]) => `| ${k} | ${v} |`), "");
out.push("| Badge per change | Changes |", "|---|---|", ...Object.entries(perChange).map(([k, v]) => `| ${k} | ${v} |`), "");
out.push("| Badge per dated history entry (address pages) | Entries |", "|---|---|", ...Object.entries(perHistory).map(([k, v]) => `| ${k} | ${v} |`), "");
if (unbadged.length) out.push(`Dated history entries without a badge (first 20): ${unbadged.slice(0, 20).join("; ")}`, "");
out.push("| Badges per address | Addresses |", "|---|---|", ...Object.entries(perAddress).sort().map(([k, v]) => `| ${k} | ${v} |`), "");
out.push(`### ${Math.min(sampleN, badged.length)} badges to hand-check (every rule × badge × level once, then random; seed ${arg("--seed", "20261004")})`, "");
out.push("Check each badge against the quote: does the change add / narrow renter protection at this address? More than 1 wrong → ship without page badges.", "");
out.push(`${strata.size} distinct rule × badge × level combinations; each appears at least once.`, "");
out.push("| # | Address | Rule | Change | Badge | Summary (why, shown only if it passes the lint) | Quote | OK? |", "|---|---|---|---|---|---|---|---|");
sample.forEach((x, i) => {
  const ri = x.c.renter_impact!;
  const q = (x.c.requirement_quote ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|");
  out.push(
    `| ${i + 1} | [${x.id}](/a/${x.id}) ${x.label} | ${x.c.citation ?? x.c.team_rule_id} | ${x.c.before?.result ?? "—"} → ${x.c.after?.result ?? "—"} (${ri.topic ?? x.c.category}: ${ri.level_before} → ${ri.level_after}) | ${SYM[x.kind]} ${x.text} | ${badgeFor(x.c)?.why ?? "—"} | ${q.length > 160 ? q.slice(0, 157) + "…" : q} | |`,
  );
});
console.log(out.join("\n"));
