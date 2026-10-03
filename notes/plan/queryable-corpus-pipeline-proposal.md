# HomeRule: proposed pipeline for a queryable legal dataset

Status: **discussion draft — no implementation authorized by this document**  
Prepared: 2026-10-03  
Scope: starter pack, targeted supplemental sources, and subsequent law changes.

## 1. The proposal in plain language

We preserve each source, recover its legal structure, label coherent passages, extract supported rule summaries, and connect passages to the definitions and exceptions needed to understand them.

Later, a question becomes a small structured request: **which jurisdiction, which topic, which date, which event?** The database returns matching passages and their dependencies. Luna uses that evidence to answer, while code verifies citations and performs supported date and numerical checks.

Example:

```text
Extract:
  This passage concerns California security-deposit deductions.
  It states a restriction and refers to the permitted purposes in subsection (b).
  Its exact source text is at these offsets in this immutable document version.

Later ask:
  "Can my landlord deduct for ordinary wear and tear?"

Retrieve:
  California + security_deposits + permitted_deductions
  → matching passages
  → their scope, definitions, exceptions and referenced provisions
  → Luna explains what the evidence says and what facts remain unknown.
```

**No embedding, keyword, or full-text ranking is required for this retrieval path.** Models still interpret natural language when assigning tags and mapping questions to tags. Deterministic database filtering does not make those interpretations infallible.

The dataset is queryable before every rule can be executed as code. We do not need a database column for every possible legal condition.

### Relationship to the existing plan

The accepted [decision 0002](../../docs/decisions/0002-rules-as-filtered-data-not-rag.md) and [build spec](spec.md) assume deterministic coverage evaluation. This draft proposes retaining structured retrieval while allowing Luna to interpret complex conditions. It does **not** silently replace those documents.

The decision to settle before implementation is how much coverage logic must be executable for the challenge. This proposal supports a small verified evaluator, but does not assume we can compile all housing law correctly during the hackathon.

## 2. Intended outcome and boundaries

The finished dataset should support:

1. All six challenge categories across the supplied jurisdictions.
2. An address-based overview, a focused question, and an as-of-date comparison.
3. Exact citations, including several evidence spans supporting one answer.
4. Local references such as “paragraph (5)” and cross-document references.
5. Incremental ingestion without reprocessing every unchanged document.
6. Explicit explanations of missing sources, facts, tags and unresolved references.
7. Export to the supplied challenge formats without making those formats our entire internal schema.

“Full” means **all discovered in-scope material is accounted for**. It does not mean every source is accessible, every legal interaction is settled, or every conceivable future question has a narrow tag.

Outside the first build: a nationwide crawler, a full zoning corpus, unrestricted legal advice, arbitrary machine-executable law, and a self-modifying ontology in production.

## 3. Overall flow

```text
Starter manifest + targeted supplemental sources
    ↓
Immutable capture + provenance + source inventory
    ↓
Text extraction with source-location mapping
    ↓
Legal hierarchy + canonical identifiers + coherent passage boundaries
    ↓
Candidate generation in code → Jev decisions → Luna where needed
    ↓
Passage tags + rule summaries + evidence + temporal assertions
    ↓
Reference resolution + definition/exception dependencies
    ↓
Validation → atomic publication of a dataset revision
    ↓
Structured indexes + coverage inventory
    ↓
Question/address → validated query plan → SQL filters → dependency expansion
    ↓
Luna interpretation + deterministic checks → cited answer / challenge exports
```

Address enrichment runs alongside ingestion and joins the legal dataset through jurisdiction IDs and typed facts.

## 4. Inputs and source acquisition

### 4.1 Start with what exists

Import the original manifest, all supplied text, sample addresses, JSON Schema and change-test specifications. Preserve their original IDs and bytes. Distinguish a manifest entry from a captured document: a URL alone provides no extractable evidence.

The current pack has 87 manifest entries and 54 text files. Its capture-status labels are not a substitute for checking actual files. Reconcile discrepancies in an ingestion report.

Suggested acquisition order:

| Wave | Material | Purpose |
|---|---|---|
| A | Supplied text and manifest | Establish a reproducible baseline. |
| B | Missing Hoboken, Jersey City and Newark primary law; NJ deposit and eviction statutes | Fill major coverage and interaction gaps. |
| C | Relevant SF, LA and San Diego provisions; other linked primary law where needed | Replace incomplete summaries with scoped legal text. |
| D | Referenced definitions, exemptions, enactment records and effective-date evidence | Make retrieved passages interpretable. |
| E | Assessor dictionaries, jurisdiction boundaries and selected program lookups | Interpret property facts and validate coverage. |

