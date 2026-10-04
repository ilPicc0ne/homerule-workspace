/*
  Data shapes shared by the demo data (web/data/demo/) and, later, the engine output
  (web/data/live/). Same field names as docs/ARCHITECTURE.md (I1, I3, I5) and
  contracts/facts.json, so real output can replace the demo files by swapping them.
*/

export type Category =
  | "rent_increase_limits"
  | "just_cause_eviction"
  | "security_deposits"
  | "application_screening_fees"
  | "screening_restrictions"
  | "algorithmic_rent_setting";

export type Level = "state" | "county" | "city";

/** Result of one rule at one address on one as-of date (engine step C). */
export type ResultValue = "applies" | "unknown" | "superseded" | "not_yet_effective" | "pending";

/** Rule status at a date. `effective_date_disputed` evaluates to an unknown result. */
export type RuleStatus = "in_force" | "not_yet_effective" | "pending" | "failed" | "effective_date_disputed";

// ---- contracts/jurisdictions.json (I1) ----
export type Jurisdiction = {
  id: string;
  level: Level;
  legal_name: string;
  schema_name: string | null;
  parent: string | null;
  census_geoid: string;
  rules: boolean;
  aliases: string[];
};

// ---- contracts/facts.json (I7) ----
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
export type OwnerType = "individual" | "corporation" | "reit" | "public";

export type Facts = {
  built: DateRange | null;
  units: IntRange | null;
  use_class: UseClass | null;
  subsidised: boolean | null;
  owner_type: OwnerType | null;
  owner_occupied: boolean | null;
};

export type FactName = keyof Facts;

// ---- addresses.resolved.json (I3) ----
export type Address = {
  address_id: string;
  street: string;
  postal_city: string;
  state_code: string;
  zip: string | null;
  jurisdictions: { state: string; county: string; city: string };
  facts: Facts;
  fact_sources: Partial<Record<FactName, { source: string; confidence: number }>>;
  coords: { lon: number; lat: number } | null;
  legal_city_note?: string;
  review_flag?: string;
  source: { dataset: string; retrieved_at: string; use_description: string };
  /** True for the hand-prepared demo addresses that have an address page. */
  demo?: boolean;
};

// ---- rules.json (I2), plus fields the pages need ----
export type Rule = {
  rule_id: string;
  jurisdiction_id: string;
  schema_name: string | null;
  level: "state" | "city";
  /** "no_rule": a "no rule at this level" finding backed by text (e.g. MA bars rent control). */
  kind: "rule" | "no_rule";
  category: Category;
  title: string;
  /** Status as of the default query date. */
  status: Exclude<RuleStatus, "effective_date_disputed">;
  effective_date: string | null;
  /** First day the rule no longer applies (sunset or repeal, `effective.until`); null when the text gives none. */
  effective_until?: string | null;
  effective_dates_disputed?: { date: string; source: string }[];
  /** Status over time; the entry with the latest `from` on or before a date wins. */
  status_history?: { from: string | null; status: RuleStatus }[];
  citation: string;
  source_doc_id: string | null;
  source_url: string | null;
  source_kind: "official" | "secondary" | "none";
  retrieved_at: string | null;
  /** Verbatim substring of the source document, or null while extraction is pending. */
  quoted_span: string | null;
  summary: string;
  key_value: string | null;
  coverage_in_words: string;
  /** Building facts the coverage test reads; empty when no building condition. */
  coverage_facts: FactName[];
  exemptions: string | null;
  interaction: { type: string; note?: string; quote?: string };
  eviction?: { reasons: string; notice: string; relocation: string };
  eviction_source?: { doc_id: string; url: string; retrieved_at: string };
  open_question?: string;
  what_next: WhatNext;
  /** A rehearsal record (the hour-16 placeholder): never linked, never law. */
  fictional?: boolean;
  audit: {
    model_extracted: Record<string, unknown> & { confidence: number };
    code_decided: string[];
  };
};

export type WhatNext = { label: string; url?: string };

// ---- lookups.json (I4/I5) ----
export type Result = {
  rule_id: string;
  category: Category;
  result: ResultValue;
  governed_by?: string;
  conflict_with?: string[];
  missing_facts?: string[];
  confidence: number;
  explanation: string;
  what_next: WhatNext;
};

/** as_of → address_id → results. Rules that don't apply are left out. */
export type LookupsByDate = Record<string, Record<string, Result[]>>;

export type Excerpt = { doc_id: string; offset: number; before: string; quote: string; after: string };

export type Meta = {
  data_source: "demo" | "live";
  label: string;
  note: string;
  default_as_of: string;
  retrieved_at: string;
  as_of_dates: { date: string; label: string }[];
  demo_address_ids: string[];
  simulation?: { address_id: string; rule: Rule };
};

/** A "what the sources say" finding that is not a rule (I8, out/findings.json): a state bar on local
    rules, an open legal question, or a law reported only by a link with no text in our sources. */
export type Finding = {
  category: Category;
  kind: "barred_by_law" | "open_question" | "not_in_corpus" | string;
  citation: string | null;
  quote: string | null;
  note: string;
  source_doc_ids: string[];
  url: string | null;
};

export type Dataset = {
  meta: Meta;
  rules: Rule[];
  lookups: LookupsByDate;
  addresses: Address[];
  excerpts: Record<string, Excerpt>;
  /** jurisdiction_id → findings; live data only. */
  findings: Record<string, Finding[]>;
};
