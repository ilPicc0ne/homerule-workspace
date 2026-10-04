export type EvidenceLead = {
  fact: string; meaning: string; value: unknown; current_value: unknown;
  comparison: string; limitation: string; source_id: string; source_record_id: string;
  source_period: string | number | null; retrieved_at: string;
  source_url: string; publisher_url?: string; match: string;
};
export type EvidenceQuestion = {
  fact: string; question: string; how_to_check: string; request_text: string; topics: string[];
  rules: { rule_id: string; citation: string; quote: string | null; source_url: string | null }[];
  public_record_routes: { name: string; url: string; method: string; limitation: string }[];
  branches: { label: string; resolved: { rule_id: string; aspect: string; result: string }[] }[];
};
export type BuildingEvidence = {
  as_of: string; address_id: string; street: string; city: string;
  questions: EvidenceQuestion[]; leads: EvidenceLead[];
  matches: { source: string; match: string; candidate_count: number }[];
};
export type EvidenceSnapshot = {
  as_of: string; dataset_sha256: string; source_commit: string;
  input_sha256: Record<string, string>; addresses: Record<string, BuildingEvidence>;
};
export type EvidenceView = { status: "available"; data: BuildingEvidence } | { status: "stale" } | { status: "unavailable" };