Fetch a complete section or bounded chapter when that is necessary to retain its context. Do not recursively fetch every citation in an entire code. A referenced zoning definition is in scope when a rental rule uses it; general zoning expansion is a separate product decision.

```python
for source in supplied_manifest + approved_supplemental_manifest:
    inventory.record(source)
    if source.has_supplied_text:
        capture_original(source)
    elif access_permits_capture(source):
        capture_targeted_source(source)
    else:
        inventory.mark(source, "unavailable", reason=access_reason)

for missing_reference in unresolved_required_references:
    queue_targeted_fetch(missing_reference, depth_limit, source_budget)
```

### 4.2 Preserve two kinds of provenance

- **Source provenance:** URL, publisher, source type, capture time, raw hash, local artifact, original starter ID or supplemental ID.
- **Processing provenance:** parser, model, prompt, ontology and extraction versions; validation results; parent artifacts.

Official law, agency guidance, news, bill text and status pages are separate source types. A newer news article does not automatically override enacted text. Contradictory claims remain visible and require resolution.

## 5. Internal data model

The user-facing mental model has four parts: **documents, passages, concepts and links**. Supporting records below provide versioning, evidence, rule export and auditability.

These are logical records; several can be stored in one physical table or JSON field initially. Proposed implementation: one relational database and files for immutable artifacts. SQLite is sufficient for a local prototype; changing the database should not change the contracts.

```typescript
Source {
  source_id, starter_doc_id?, url, publisher,
  source_kind, corpus_origin: "starter" | "supplemental",
  capture_status, access_notes
}

DocumentVersion {
  document_version_id, source_id, raw_hash, raw_artifact_path,
  evidence_text_path, evidence_text_hash, captured_at,
  parser_version, location_map_path, parse_status
}

LegalNode {
  node_id, document_version_id, parent_node_id?, order,
  kind: "code" | "chapter" | "section" | "subsection" | "paragraph" | "other",
  canonical_key?, label, heading?, start_char, end_char,
  structure_status: "verified" | "partial" | "ambiguous"
}

Passage {
  passage_id, document_version_id, node_id,
  start_char, end_char, content_hash,
  jurisdiction_ids[], scope_status,
  annotation_status, dependency_status
}

Concept {
  concept_id, facet, parent_concept_id?, description,
  question_examples[], ontology_version
}

PassageTag {
  passage_id, concept_id,
  decision: "present" | "absent" | "uncertain",
  evidence_span_ids[], method, confidence?, annotation_run_id
}

FacetCoverage {
  passage_id, facet, ontology_version,
  status: "complete" | "partial" | "unreviewed"
}

EvidenceSpan {
  span_id, document_version_id, start_char, end_char,
  role, source_locator?, validation_status
}

Rule {
  rule_id, jurisdiction_id, category_id, canonical_citation,
  requirement, key_value?, coverage_text?, exemption_text?,
  supporting_passage_ids[], evidence_by_field,
  fact_dependency_ids[], optional_verified_predicate?,
  extraction_status, extraction_run_id
}

TemporalAssertion {
  assertion_id, subject_id, kind,
  // e.g. adopted, effective, repealed, failed, applies_to_event_after
  date_or_interval?, date_precision, event_type?, condition_text?,
  evidence_span_ids[], resolution_status
}

Link {
  link_id, from_id, relation,
  // cites, defines, exception_to, qualifies, amends,
  // explicitly_overrides, possible_conflict, version_of
  reference_text?, target_canonical_key?, to_id?,
  scope_text?, effective_interval?, evidence_span_ids[],
  resolution: "resolved" | "ambiguous" | "missing" | "candidate"
}

PropertyFact {
  property_id, fact_key, value_or_interval, unit?,
  entity_scope, valid_at?, source, derivation?, confidence?, conflict_status
}

DatasetRevision {
  revision_id, artifact_ids[], ontology_version,
  extraction_config_hash, published_at, validation_report
}
```

Add a source/coverage inventory keyed by jurisdiction, category and revision. It records known sources, inaccessible sources and processing gaps. An empty answer must be distinguishable from an empty or incomplete corpus.

