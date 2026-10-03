// Free text → jurisdiction tree. Serves /api/resolve and /where (and later the MCP route).
// Deterministic: places resolve through our list and aliases, street addresses through Census.
// Ambiguity is returned to the caller, never decided silently.
import { CensusUnavailable, censusMatches, oneLineUrl, type CensusMatch, type FetchLike } from "./census.ts";
import { parseInput } from "./input.ts";
import { CITY_COUNT, childrenOf, displayName, searchPlace, searchState, stateOf } from "./jurisdictions.ts";
import { plain } from "./normalise.ts";
import type { SampleIndex } from "./samples.ts";
import { stateForZip, type StateInfo } from "./states.ts";
import { FEDERAL, coverageOf, localLevel, treeForJurisdiction, treeForState, treeFromGeographies } from "./tree.ts";
import type { AddressResult, Coverage, PlaceResult, ResolveResult, ResolvedAddress, TreeLevel } from "./types.ts";

export type ResolveDeps = {
  fetch: FetchLike;
  samples?: SampleIndex;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const SCOPE = `HomeRule has law for 3 states and ${CITY_COUNT} cities: California (Los Angeles, San Francisco, San Diego, Berkeley, Santa Ana), New Jersey (Jersey City, Hoboken, Newark) and Massachusetts (Boston, Cambridge).`;

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const base = (query: string) => ({ query, not_legal_advice: true as const });

function placeResult(query: string, tree: TreeLevel[], matched: PlaceResult["matched"], notes: string[], coverage?: Coverage): PlaceResult {
  const last = tree[tree.length - 1];
  const children = last.id ? childrenOf(last.id).map((j) => ({ id: j.id, name: displayName(j) })) : [];
  return { ...base(query), kind: "place", matched, tree, coverage: coverage ?? coverageOf(tree), notes, children };
}

function stateOnly(query: string, s: StateInfo, typed: string | null, via: PlaceResult["matched"]["via"]): PlaceResult {
  const tree = treeForState(s);
  const inScope = tree[1].covered;
  const notes: string[] = [];
  if (typed) {
    notes.push(
      inScope
        ? `"${typed}" isn't one of the cities in HomeRule, so only ${s.name} state rules are covered. Type a street address to see which city or town it is in.`
        : `${SCOPE} ${s.name} isn't one of them.`,
    );
  } else if (!inScope) {
    notes.push(`${SCOPE} ${s.name} isn't one of them.`);
  }
  return placeResult(query, tree, { via, text: typed ?? s.name }, notes, inScope ? (typed ? "state_only" : "covered") : "not_covered");
}

function resolvePlace(query: string, place: string, state: StateInfo | null): ResolveResult {
  if (!place && state) return stateOnly(query, state, null, "state");

  const hit = searchPlace(place, state);
  if (hit) {
    const j = hit.jurisdiction;
    const notes = hit.via === "alias" ? [`${title(place)} is part of ${displayName(j)}; ${displayName(j)}'s rules apply there.`] : [];
    return placeResult(query, treeForJurisdiction(j.id), { via: hit.via, text: place }, notes);
  }
  if (!state) {
    const s = searchState(place);
    if (s) return stateOnly(query, s, null, "state");
    return {
      ...base(query),
      kind: "not_found",
      reason: "unknown_place",
      message: `We couldn't find "${place}". ${SCOPE} Try a street address, a city like "Hoboken, NJ" or a neighbourhood like "Dorchester".`,
    };
  }
  return stateOnly(query, state, place, "state");
}

function notesFor(match: CensusMatch, tree: TreeLevel[]): string[] {
  const postal = match.addressComponents.city ?? "";
  const local = localLevel(tree);
  if (!postal || !local) return [];
  const county = tree.find((l) => l.level === "county")?.name ?? "the county";
  if (local.level === "unincorporated") {
    return [`The postal address says ${title(postal)}, but this spot is outside the City of ${title(postal)}: it is unincorporated ${county}. City of ${title(postal)} rules don't apply here.`];
  }
  if (plain(postal) !== plain(local.name)) {
    return [`The postal city is ${title(postal)}, but the legal city is ${local.name}. ${local.name}'s rules apply.`];
  }
  return [];
}

/** Abbreviations Census uses in postal city names ("LA SELVA BCH"). */
const POSTAL_ABBR: Record<string, string> = { bch: "beach", mt: "mount", ft: "fort", st: "saint", pt: "point", hts: "heights", spgs: "springs", vly: "valley" };
const expand = (s: string) => plain(s).split(" ").map((w) => POSTAL_ABBR[w] ?? w).join(" ");

function warningsFor(typedCity: string | null, state: StateInfo | null, match: CensusMatch, tree: TreeLevel[]): string[] {
  if (!typedCity) return [];
  const t = expand(typedCity);
  const postal = match.addressComponents.city ?? "";
  if (t === expand(postal) || tree.some((l) => expand(l.name) === t)) return [];
  const alias = searchPlace(typedCity, state);
  if (alias && tree.some((l) => l.id === alias.jurisdiction.id)) return [];
  const local = localLevel(tree);
  return [
    `You typed ${typedCity}, but Census found this street in ${title(postal)}${local ? ` (${local.name})` : ""}. If that isn't your address, check the street name and house number.`,
  ];
}

function fromSample(query: string, a: ResolvedAddress): AddressResult {
  const notes: string[] = [];
  if (a.postal_differs && a.legal_city) notes.push(`The postal city is ${a.postal_city}, but the legal city is ${a.legal_city}. ${a.legal_city}'s rules apply.`);
  const warnings =
    a.source.jurisdiction === "census"
      ? []
      : ["Census couldn't place this street exactly; the city comes from the property record's postal city."];
  return {
    ...base(query),
    kind: "address",
    source: "sample",
    matched_address: a.census.matched_address ?? `${a.input.street_address}, ${a.postal_city}, ${a.input.state}`,
    coords: a.coords,
    tree: a.tree,
    coverage: coverageOf(a.tree),
    notes,
    warnings,
    sample: { address_id: a.address_id, facts: a.facts, source: a.source, confidence: a.confidence, review: a.review, retrieved_at: a.retrieved_at },
  };
}

export async function resolveQuery(query: string, deps: ResolveDeps): Promise<ResolveResult> {
  const p = parseInput(query);

  if (p.kind === "empty") {
    return { ...base(query), kind: "not_found", reason: "empty", message: "Type an address, a city, a neighbourhood, a county or a state." };
  }

  if (p.kind === "zip") {
    const s = stateForZip(p.zip!);
    if (!s) {
      return placeResult(query, [FEDERAL], { via: "zip", text: p.zip! }, [`ZIP ${p.zip} is outside California, New Jersey and Massachusetts. ${SCOPE}`], "not_covered");
    }
    const r = stateOnly(query, s, null, "zip");
    return {
      ...r,
      matched: { via: "zip", text: p.zip! },
      coverage: "state_only",
      notes: [`ZIP ${p.zip} is in ${s.name}. A ZIP code can cross city lines, so type the street address to find your city.`],
    };
  }

  if (p.kind === "place") return resolvePlace(query, p.place ?? "", p.state);

  const sample = deps.samples?.lookup(p);
  if (sample) return fromSample(query, sample);

  let matches: CensusMatch[];
  try {
    matches = await censusMatches(oneLineUrl(p.text), deps);
  } catch (e) {
    if (e instanceof CensusUnavailable) {
      return { ...base(query), kind: "unavailable", message: "The US Census address service didn't answer. Please try again in a minute." };
    }
    throw e;
  }

  if (!matches.length) {
    const city = p.city ? searchPlace(p.city, p.state) : null;
    const suggestion = city ? `${displayName(city.jurisdiction)}, ${stateOf(city.jurisdiction).id}` : undefined;
    return {
      ...base(query),
      kind: "not_found",
      reason: "no_match",
      message: "The US Census address service couldn't find that street address. Check the house number and street name, or search for just the city.",
      suggestion,
    };
  }

  const trees = matches.map((m) => ({ m, tree: treeFromGeographies(m.geographies) }));
  const keyOf = (t: TreeLevel[]) => t.map((l) => l.geoid ?? l.name).join(">");
  const groups = new Map<string, { m: CensusMatch; tree: TreeLevel[] }>();
  for (const t of trees) if (!groups.has(keyOf(t.tree))) groups.set(keyOf(t.tree), t);

  if (groups.size > 1) {
    const candidates = [...groups.values()].slice(0, 8).map(({ m, tree }) => ({
      matched_address: m.matchedAddress,
      municipality: localLevel(tree)?.name ?? "unknown",
      state: tree.find((l) => l.level === "state")?.name ?? "",
      covered: coverageOf(tree) !== "not_covered",
    }));
    return {
      ...base(query),
      kind: "ambiguous",
      message: `This street exists in ${groups.size} places. Pick yours, or add the city and state.`,
      candidates,
      total: matches.length,
    };
  }

  const { m, tree } = trees[0];
  return {
    ...base(query),
    kind: "address",
    source: "census",
    matched_address: m.matchedAddress,
    coords: { lat: m.coordinates.y, lon: m.coordinates.x },
    tree,
    coverage: coverageOf(tree),
    notes: notesFor(m, tree),
    warnings: warningsFor(p.city, p.state, m, tree),
  };
}
