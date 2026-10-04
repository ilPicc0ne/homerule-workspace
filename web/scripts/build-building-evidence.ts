// Run after Python regeneration and web sync; publish selected review fields, never entire source responses.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { evidenceFingerprint } from "../lib/evidence-fingerprint.ts";
const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const hash = (path: string) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const plans = read("build/building-evidence-plans.json");
const source = read("data/building-evidence/public-evidence.json");
for (const [file, expected] of Object.entries(plans.input_sha256)) {
  if (hash(`out/${file}`) !== expected) throw Error(`Stale investigation plans: ${file}`);
}
if (source.input_sha256 !== plans.input_sha256["addresses.resolved.json"] ||
    hash("data/building-evidence/public-evidence.json") !== plans.evidence_input_sha256) throw Error("Evidence snapshot mismatch");
const data = { rules: read("web/data/live/rules.json"), addresses: read("web/data/live/addresses.json"), lookups: read("web/data/live/lookups.json") };
if (read("web/data/live/meta.json").default_as_of !== plans.as_of) throw Error("Evidence as-of mismatch");
// Source shapes are read only during generation; runtime has the small typed projection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addresses: Record<string, any> = {};
for (const a of data.addresses) {
  const p = plans.addresses[a.address_id];
  const e = source.addresses[a.address_id];
  if (!p || !e) continue;
  addresses[a.address_id] = {
    as_of: p.as_of, address_id: a.address_id, street: a.street, city: a.postal_city,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions: p.questions.map((q: any) => Object.fromEntries(["fact", "question", "how_to_check", "request_text", "topics", "rules", "public_record_routes", "branches"].map(k => [k, q[k]]))),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leads: p.building_evidence.map((l: any) => ({
      ...Object.fromEntries(["fact", "meaning", "value", "current_value", "comparison", "limitation", "source_id", "source_record_id", "source_period", "retrieved_at", "source_url", "publisher_url"].map(k => [k, l[k] ?? null])),
      match: e.sources[l.source_id]?.match ?? "unknown",
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matches: Object.entries(e.sources).map(([source, s]: [string, any]) => ({ source, match: s.match, candidate_count: s.candidate_count ?? 0 })).filter(s => s.match !== "none"),
  };
}
const out = { as_of: plans.as_of, dataset_sha256: evidenceFingerprint(data), source_commit: "76e20be6534de7aa3d87182c62e24bcc14e6f72f", input_sha256: plans.input_sha256, addresses };
writeFileSync(resolve(root, "web/data/building-evidence.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`Evidence: ${Object.keys(addresses).length} addresses; refreshed against current rules.`);