### 5.1 Compact facets, extensible values

| Facet | Examples | Retrieval purpose |
|---|---|---|
| Category | The six supplied schema categories | Broad, stable filtering. |
| Topic | `deposit.amount_limit`, `deposit.permitted_deductions`, `deposit.return`, `screening.criminal_history` | Narrow within a category. |
| Function | requirement, definition, exception, scope, procedure, remedy, interaction | Assemble an interpretable answer. |
| Actor | tenant, landlord, screening_provider | Optional narrowing when reliable. |
| Event | application, lease_start, rent_increase, move_out | Distinguish when a requirement matters. |
| Fact dependency | building.units, certificate_date, landlord.portfolio_units, tenant.service_member | Identify what could change the answer. |

All facets are multi-valued. A paragraph can contain both a requirement and an exception. A definition can serve several categories.

New topics become **rows in Concepts**, not new database columns. New arbitrary questions can initially retrieve their parent category. If finer distinctions are valuable, add a reviewed concept and backfill affected passages. Until backfill completes, the narrower filter cannot claim complete recall.

Conditions remain readable text with evidence. A reusable fact key is not an executable interpretation of that condition.

## 6. Text preparation and legal chunking

### 6.1 Evidence text and model text

Keep the original raw source and an immutable evidence-text representation. For starter files, evidence text is the supplied text, including its original characters. Cleaning for model input creates a separate view with a mapping back to evidence text.

Use one offset convention throughout: zero-based Unicode code-point offsets, end-exclusive, in the decoded evidence text. Consumers must not mix these with UTF-8 bytes or JavaScript UTF-16 indices.

For HTML/PDF additions, retain page/DOM locations where possible. OCR-derived text gets an OCR flag; exact matching against that text does not prove the OCR matches the visible source.

```python
raw = preserve_bytes(source)
evidence_text, source_locations = extract_text(raw)
model_text, reverse_map = normalize_for_model(evidence_text)

# A quote is always materialized from evidence_text, never rewritten by a model.
quote = evidence_text[span.start_char:span.end_char]
```

### 6.2 Recover structure before splitting

Use HTML structure, headings, numbering and indentation first. Recognize repeated labels within their ancestor path. Store paragraphs without reliable numbering under synthetic source-local IDs; do not invent official citations.

Example from supplied D025:

```text
CA / Civil Code / 1950.5
  (a)       scope
  (b)       definition and permitted purposes
  (c)(1)    deposit amount limit
  (c)(2)    referenced qualification
  (c)(3)    referenced qualification
  (c)(5)(A) exception with two requirements
     (i)    landlord type
     (ii)   landlord portfolio
  (c)(5)(B) qualification involving service members
  (c)(5)(C) definitions used by the exception
  (c)(6)    event-date qualification
  (e)       restrictions on deductions
  (h)       return and itemization procedures
```

A canonical key might be `US:CA:CIV:1950.5/c/5/A/ii`. It identifies a provision, not a particular capture. Multiple document versions may represent it. Renumbering requires an evidenced mapping; a new hash alone does not establish legal continuity.

### 6.3 Chunk by coherent meaning inside the hierarchy

- Prefer a numbered paragraph or coherent group of paragraphs.
- Keep an introductory condition attached to its enumerated requirements through parent/context links.
- Split oversized sections at sentence or subparagraph boundaries; carry the parent path and scope.
- Preserve tables with their headers and footnotes; mark uncertain table reconstruction.
- Use token size as an operational ceiling, not as the definition of a legal unit.
- Do not discard substantive text because it lacks a heading or a confident tag.

Provisional model-input target: roughly 300–1,200 tokens per unit. It is a tuning parameter to measure, not a legal or provider constraint.

```python
tree = parse_structure(evidence_text)
for region in tree.ambiguous_regions:
    proposal = luna_propose_structure(region, nearby_headings)
    accept_only_if_offsets_and_parentage_validate(proposal)

passages = split_at_coherent_boundaries(tree)
assert every_substantive_region_is_indexed_or_explicitly_flagged()
```

An unresolved parse retains a coarse section/document passage in the searchable dataset. Structural uncertainty should make retrieval broader, not make the text disappear.

## 7. Extraction: code → Jev → Luna → validation

### 7.1 Division of work

