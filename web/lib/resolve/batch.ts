// One sample address → one I3 record (docs/ARCHITECTURE.md B). Census decides the legal city unless it
// contradicts a postal city that is a city name (not a neighbourhood); then the postal city wins, flagged.
import type { CensusMatch, StructuredAddress } from "./census.ts";
import { buildFacts, type FactOptions } from "./facts.ts";
import { postalCityMatch } from "./jurisdictions.ts";
import { normaliseStreet, plain } from "./normalise.ts";
import { localLevel, treeForJurisdiction, treeFromGeographies } from "./tree.ts";
import type { CensusAttempt, ResolvedAddress, SampleRow, TreeLevel } from "./types.ts";

export type Geocode = (a: StructuredAddress) => Promise<CensusMatch[]>;

export type BatchOptions = FactOptions & { geocode: Geocode };

const idOf = (tree: TreeLevel[], level: TreeLevel["level"]) => tree.find((l) => l.level === level)?.id ?? null;

export async function resolveSampleRow(row: SampleRow, opts: BatchOptions): Promise<ResolvedAddress> {
  const postal = postalCityMatch(row.postal_city, row.state);
  if (!postal) throw new Error(`${row.address_id}: postal city "${row.postal_city}, ${row.state}" is not on the jurisdiction list`);
  const expected = postal.jurisdiction.level === "county" ? null : postal.jurisdiction.id;
  const neighbourhood = postal.via === "alias";

  const norm = normaliseStreet(row.street_address);
  const review: string[] = [];
  const attempts: CensusAttempt[] = [];
  let accepted: { match: CensusMatch; tree: TreeLevel[] } | null = null;
  let contradicted = false;

  if (norm.street) {
    // NJ ZIPs in the data are the owners' mailing ZIPs: never sent.
    const zip = row.state !== "NJ" && /^\d{5}$/.test(row.zip.trim()) ? row.zip.trim() : undefined;
    const tries: StructuredAddress[] = [{ street: norm.street, city: row.postal_city, state: row.state, zip }];
    if (zip) tries.push({ street: norm.street, city: row.postal_city, state: row.state });

    for (const a of tries) {
      const matches = await opts.geocode(a);
      const trees = matches.map((m) => ({ match: m, tree: treeFromGeographies(m.geographies) }));
      const agreeing = trees.find((t) => localLevel(t.tree)?.id === expected);
      const attempt: CensusAttempt = { street: a.street, city: a.city ?? "", state: a.state ?? "", zip_sent: !!a.zip, matches: matches.length, accepted: false };
      attempts.push(attempt);
      if (!trees.length) continue;
      if (agreeing || neighbourhood) {
        accepted = agreeing ?? trees[0];
        attempt.accepted = true;
        if (!agreeing) review.push(`jurisdiction: postal neighbourhood "${row.postal_city}" suggests ${expected}, Census says ${localLevel(trees[0].tree)?.name ?? "unknown"}`);
        break;
      }
      contradicted = true;
      const local = localLevel(trees[0].tree);
      attempt.rejected_city = local?.id ?? local?.name ?? null;
    }
  }

  let tree: TreeLevel[];
  let source: ResolvedAddress["source"]["jurisdiction"];
  let confidence: number;
  if (accepted) {
    tree = accepted.tree;
    source = "census";
    confidence = neighbourhood ? 0.97 : 0.99;
  } else {
    if (!expected) throw new Error(`${row.address_id}: no Census match and no city to fall back to`);
    tree = treeForJurisdiction(expected);
    source = neighbourhood ? "neighbourhood" : "postal_city";
    if (contradicted) {
      confidence = 0.8;
      review.push(`jurisdiction: Census placed the street in ${attempts.map((a) => a.rejected_city).filter(Boolean).join(", ")}, contradicting postal city "${row.postal_city}"; kept the postal city`);
    } else {
      confidence = neighbourhood ? 0.85 : 0.9;
      review.push(norm.street ? "jurisdiction: Census found no match; city from the postal city" : "jurisdiction: no house number; city from the postal city");
    }
  }

  const facts = buildFacts(row, opts);
  const local = localLevel(tree);
  const legal = local?.level === "municipality" ? local.name : null;
  const m = accepted?.match;

  return {
    address_id: row.address_id,
    input: { street_address: row.street_address, postal_city: row.postal_city, state: row.state, zip: row.zip },
    normalised_street: norm.street,
    street_changes: norm.changes,
    jurisdictions: { state: idOf(tree, "state") ?? row.state, county: idOf(tree, "county"), city: local?.id ?? null },
    stack: tree.map((l) => l.id).filter((id): id is string => !!id),
    legal_city: legal,
    postal_city: row.postal_city,
    postal_differs: legal === null || plain(legal) !== plain(row.postal_city),
    coords: m ? { lat: m.coordinates.y, lon: m.coordinates.x } : null,
    census: { matched_address: m?.matchedAddress ?? null, attempts },
    facts: facts.facts,
    source: { jurisdiction: source, ...facts.source },
    confidence: { jurisdiction: confidence, ...facts.confidence },
    review: [...review, ...facts.review],
    retrieved_at: row.retrieved_at,
    tree,
  };
}
