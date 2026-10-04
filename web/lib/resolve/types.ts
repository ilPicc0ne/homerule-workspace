// Shapes shared by the web resolver (/api/resolve, /where) and the batch run
// (make resolve → out/addresses.resolved.json, interface I3 in docs/ARCHITECTURE.md).

export type LevelKind = "federal" | "state" | "county" | "municipality" | "unincorporated";

export type TreeLevel = {
  level: LevelKind;
  /** What this level is called: "Country", "State", "County", "City", "Town", "Township", "Unincorporated area". */
  label: string;
  /** Plain name without the Census suffix: "Los Angeles", "Brookline". */
  name: string;
  /** Our jurisdiction ID from contracts/jurisdictions.json, or null when the place is not on the list. */
  id: string | null;
  geoid: string | null;
  /**
   * covered: HomeRule holds this level's rules · not_covered: law exists here, HomeRule doesn't have it ·
   * no_rules: nothing to cover at this level (no county government, county law only for unincorporated
   * areas, no city government).
   */
  status: LevelStatus;
  /** status === "covered", kept for callers that only need yes/no. */
  covered: boolean;
  note?: string;
};

export type LevelStatus = "covered" | "not_covered" | "no_rules";

export type Coverage = "covered" | "state_only" | "not_covered";

export type Coords = { lat: number; lon: number };

export type DateRange = { from: string; to: string };
export type IntRange = { min: number; max: number | null };

export type UseClass =
  | "apartment"
  | "condo"
  | "co_op"
  | "two_family"
  | "single_family"
  | "mixed_use"
  | "subsidised_housing";

/** Building facts in the vocabulary of contracts/facts.json (I7). */
export type Facts = {
  built: DateRange | null;
  units: IntRange | null;
  use_class: UseClass | null;
  subsidised: boolean | null;
  owner_type: null;
  owner_occupied: null;
};

/** "assumption": filled in by a named rule of thumb (see `assumptions` on the record), not read from the record. */
export type FactSources = {
  built: "csv" | "none";
  units: "csv" | "use_code" | "none";
  use_class: "use_code" | "assumption" | "none";
  subsidised: "use_code" | "assumption" | "none";
};

/** Short human strings naming where each fact came from, for the engine's explanations; null when the fact is null. */
export type FactSourceDetail = {
  built: string | null;
  units: string | null;
  use_class: string | null;
  subsidised: string | null;
};

export type SampleRow = {
  address_id: string;
  street_address: string;
  postal_city: string;
  state: string;
  zip: string;
  year_built: string;
  units: string;
  use_code: string;
  use_description: string;
  source_dataset: string;
  retrieved_at: string;
};

export type CensusAttempt = {
  street: string;
  city: string;
  state: string;
  zip_sent: boolean;
  matches: number;
  accepted: boolean;
  /** Municipality Census put the address in, when it contradicted the postal city. */
  rejected_city?: string | null;
};

export type ResolvedAddress = {
  address_id: string;
  input: { street_address: string; postal_city: string; state: string; zip: string };
  normalised_street: string | null;
  street_changes: string[];
  jurisdictions: { state: string; county: string | null; city: string | null };
  /** Our IDs from the top down, for the engine's jurisdiction test. */
  stack: string[];
  legal_city: string | null;
  postal_city: string;
  postal_differs: boolean;
  coords: Coords | null;
  census: { matched_address: string | null; attempts: CensusAttempt[] };
  facts: Facts;
  source: { jurisdiction: "census" | "postal_city" | "neighbourhood" } & FactSources;
  source_detail: FactSourceDetail;
  /** Named assumptions behind the facts, sorted and unique, e.g. ["boston_land_use_A_is_7_plus"]. */
  assumptions: string[];
  confidence: { jurisdiction: number; built: number; units: number };
  review: string[];
  retrieved_at: string;
  tree: TreeLevel[];
};

export type ResolvedFile = {
  _comment: string;
  census: { benchmark: string; vintage: string };
  units_from_use_code: boolean;
  count: number;
  summary: Record<string, number>;
  addresses: ResolvedAddress[];
};

/** as_of: the resolution date, YYYY-MM-DD (AGENTS.md: on every API payload). */
type Base = { query: string; not_legal_advice: true; as_of: string };

export type AddressResult = Base & {
  kind: "address";
  source: "census" | "sample";
  matched_address: string;
  coords: Coords | null;
  tree: TreeLevel[];
  coverage: Coverage;
  notes: string[];
  warnings: string[];
  /** Present for the 500 sample addresses only. */
  sample?: Pick<ResolvedAddress, "address_id" | "facts" | "source" | "source_detail" | "assumptions" | "confidence" | "review" | "retrieved_at">;
};

export type PlaceResult = Base & {
  kind: "place";
  matched: { via: "name" | "alias" | "county" | "state" | "zip"; text: string };
  tree: TreeLevel[];
  coverage: Coverage;
  notes: string[];
  /** Covered cities below a state or county, for browsing. */
  children: { id: string; name: string }[];
};

export type AmbiguousResult = Base & {
  kind: "ambiguous";
  message: string;
  candidates: { matched_address: string; municipality: string; state: string; covered: boolean }[];
  total: number;
};

export type NotFoundResult = Base & {
  kind: "not_found";
  reason: "empty" | "no_match" | "unknown_place";
  message: string;
  suggestion?: string;
};

export type UnavailableResult = Base & { kind: "unavailable"; message: string };

export type ResolveResult = AddressResult | PlaceResult | AmbiguousResult | NotFoundResult | UnavailableResult;