| Component | Responsibility |
|---|---|
| Code | Source handling, candidate spans, explicit dates/numbers/citations, offsets, hashes, hierarchy checks, indexes and numerical operations. |
| Jev | Bounded choices: category/topic/function tags; whether a candidate is an effective date, an exception or a referenced target; selection among supported candidates. |
| Luna | Ambiguous structure, complex conditions, open-ended summaries, omitted candidates, novel topics and interpretation of retrieved evidence. |
| Validation | Reject unsupported values and invented spans; preserve unresolved material with a reason. |

Jev's documented interface returns predefined decisions. It needs candidate generation; it cannot discover an arbitrary missing date or write our rule summary merely because we provide a JSON Schema. Its extraction example selects from candidates found in the text. See [OpenRouter's Jev explanation](https://openrouter.ai/blog/insights/what-is-jev/) and [extraction example](https://openrouter.ai/labs/jev/extract).

“Luna” is a model role here. Pin the actual provider/model identifier during implementation; no specific API, price or availability is assumed.

### 7.2 Passage annotation

```python
for passage in passages:
    context = passage + parent_scope + nearby_definitions
    candidates = code_candidates(context)
    # Candidate values include source spans, dates, numbers and citations.

    decisions = jev_decide(
        context,
        categories=all_six_categories,
        functions=controlled_functions,
        topics=topics_for_possible_categories,
        field_candidates=candidates,
        allow_uncertain=True,
        allow_none_of_the_above=True,
    )

    if candidate_gap_or_ambiguity(decisions) or validation_fails(decisions):
        decisions = luna_repair_or_extend(context, decisions, ontology)

    save_supported_annotations(decisions)
    mark_facet_completeness_per_ontology_version()
```

Do not force mutually exclusive categories when several apply. Use independent decisions or a supported multi-label wrapper. A confidently wrong candidate set remains wrong: sample accepted Jev results for evaluation and measure omissions separately from accuracy on offered choices.

Provider confidence is a routing signal, not proof of legal correctness. Choose thresholds from our held-out fixtures; do not start with an untested claim that “0.9 means safe.”

### 7.3 Rule extraction and evidence

Group annotated passages by jurisdiction, category and cited provision. Extract a requirement, supported values, coverage text, exemptions and evidence for each field. Keep several passages under one rule when they qualify the same requirement.

This grouping is a starting point, not a rule that every section must produce exactly one output. Preserve distinct obligations internally and handle the challenge's expected granularity in an export adapter. There is no accessible dev key to calibrate exact matching against.

```python
for provision_group in group_annotated_passages():
    selected_values = jev_choose_supported_candidates(provision_group)
    rule = luna_extract_rule_summary_and_conditions(
        provision_group, selected_values,
        require_evidence_for_each_field=True,
    )
    validate(rule)
    store(rule, or_status="needs_review")
```

This deliberately uses Luna for free-form extraction. Jev speeds the bounded work; claiming Jev alone can populate arbitrary legal prose would hide a missing stage.

Multiple evidence spans are stored separately. Never join disjoint source sentences and present the result as one verbatim quotation. A later answer may choose a subset of those spans, but cannot manufacture its evidence.

## 8. Time and legal status

Keep distinct:

1. When we captured a source.
2. When a law was proposed, enacted, effective, repealed or failed.
3. Which event date a provision governs: for example, when a deposit was collected or a tenancy began.
4. Which version of the law the source actually represents.

```python
status = derive_status(
    legal_events=supported_temporal_assertions,
    as_of=query.as_of,
    scenario=query.scenario,
)
# Capture date is never used as a substitute for effective date.
```

Store uncertain dates and date precision. Do not convert “July 2027” to a verified July 1. Effective intervals can differ within one document. A current code snapshot must not be projected backward across amendments unless the historical text is supported.

For a historical query with missing historical text, return a temporal coverage gap. For “what changes next,” include enacted future provisions. Pending proposals and failed measures have separate statuses and do not become current law.

## 9. Linking without comparing every passage to every other passage

### 9.1 Explicit references

Build indexed citation aliases and canonical keys first. Resolve references using the source's legal hierarchy, code identity, jurisdiction and relevant version.

```python
for ref in parse_explicit_references(passage):
    scope = resolve_reference_scope(ref, passage.ancestor_path)
    candidates = citation_index.lookup(scope.code, scope.section, scope.path)
    candidates = select_supported_versions(candidates, reference_time_context)

    if exactly_one_supported_target(candidates):
        save_link(ref, candidates[0], resolution="resolved")
    else:
        save_unresolved_reference(ref, candidates)
```

In D025, “paragraph (5)” in `(c)(1)` resolves under subdivision `(c)`, not to the many other paragraphs labelled `(5)` elsewhere. The same paragraph also refers to `(2)` and `(3)`; all three references must be captured.

Explicit reference extraction covers ranges, multiple targets and external provisions. “This section” resolves to the ancestor section. Ambiguous “above/below” references stay unresolved until supported.

### 9.2 Dependencies that are not explicit citations

Not every exception says “see paragraph X.” Within each bounded section, classify general scope, definitions, exceptions and qualifications. Attach these to the section or relevant rule bundle. Retrieve them conservatively with any matching child passage.

When the exact dependency is uncertain, include the enclosing section. This trades extra context for reduced omission risk.

### 9.3 Interactions across laws

Create candidates only within an overlapping jurisdiction stack, category/topic and relevant period. Prefer explicit preemption, savings or override language. For inferred interactions, assess the relevant bundle at query time and cache by all input versions.

```python
candidates = rules_in_same_topic_and_overlapping_scope(rule)
for other in candidates_requiring_interaction_review(candidates):
    assessment = assess_supported_interaction(rule, other)
    save_evidenced_link_or_possible_conflict(assessment)
```

“More local,” “newer” and “stricter” are not universal precedence rules. Uncertain preemption becomes a conflict flag, not automatic deletion of a city rule.

This avoids a global all-pairs pass. A large topic bucket can still generate many candidates: measure candidate counts and escalate or defer explicitly rather than silently dropping pairs. Reference traversal uses a visited set; a depth or size limit that leaves dependencies unresolved marks the result incomplete.

## 10. Property facts and jurisdiction

Resolve the legal jurisdiction independently of the mailing-city field. Store geocoder/boundary provenance and retain the original address values. Address ambiguity remains explicit; it must not silently remove potentially relevant city law.

Normalize facts into a small typed registry. Values can be exact, intervals, missing or conflicting.

```text
building.units                 = [5, +infinity), from a verified use-code meaning
building.year_built            = 1979
building.certificate_date      = unknown
landlord.portfolio_units       = unknown
landlord.legal_type            = unknown
tenant.service_member          = unknown
tenancy.deposit_collected_date = unknown
```

These are distinct facts. Units in this building do not establish the landlord's entire portfolio. Year built is not a certificate date. Use-code interpretation must cite the dictionary for that particular source dataset.

Public facts and user-supplied facts have separate provenance. A renter's hypothetical or personal answer must not overwrite the supplied challenge address data.

## 11. Publish a queryable revision

Publish only after structural and integrity checks. Failed model extraction does not require hiding intact source text: publish a coarse retrievable fallback plus a processing gap. Broken source integrity blocks that artifact.

Recommended indexes:

```text
LegalNode(canonical_key, document_version_id)
LegalNode(parent_node_id, order)
Passage(document_version_id, node_id)
PassageJurisdiction(jurisdiction_id, passage_id)
PassageTag(concept_id, decision, passage_id)
ConceptClosure(ancestor_id, descendant_id)
Link(from_id, relation), Link(to_id, relation)
Rule(jurisdiction_id, category_id)
TemporalAssertion(subject_id, kind)
PropertyFact(property_id, fact_key)
```

Jurisdiction membership and concept ancestry use join tables rather than bespoke columns. Evidence spans and content artifacts remain immutable.

```python
staged_revision = validate_and_stage(all_artifacts)
if integrity_checks_pass(staged_revision):
    publish_atomically(staged_revision)
else:
    retain_previous_published_revision()
```

The queryable unit is a pinned dataset revision. A query must not mix old tags, new text and stale references.

## 12. Querying: a small plan, not model-written arbitrary SQL

The question interpreter sees the concept catalog and produces a validated plan. Code owns SQL generation. It uses parameters and read-only operations.

```typescript
QueryPlan {
  jurisdiction_ids: ["US:CA", "US:CA:SAN_FRANCISCO"],
  as_of: "2026-10-01",
  categories: ["security_deposits"],
  topics: ["deposit.permitted_deductions"],
  events: ["move_out"],
  mode: "focused_question", // or overview, changes, hypothetical
  mapping_status: "confident", // or ambiguous, out_of_scope
  fact_inputs: {},
  dataset_revision: "revision-id"
}
```

Validate every concept and jurisdiction ID. Use actor/event tags as optional narrowing, not mandatory conditions when their annotations or the question are uncertain.

### 12.1 Candidate selection and conservative broadening

```python
def retrieve(plan):
    geographic_pool = passages_for_jurisdictions(plan.jurisdiction_ids)
    geographic_pool += passages_with_uncertain_scope_relevant_to_plan(plan)

    category_pool = select_matching_or_uncertain_category(geographic_pool, plan)
    focused = select_topic_or_descendants(category_pool, plan.topics)

    # Unknown or incomplete tags are not negative evidence.
    focused += passages_with_incomplete_required_facets(category_pool)
    focused += unresolved_coarse_fallback_passages(category_pool)

    if plan.mapping_status != "confident":
        focused = category_pool

    evidence = expand_parents_definitions_exceptions_and_links(focused)
    evidence = select_temporal_views(evidence, plan.as_of, plan.mode)
    return evidence, coverage_report(plan, evidence)
```

Conceptually, the seed filter is:

```sql
SELECT DISTINCT p.passage_id
FROM passage p
JOIN passage_jurisdiction j ON j.passage_id = p.passage_id
WHERE j.jurisdiction_id IN (:jurisdictions)
  AND (
    EXISTS (/* present category tag in requested categories */)
    OR /* category annotation is uncertain/incomplete */
  )
  AND (
    EXISTS (/* present topic tag in requested topics or descendants */)
    OR /* topic annotation is uncertain/incomplete */
  );
-- Union scope-uncertain fallback material; then expand dependency links.
```

This is illustrative SQL, not an implementation. Temporal filtering must retain uncertain intervals and treat future/pending material according to the requested view. Fact-based exclusion is permitted only when a supported evaluator proves non-applicability; missing facts do not justify exclusion.

If a narrow result lacks sufficient context, broaden to the category, enclosing section or document. Never treat “no rows” as proof that no law exists. If a new question falls outside all six categories, return an out-of-scope result and source-expansion suggestion.

### 12.2 Context limits

Do not use a top-k cutoff that can discard an exception. Send complete dependency bundles. If they exceed the context budget, evaluate bundles separately with evidence IDs, then combine their findings and interaction checks. If complete processing is still impossible, return an explicit partial result.

The model may request another structured retrieval using the same contract. It does not need unrestricted SQL access.

## 13. Worked example: the same document, different retrievals

These are proposed retrieval expectations based on the supplied [D025 text](../../data/realpage-starter/corpus/text/D025.txt), not new legal advice or verified live-system results.

| Question | Structured filter | Expected evidence bundle |
|---|---|---|
| “How much deposit can be requested?” | CA + security_deposits + deposit.amount_limit | `(c)(1)`, its referenced `(c)(2)/(3)/(5)`, `(c)(6)`, scope and relevant definitions. Includes the exception's landlord and tenant conditions. |
| “Can they deduct for ordinary wear and tear?” | CA + security_deposits + deposit.permitted_deductions | `(e)` plus the permitted purposes in `(b)`, scope and any qualifying dependencies. No automatic need for every return-payment procedure. |
| “When must the remaining deposit be returned?” | CA + security_deposits + deposit.return | `(h)` plus its scope, applicable exceptions and referenced notice provisions. |
| “What protections apply at this address?” | Jurisdiction stack + all six categories | All relevant rule bundles, including city provisions and material requiring missing facts. No narrow topic filter. |

For the first question, the answer interpreter sees that landlord type and portfolio facts may matter. It can explain the alternatives and ask for the missing fact. It cannot replace portfolio ownership with the property's unit count.

An unseen question such as “What happens if the landlord sells the property while holding my deposit?” initially maps to the broad deposit category if no suitable topic exists. It can therefore reach D025's transfer provisions. We can subsequently add `deposit.transfer` and backfill it without changing the table structure.

That is the trade-off: new questions remain answerable from broader bundles, while narrow filtering improves as the ontology is tested. There is no finite schema that guarantees perfect narrow retrieval for every future question.

## 14. Answering and challenge exports

### 14.1 Answer contract

```python
bundle, coverage = retrieve(validated_plan)
interpretation = luna_answer(
    question, bundle, property_facts,
    require={"claim_evidence_ids", "missing_facts", "conflicts", "scope"},
)
checked = validate_citation_locations_and_supported_computations(interpretation)
return checked + coverage + dataset_revision + as_of
```

Exact source matching verifies quotation fidelity, not that the quote entails the claim. Evaluate claim support separately. Contradictory sources, incomplete history or unresolved necessary references prevent an unqualified answer.

### 14.2 Optional executable conditions

Use a small reusable predicate representation only for well-supported conditions:

```text
all / any / not
compare(fact_key, operator, typed_value)
```

Predicates need field-level evidence, unit/scope checks and validation fixtures before they can exclude a rule. An uncompiled condition remains text for Luna or an `unknown` coverage result. It never means “does not apply.”

Date calculations and simple arithmetic can be deterministic even when the surrounding legal interpretation is model-assisted.

### 14.3 Export adapter

| Internal material | Challenge output |
|---|---|
| Rule summary, canonical citation, one primary exact supporting span, source provenance | `rules.json`, validated against the supplied JSON Schema. |
| Per-address rule assessment | `lookups.json`: applies, unknown, superseded, not_yet_effective or pending. Omit a rule only when non-applicability is established. |
| Before/after or hypothetical assessments | `changes.json`: affected addresses and conflict flags. |

Keep all supporting spans internally even when the export accepts only one. Do not substitute a starter quote for a supplemental rule it does not support. Supplemental-source eligibility for scoring remains an organizer question; retain both corpus origins so exports can be scoped correctly.

Rule status is derived for the export date. A failed measure remains an extraction/history record, but does not create a current-law protection. Use stable team IDs and an explicit adapter mapping for test identifiers; test expectations must not supply extracted legal facts.

Luna-based coverage may vary across runs. Pin model/prompt/input versions and cache assessments for reproducible exports. Caching does not convert those judgments into independently verified deterministic logic.

## 15. Change tracking and incremental ingestion

```python
def ingest_update(source):
    new_capture = capture(source)
    if new_capture.raw_hash == last_capture.raw_hash:
        record_check_without_reextracting()
        return

    staged = run_ingestion_pipeline(new_capture)
    changed_nodes = compare_by_canonical_identity_and_content(staged, previous)
    affected = reverse_dependencies(changed_nodes)
    invalidate_derived_rules_links_and_answers(affected)
    publish_validated_revision(staged)
```

If a definition changes, invalidate dependent rules even if their own wording is unchanged. An unresolved reference is a watch item: when its target arrives, resolve it and invalidate dependent bundles. Ontology, parser and prompt changes also invalidate the corresponding annotations.

A content change is not necessarily a law change. Formatting-only changes may leave legal content unchanged. A new law event needs supported status/effective-date evidence.

```python
before = evaluate_same_rule_family(addresses, as_of_before, pinned_revision)
after  = evaluate_same_rule_family(addresses, as_of_after, pinned_revision)
changes = compare_legal_results(before, after)
# Historical assessments must use supported historical versions.
```

### Mapping to supplied change tests

These are **starter-pack test expectations**, not independently established legal findings. Extraction must obtain its facts from source documents.

| Test | Pipeline mechanism | Expected check |
|---|---|---|
| T1: CA AB 325 / SB 763 | Enactment and effective-date assertions; state jurisdiction filter | Not yet effective on 2025-12-31; applies on 2026-01-02 for CA addresses. |
| T2: Hoboken / Jersey City | Resolved legal-city IDs and separate local rule bundles | Each city's rule matches its own addresses; neither matches Newark. |
| T3: NJ FAIR Act | Future effective date plus evidenced/candidate interaction links | Future status on 2026-10-01; applies on 2027-07-02; JC/Hoboken conflict flags preserved. |
| T4: MA pending bills | Proposal status and an explicit hypothetical mode | Pending today; hypothetical affected set covers MA addresses. |
| T5: failed MA ballot measure | Failed status/history evidence | No current rent cap created by that measure; affected set empty. |
| T6: later organizer drop | Same ingestion path and reference/date checks | Evaluate the supplied case when released; its source and test specification are currently absent. |

For hypothetical tests, keep assumed enactment separate from recorded history. A pending bill never becomes actual law because a scenario was evaluated.

## 16. Validation and acceptance criteria

Do not measure quality only by the percentage of schema-valid JSON. The important failure is losing a condition while producing plausible output.

| Area | Acceptance criterion |
|---|---|
| Source inventory | Every manifest item has a capture/availability state; missing text and metadata disagreements are reported. |
| Structural accounting | Every substantive source region is represented or explicitly flagged; no unexplained dropped paragraphs. |
| Evidence integrity | Every published span resolves exactly in its immutable text; no fabricated or stitched quotations. |
| References | D025 `(c)(1)` resolves to all three referenced paragraphs in the correct scope; missing and ambiguous targets remain visible. |
| Context completeness | Fixtures check that governing scope, exceptions and definitions accompany their seed passages. |
| Retrieval recall | A small independently reviewed set names required passages per question; all required evidence must be returned or the result must be marked incomplete. |
| Narrowing utility | Track returned tokens/passages alongside recall; a narrow answer is valuable only if it retains necessary qualifications. |
| Temporal behavior | Supplied T1–T5 expectations pass; historical gaps and event-date conditions are tested separately. |
| Unknown facts | Missing portfolio, certificate date or owner type is never silently inferred from a different fact. |
| Incremental behavior | Changing a shared definition invalidates dependent answers; unchanged captures reuse extraction. |
| Exports | All supplied address IDs are accounted for; rule JSON validates; cited sources and spans remain traceable. |

Include adversarial fixtures: duplicate paragraph numbers, a condition spanning a page break, a definition with no explicit citation, ambiguous jurisdiction, two competing effective dates, a future law, partial OCR, missing reference targets, and a question outside the ontology.

Hold out some questions/documents while tuning. Keep test expected answers out of extraction prompts. No official score or accuracy claim is available until the organizer's scoring materials are provided and run.

Measure per stage: wall time, model calls, cost, candidate omissions, fallback rate, unresolved links, evidence recall and context size. “Fast on-the-spot indexing” is a target to benchmark, not an established result.

## 17. Proposed implementation sequence after discussion

| Stage | Deliverable | Gate before expanding |
|---|---|---|
| 1. One-document vertical slice | D025 → hierarchy → tags → links → three focused queries with exact citations | Correct references and complete exception bundles. |
| 2. Corpus baseline | All available starter text indexed; coarse fallbacks and coverage inventory | No silent source loss; schema-valid extraction outputs. |
| 3. Address integration | Jurisdiction resolution and typed fact registry | Postal-city traps and missing-fact fixtures pass. |
| 4. Targeted expansion | Highest-priority missing primary sources and dependencies | Supplemental provenance and versioning remain distinct. |
| 5. Time and interactions | T1–T5, conflict flags, incremental ingestion | Same retrieval/evaluation contracts serve all views. |
| 6. Export and live demonstration | Reproducible outputs and a new-document rehearsal | Report measured latency, gaps and limitations. |

Possible future self-improvement: collect validation failures, propose parser/tag/prompt changes on a development set, and promote only after held-out regression checks. Do not let the live pipeline alter its ontology or legal decisions without a versioned validation step.

## 18. Decisions to discuss

1. **Coverage evaluation:** use Luna for complex conditions, or prioritize compiling a restricted subset for challenge scoring? Recommendation: supported simple predicates plus Luna/unknown for the rest; acknowledge the difference from the current spec.
2. **First vertical slice:** use D025's deposit rules to prove structure, references and focused retrieval before scaling? Recommendation: yes.
3. **Ontology size:** begin with six categories and a small reviewed topic tree, broadening for unfamiliar questions? Recommendation: yes; avoid hundreds of speculative labels.
4. **Supplemental scope:** complete linked primary law before introducing new jurisdictions or legal domains? Recommendation: yes.
5. **Performance goal:** benchmark end-to-end time and Jev fallback rates on the vertical slice before promising a latency budget? Recommendation: yes.

## Reference material

- [Starter participant guide](../../data/realpage-starter/README.md), especially public sources, dates, address gaps and required outputs.
- [Source manifest](../../data/realpage-starter/corpus/corpus_manifest.csv) and [links without supplied text](../../data/realpage-starter/corpus/links_only.csv).
- [Required rule schema](../../data/realpage-starter/schema/rule_record.schema.json) and [change tests](../../data/realpage-starter/dev/change_tests.json).
- [D025: supplied Civil Code §1950.5 text](../../data/realpage-starter/corpus/text/D025.txt), used for the structural example.
- [Existing implementation spec](spec.md) and [accepted structured-retrieval decision](../../docs/decisions/0002-rules-as-filtered-data-not-rag.md), retained as existing decisions pending discussion.
