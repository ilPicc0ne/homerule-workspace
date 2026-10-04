// Shapes of out/changes.full.json (interface I6, engine/diff.py; web/data/changes.full.json is a synced copy).
// One diff feeds changes.json, the change log on /changes/[id] and the alert email, so they can't disagree.

export type Result = "applies" | "unknown" | "superseded" | "not_yet_effective" | "pending";

export type Side = { result: Result; conflict_flag: boolean; explanation: string };

export type Change = {
  team_rule_id: string;
  change: "added" | "removed" | "changed";
  before: Side | null;
  after: Side | null;
  result_changed: boolean;
  conflict_flag_changed: boolean;
  scored: boolean;
  title: string | null;
  citation: string | null;
  requirement_quote: string | null;
  source_url: string | null;
  effective_from: string | null;
  /** The rule's end date (sunset or repeal), null when none. */
  effective_until?: string | null;
  jurisdiction_id: string;
  category: string;
  document_status: string;
  origin: string;
};

export type Entry = {
  source: string;
  kind: "as_of" | "ingest";
  title: string;
  before_as_of: string;
  after_as_of: string;
  /** "Demo: fictional ordinance" for anything derived from a fictional rehearsal document, else null. */
  demo_label: string | null;
  changes: Change[];
};

export type AddressChanges = {
  label: string;
  jurisdictions: { state: string; county?: string | null; city?: string | null };
  entries: Entry[];
};

export type Source = {
  kind: "as_of" | "ingest";
  title: string;
  before: { as_of: string };
  after: { as_of: string };
  document: { doc_id: string; path?: string; effective?: string[]; fictional?: boolean } | null;
  demo_label: string | null;
  affected_address_ids: string[];
  rule_ids: string[];
  /** Sources across a rule end date (engine/diff.py until_sources): the rules whose effective.until is that day. */
  ending_rule_ids?: string[];
};

export type ChangesFile = {
  as_of: string;
  not_legal_advice: true;
  sources: Record<string, Source>;
  addresses: Record<string, AddressChanges>;
};
