# HomeRule: rule-centric build plan

Status: **proposed for execution, v2**. Written Sat 03.10.2026, ~23:00 CEST; v2 ~23:45 CEST after review (§11 lists what changed).
Replaces the passage-first architecture in [queryable-corpus-pipeline-proposal.md](queryable-corpus-pipeline-proposal.md) and keeps its rules for evidence, time and uncertainty. Consistent with decisions [0002](../../docs/decisions/0002-rules-as-filtered-data-not-rag.md) and [0003](../../docs/decisions/0003-conflicts-flagged-not-decided.md). Refines [spec.md](spec.md) M1–M7 where the two differ (§10).

## 1. The idea in one paragraph

The **obligation** is what the system knows. An obligation is one duty or limit of one provision: "California deposit limit, Civ. Code §1950.5(c)(1)", which is separate from "§1950.5(e) deductions" and "§1950.5(g) return deadline". It has dated *versions*. Every field of a version is backed by an exact quote, tied to a fixed version of its source document. It has two kinds of condition:
- **Coverage** at the address level, which decides the lookup result.
- **Tenancy conditions and value branches**, which can depend on tenant facts and change what applies or how much, without blocking the address result.

Interactions between rules are conditions too. Example: "this state cap does not apply **where** a local ordinance restricts increases to less" (§1947.12(d)(3)). The model reads law and writes records once. Code decides applicability every time, from verified records and stated assumptions.

```text
corpus ──► document versions + sections ──► extraction (whole document) ──► verification ──► obligation graph
                 ▲                                                                              │
                 └──── dependency index ◄── invalidation on new / changed text ◄────────────────┤
addresses ──► jurisdiction + facts + named inferences ────────────────────────────────────►  evaluator ──► assessments
                                                         scenarios (as-of, hypothetical) ──►   │    ──► diffs
                                                                                               ▼
                                                                                     exports · web · MCP
```

## 2. What the corpus tells us (verified 03.10)

| Finding | Evidence | Design consequence |
|---|---|---|
| 54 texts, 690 KB. Median 6 KB, 52 under 40 KB; largest D067 (160 KB) and D049 (56 KB) | `wc` on `corpus/text` | Extract from **whole documents**. Split only D067 and D049, at their headings. A completeness check per section replaces chunk-level accounting (§5.4). |
| One citation holds several obligations: §1950.5 covers the deposit limit (c)(1), permitted uses (b), deductions (e) and the return deadline (g) | D025 lines 121–198 | Identity is an obligation ID anchored to a provision path, not jurisdiction + category + citation (§3). |
| §1947.12 has three dates: "Effective January 1, 2024. Operative April 1, 2024, by its own provisions. Repealed as of January 1, 2030" | D024 lines 200–202 | Separate event kinds: enacted, effective, operative and repealed (sunset). A version starts governing on its operative date when the text gives one. |
| Dates inside one section: §1950.5(c)(4) applies "On or after April 1, 2025"; (c)(6) excludes "security collected or demanded … before July 1, 2024" | D025 lines 129, 140 | Two kinds of date: when a provision starts (compared with the as-of date) and the date of an event (a tenancy fact). |
| The small-landlord exception has an exception: (c)(5)(A) allows two months when the landlord is a natural person (or similar) owning ≤2 properties with ≤4 units; (c)(5)(B) says "(A) shall not apply if the prospective tenant is a service member" | D025 lines 131–135 | Value branches over landlord and tenant facts. Checking which way each exception runs is part of verification (§5.5). |
| The state rent cap yields through an *exemption*: (d)(3) exempts housing under local control "that restricts annual increases … to an amount less than" (a). (d)(4) exempts a certificate of occupancy "within the previous 15 years" | D024 lines 123–128 | The yield is an `exempt_if` with `rule_applies(…)` and a stricter-than comparison. The rolling age is measured from the **certificate date**, not the year built. |
| Several key rules exist only as agency summaries: SF Rent Ordinance (D079, D080, D083), SF §37.10C (D081, 1.1 KB), LA RSO (LAHD pages) | manifest URLs | Evidence tier on every span, with lower confidence and a label for summaries. |
| NJ statutes 2A:18-61.1 and 46:8-21.2 are link-only, but the official DCA guide D067 quotes them | D067 lines 654, 975 | Extract statute-level obligations from an official secondary text and record where the quote comes from. |
| **No supplied text for Hoboken ch. 158, Jersey City §218-12 or any Newark law** (publisher links marked "check-terms", news links) | manifest; `grep` | The ordinances behind T2 and T3 can't be quoted from the corpus. Decision A in §8. |
| FAIR Act §6b: "A municipality shall be prohibited from enacting an ordinance that conflicts with this act" | D069 lines 199–202 | Forward-looking; existing ordinances aren't explicitly voided → `possible_conflict`, backed by this quote. |
| Guide: year built ≠ certificate of occupancy; "a building in the cutoff year should be unknown" | participant README §4.1 | Two separate facts. A stated inference (§4.3) links them and is listed on every result that uses it. |
| Guide §9: two effective dates for Berkeley ch. 13.63, two for LA RSO; no official 2026 figure for CA's screening-fee cap | participant README §9 | Conflicting events are kept side by side and shown as a conflict. |
| Schema: `level` ∈ {state, city}; `status` ∈ {in_force, not_yet_effective, pending, failed}; one `effective_date` | `rule_record.schema.json` | Internal dates are richer. The adapter exports the date the version starts governing (§5.10). |

## 3. Data model

One SQLite file is the working store. Committed JSON files are the published outputs.

```text
Jurisdiction    id ("US-CA", "US-CA-SF"), level (state|county|city), parent_id, names[] (aliases),
                kind (incorporated|city_county|unincorporated)

Document        doc_id (D0xx | S0xx | X0xx test-only), url, source_type, evidence_tier, corpus_origin
DocumentVersion version_id = sha256(text), doc_id, retrieved_at, text_path (immutable copy), supersedes?
                Spans, sections and extraction runs reference version_id, never doc_id alone.

Section         section_id, version_id, path ("c/5/A/ii"), heading?, start, end,
                completeness: cited | non_rule(reason) | gap

Span            span_id, version_id, start, end (Unicode code points, end-exclusive), text (from the file),
                locate_method (exact|normalised), section_id

Obligation      obligation_id = "<jurisdiction>/<code>-<section>/<provision path>#<slug>"
                e.g. "US-CA/CIV-1950.5/c/1#deposit_limit", "US-CA/CIV-1950.5/g#return_deadline"
                category, canonical_citation, title

Version         version_id, obligation_id, kind (new_law|amendment|reenactment), amends_version_id?,
                requirement, plain_summary,
                coverage { applies_if, exempt_if }       address- and landlord-level AST → lookup result
                tenancy_conditions AST?                  tenant/tenancy facts; evaluated when supplied
                value { default, branches[{when AST, value, span_ids}] }
                field_evidence {field → [span_id]}, field_support {field → supported|partial|unsupported},
                node_evidence {ast_node_id → [span_id]}, node_checks {ast_node_id → verdicts},
                extraction_run_id, confidence (computed)

LegalEvent      event_id, subject (version | obligation | document), scope (act|section|provision path),
                kind (introduced|enacted|effective|operative|repealed|failed|struck),
                date, precision (day|month|year), span_ids[], conflicts_with[]

Interaction     from_obligation, to_obligation | to_category,
                kind (exempts_where|preempts|possible_conflict|coexists|amends),
                when AST, span_ids[], origin (text|test_fixture)

Definition      term, version_id, section_id, span_ids[]   (used by conditions; tracked as a dependency)

Absence         jurisdiction_id, category, kind (barred_by_law|measure_failed|not_in_corpus), span_ids[]

Property        address_id, raw columns, legal {state, county, city, source, confidence}
Fact            address_id, key, value (interval|enum|unknown), provenance (assessor|derived|user), derivation
Inference       inference_id, premises (facts), conclusion (fact interval), source (e.g. guide §4.1), version

DependsOn       record_id → (kind: version|section|definition|obligation_ref|fact_key|inference, target)

Assessment      address_id, version_id, as_of, scenario_id,
                result (applies|unknown|superseded|not_yet_effective|pending),
                value (determined | conditional branches), tenancy_conditions (open),
                governed_by, conflict_with[], deciding_facts[], assumptions[] (inference ids),
                flags[] (relationship_unresolved|history_boundary|summary_only|low_support|conflicting_dates)

AuditEvent      ts, stage, run_id, version_id, model, prompt_hash, input_hash, output_ref, verdicts
```

Notes:
- **Consolidation key** = jurisdiction + canonical citation + provision path. Candidates from different documents merge only when their provision paths match, or one contains the other with the same slug. Same citation with different paths stays separate. Overlapping paths with different slugs go to review.
- **Fixed evidence.** A changed source text is a new `DocumentVersion`. Old spans stay valid against the old version, and their dependents are invalidated (§5.9). Git publishes outputs. The content hash pins evidence.
- `origin: test_fixture` lets hand-written precedence knowledge check extraction without feeding into it (decision 0003).

## 4. Conditions, dates and assumptions

### 4.1 Condition language

```text
Node := all[Node…] | any[Node…] | not Node | true | false
      | fact(key, op, value)          op ∈ eq ne lt le gt ge in
      | date_fact(key, op, date)      building.certificate_date le 1979-06-13
      | age(key, op, years)           measured from as_of
      | as_of(op, date)               a provision's own start, e.g. (c)(4) ge 2025-04-01
      | rule_applies(obligation_id)   same address, date and scenario
      | value_lt(obligation_id, …)    stricter-than comparison of key values; unknown if not comparable
      | unparsed(text, span_id)       always unknown
```

- Each fact key has a **scope**: `building`, `landlord`, `address`, `tenant` or `tenancy`.
  - `coverage` may use building, landlord and address facts. It decides the lookup result.
  - `tenancy_conditions` and value branches may use any scope. Address results never wait on tenant facts. When a renter supplies them (web, MCP), the same evaluator resolves them.
  - Example, §1950.5 at an SF parcel with 20 units: coverage → applies. Value → one month, because (c)(5)(A)(ii) is false through the portfolio inference (§4.3), so (c)(5)(B) is never reached. At a 3-unit parcel with an unknown owner, the value is "one month; two months if the landlord meets (c)(5)(A) and the tenant is not a service member". The result is still `applies`.
  - §1946.2 just cause depends on how long the tenancy has run. It stays `applies` at the address, with an open tenancy condition.
- **Three-valued logic over intervals.**
- **Deciding facts:** a missing fact is listed only if some value of it changes the result or value. The evaluator tests it at the thresholds that appear in the conditions. This drives the "one question".

### 4.2 Time

- **Event kinds:**
  - `enacted` (signed or chaptered)
  - `effective` (the act takes effect)
  - `operative` (a provision starts to govern)
  - `repealed` (including sunsets)
  - `failed` / `struck`
  - `introduced` (pending)
- A version **governs from** its operative date if one is evidenced, else its effective date. It **governs until** its repeal date or the start of the next version. Events can apply to the act, a section or one provision path.
- Dates of tenancy events, such as when a deposit was collected (§1950.5(c)(6)), are tenancy facts, never compared with the as-of date.
- **Resolving the status** of an obligation at an as-of date:

| Situation | Result |
|---|---|
| A version governs at the as-of date | Evaluate that version. A later version that exists is an **upcoming change** (shown under "what changes next"; exported per decision D). |
| No version governs yet, and the first one is `new_law` | `not_yet_effective` |
| No version governs yet, and the first one is an `amendment` (an earlier law governs, but its text isn't in the corpus) | `unknown` with the flag `history_boundary`: "an earlier version governs; its text is not in the corpus". Never `not_yet_effective`, never projected backwards. |
| Repealed or sunset before the as-of date | Not listed; history only |
| Pending | `pending`; it enters a scenario only as a hypothetical |
| Failed or struck | Never assessed; recorded as history (T5) |
| Conflicting dates | Evaluated under each date. If the results differ: `unknown` with `conflicting_dates` |

### 4.3 Assumption policy

Nothing is assumed silently. Every inference is a named, versioned `Inference` record, and every assessment lists the ones it used.

| Inference | Premises | Conclusion | Never |
|---|---|---|---|
| `co_from_year_built` (source: guide §4.1) | `building.year_built` = Y | `building.certificate_date` ∈ [Y-01-01, Y-12-31], so a cutoff inside year Y is unknown | Year built isn't stored as the certificate date. The fact store keeps both, and the result names the inference. |
| `portfolio_lower_bound` | The parcel's use class is a whole-building rental parcel (not a condo, co-op or mixed parcel) **and** the landlord is the parcel owner (assumed for whole-building rental parcels, stated as such) | `landlord.portfolio_units ≥ building.units.min` | Without both premises the bound isn't used and the value is unknown. |
| `units_from_use_code` | A use-description pattern from the dataset's code table ("APT 7-30 UNITS", "Five or more apartments", "-20U-") | `building.units` interval | Disagreeing sources → unknown plus a conflict flag. |

**Interactions are conservative.** When two obligations of the same category apply at different levels and no interaction record links them, the result is **not** "coexists". Both are reported as `applies`, with the flag `relationship_unresolved`, and the explanation says the texts don't state how they interact. `superseded` needs an evidenced `exempts_where` or `preempts`. `coexists` needs evidence too (a savings clause, for example). Reporting both hides nothing. A wrong `superseded` hides a protection and costs double in scoring.

## 5. Pipeline

Each stage is a command that writes files, appends to the audit log, and has a test. A stage that something else depends on must pass its test first.

### 5.1 Model roles: Jev first for bounded decisions, Luna for open text

| Decision | Candidates come from | Preferred | Falls back to Luna when |
|---|---|---|---|
| Category of an obligation | the six schema categories | Jev | uncertain, or several categories fit |
| Event kind and date for a dated phrase | dates and phrases found in the text by code | Jev | none of the candidates fits, or the phrase is ambiguous |
| Version status (pending / enacted / failed / struck) | bill-history lines, chapter notes | Jev | conflicting candidates |
| Interaction kind for a candidate pair | pairs in the same category and jurisdiction stack | Jev | the text is indirect (e.g. "stricter than" without a citation) |
| Comparison operator for a boundary phrase | the phrase table (§5.5) | code, then Jev | the phrase isn't in the table |
| Section completeness class | rule content, definition, procedure, findings, history note, boilerplate | Jev | the class is rule content but nothing cites it |
| Requirement, plain summary, condition AST, quotes, value branches | — | Luna | — |
| Repair and verification of ambiguous cases | — | Luna | — |

- Code generates every candidate (dates, numbers, citations, provision paths, phrases). Jev chooses among them, or answers none / uncertain.
- On the slice, routing thresholds come from measured agreement with the fixtures for each decision type. Jev is preferred only where it meets that threshold. Model confidence is a routing signal, not evidence.
- Pin both model IDs and prompt hashes in the audit log.

### 5.2 Fixtures first (`eval/fixtures/`)

Expected outcomes come from the brief, the guide and `change_tests.json`, plus synthetic test-only properties and documents (`X0xx`, never exported). They are written before extraction. A prompt lint makes sure no fixture value appears in any prompt. §6 lists the slice fixtures.

### 5.3 Ingest (`pipeline/ingest.py`)

- Manifest and text → `Document` + `DocumentVersion` (a fixed copy, sha256).
- Parse the `SOURCE:` / `RETRIEVED:` header. Assign the evidence tier.
- Parse sections from numbering and headings ("(c) (1)", "§ 37.9", "6. a."), with their parent paths.
- Write `out/inventory.json`: documents, tiers, sections and known gaps per jurisdiction and category.
- **Test:** every manifest row is accounted for; the copies' hashes match; the section paths of D025 and D024 match their visible structure.

### 5.4 Extract and account for completeness (`pipeline/extract.py`)

1. **Pass 1 (Luna, whole document):**
   - obligations with provision path and slug
   - requirement, coverage AST, tenancy conditions, value branches
   - an exact quote for every field and every AST node
   - definitions the conditions use
2. **Pass 2 (Jev with code candidates, Luna as fallback):**
   - events with scope and precision
   - interactions
   - absences
   - bounded fields from §5.1
3. **Quote location:** the model returns quotes as text. Code locates them in the document version, first exactly, then with normalised whitespace and quote characters mapped back to the original. A quote that can't be found is rejected. A quote that spans non-adjacent text is rejected. A field may cite several spans.
4. **Completeness:**
   - every section is either cited by a stored span or classified as non-rule (with a reason)
   - an uncited section classified as rule content gets a targeted Luna pass with its parent context
   - one still uncovered is recorded as `gap` in the inventory
- **Test:** 100% of spans are exact substrings of their version; no rule-content section is left without either a citation or a recorded gap.

### 5.5 Verify (`pipeline/verify.py`)

Syntax checks are necessary, not sufficient. Each AST node is checked against its own quoted text and the surrounding provision:

1. **Value anchoring.** Every threshold, date, count and enum value in a node is found in that node's span after normalisation ("June 13, 1979" ↔ 1979-06-13, "four" ↔ 4, "two months' rent").
2. **Boundary operators.** Phrase table:
   - "on or before" → le, "before" → lt
   - "after" → gt, "on or after" → ge
   - "no more than" / "not exceed" → le, "more than" / "in excess of" → gt
   - "within the previous N years" → age lt N

   A node whose operator contradicts its phrase is rejected. A phrase not in the table goes to Jev or Luna, and the result is recorded.
3. **Structure and direction.** Code renders the AST as nested plain language: "covered if A and (B or C), except where D; D does not apply if E". A separate Luna call compares it with the full provision text for:
   - and/or grouping
   - negation
   - whether a clause is a coverage condition, an exemption, or an exception to an exemption
   - the scope of "notwithstanding" and "subject to"

   It gives a verdict per node.
4. **Probes.** The evaluator runs the version on synthetic boundary facts: each cutoff day ±1, units 4/5, each enum value, service member yes/no. For slice obligations the outcomes are compared with the fixtures. For the rest of the corpus, a second independent extraction of the AST is compared with the first on the same probes. A disagreement goes to review and is never resolved silently.
5. **Field claim support.** For each non-AST field, a separate call checks whether its spans state the value (supported / partial / unsupported). Unsupported values are cleared.
6. **References.** Every `rule_applies` and interaction target resolves to an obligation. An unresolved one is recorded as a watched reference.
7. **Computed confidence** from node and field verdicts, evidence tier and conflicts.

- **Test:** slice probes match the fixtures 100%. Verdict rates per check are reported for the full corpus.

### 5.6 Consolidate (`pipeline/consolidate.py`)

- Merge by the consolidation key (§3). Primary text wins a field over a summary. All evidence is kept.
- Disagreeing values become conflict records.
- An amendment becomes a new version with `amends_version_id` and evidenced dates.
- **Test:** §1950.5 yields separate obligations for the deposit limit, permitted uses, deductions and return deadline, and nothing merges across them.

### 5.7 Resolve addresses (`pipeline/addresses.py`)

- Census batch geocoder (incorporated place, county). Neighbourhood aliases (Dorchester → Boston, Van Nuys → Los Angeles, San Ysidro → San Diego). The NJ ZIP column is ignored (owner mailing ZIPs).
- Facts with provenance. Inferences per §4.3, with use-code tables per dataset.
- **Test:** alias fixtures; zero NJ rows outside NJ; per-city counts match the guide.

### 5.8 Evaluate (`engine/`)

For each address, obligation, as-of date and scenario:
1. **Jurisdiction:** the obligation's jurisdiction must be in the address's stack.
2. **Status** per §4.2.
3. **Coverage** in three-valued logic: true → applies, unknown → unknown with deciding facts, false → left out.
4. **Value branches and tenancy conditions:** resolved where facts allow, otherwise left open as conditional.
5. **Interactions:**
   - an `exempts_where` / `preempts` condition that is true → `superseded`, with `governed_by`
   - a condition that is unknown → unknown, with the other rule's deciding facts
   - `possible_conflict` → `conflict_flag` on both
   - no record → `relationship_unresolved` (§4.3)
6. **Explanation** built from the record fields and the assumptions used. No free-form model text per address.

The evaluator is pure: no I/O and no model calls. Exports, web, MCP and tests all use it.

### 5.9 Changes and dependency-driven updates (`engine/scenarios.py`, `pipeline/update.py`)

- **Scenarios** are an as-of date plus optional hypothetical events. Hypothetical events never enter the store. A change is the per-address diff of assessments between two scenarios.
- **T1–T5:**
  - as-of tests (T1, T3) diff two dates
  - the boundary test (T2) lists the addresses where the rule applies
  - the pending test (T4) diffs against a hypothetical enactment
  - the negative test (T5) checks that the failed measure produces nothing
- **A new document, or a new version of one** (T6 and any future law):
  1. Ingest → new `DocumentVersion`; sections are diffed against the previous version by path and content hash.
  2. Extract and verify the new or changed sections.
  3. **Invalidate dependents** through `DependsOn`: every version that cites a changed section, uses a changed definition, refers to an affected obligation through `rule_applies` or an interaction, or is named in a new `amends` record. Each is re-verified, and re-extracted if its evidence changed.
  4. Watched references that the new text resolves are linked, and their dependents re-evaluated.
  5. Every address whose stack contains an affected jurisdiction is re-evaluated. Print the diff, the effective and operative dates, and the invalidated records.
- `make ingest DOC=…` runs this path. So does the live rerun in the demo.

### 5.10 Export (`pipeline/export.py`)

- `rules.json`: records per decision D.
  - `effective_date` = the date the exported version starts governing (the operative date where evidenced). The other dates stay internal.
  - Primary quote = the span supporting `requirement`. `source_doc_id` and `source_url` come from that span's document.
  - `overrides` and `interaction` come from the interaction records.
- `lookups.json`: all 500 addresses at 2026-10-01. Rules that don't apply are left out. `explanation` includes the assumptions and any open value conditions.
- `changes.json`: the guide's shape for T1–T6.
- `out/assessments.jsonl` keeps everything the exports drop.
- **Test:** the schema validates; 500 addresses are present; a rerun is byte-identical.

### 5.11 Interfaces

- **Address view:**
  - the jurisdiction stack, with a note when the postal city differs from the legal city
  - an as-of date picker
  - cards per category: result, value (or its conditions), quote, citation, retrieval date, assumptions used
  - "what changes next" (upcoming versions, future and pending events)
  - the **one question**: the deciding fact (address- or tenant-level) that settles the most results. It is re-evaluated in place and never stored.
- **Open question:** a classifier picks categories (falling back to all six); the evidence documents for the jurisdiction stack go into context; span IDs are validated; the answer is labelled "interpretation of the quoted law".
- **MCP:** `lookup_address`, `rules_as_of`, `whats_changing`, `deciding_facts`, `evaluate_with_facts`. Every payload carries `as_of`, the citation, the quote, the assumptions and `not_legal_advice: true`.
- "Not legal advice" and the as-of date appear everywhere.

### 5.12 Evaluation and audit (`eval/`)

`make eval` writes one report:
- fixtures and probes passed
- span integrity (100% required)
- node and field verification rates
- section completeness and gaps
- recall of the obligations named in the brief and guide
- T1–T5
- results that changed on rerun
- Jev vs Luna agreement for each decision type
- `score.py` output if released

Every model call and build is appended to `audit/*.jsonl`.

## 6. First slice: exception logic, date transitions, evidence integrity

Nothing scales out until all three test groups below are green.

**Documents:**

| Document | Purpose |
|---|---|
| D022 | AB 325 (T1) |
| D024 | §1947.12 |
| D025 | §1950.5 |
| D079, D083 | SF Rent Board pages |
| D069 | FAIR Act |
| D048 | MA G.L. c.40P |
| D046, D047 | MA S.2983 and its bill history |
| X001 | Synthetic, test-only: a fictional amendment to a deposit cap with a future operative date and a changed definition |

**Properties:** real rows from SF, Jersey City and Boston, plus synthetic test-only properties for boundaries.

### 6.1 Exception logic

| # | Case | Expected |
|---|---|---|
| E1 | §1950.5 at an SF whole-building parcel, 20 units | applies; value one month; assumption `portfolio_lower_bound` listed |
| E2 | §1950.5 at a 3-unit parcel, owner unknown | applies; value conditional: two months only if (c)(5)(A)(i) and (ii) hold and the tenant isn't a service member; deciding facts `landlord.owner_type`, `landlord.portfolio_units`, tenant `service_member` |
| E3 | E2 with owner = natural person, portfolio = 3 units, service member = yes | one month ((c)(5)(B) cancels (A)) |
| E4 | E2 at a condo parcel | the portfolio bound isn't used; stays conditional |
| E5 | §1947.12 at an SF parcel, built 1962, 20 units, SF ordinance covering it (via `co_from_year_built`) | `superseded`, governed by SF ch. 37 through (d)(3); both assumptions listed |
| E6 | SF built 1979 | SF coverage unknown (cutoff inside the year); §1947.12 unknown, with deciding fact `certificate_date` |
| E7 | §1947.12(d)(4) with the certificate within the previous 15 years at the as-of date | exempt; checked one day either side of the 15-year boundary |
| E8 | Probe each boundary phrase in the slice: "on or before June 13, 1979", "no more than four", "in excess of one month" | operator and threshold match the phrase table, and every probe matches the fixtures |
| E9 | Planted errors: flip and/or in (c)(5)(A); swap the direction of (c)(5)(B); change le to lt in the SF cutoff | each one is caught by verification (§5.5 checks 2–4) |
| E10 | A just-cause rule with an open tenancy-length condition | `applies` at the address; the condition is shown and resolves when supplied |

### 6.2 Date transitions

| # | Case | Expected |
|---|---|---|
| D1 | AB 325 (T1) | 2025-12-31 not_yet_effective, 2026-01-01 and 2026-01-02 applies, for every slice CA property |
| D2 | §1947.12 | 2024-03-31 unknown with `history_boundary` (the earlier version's text isn't in the corpus); 2024-04-01 applies (operative, not effective); 2029-12-31 applies; 2030-01-01 not listed; "what changes next" on 2026-10-01 shows the 2030 sunset |
| D3 | §1950.5(c)(4) | not part of the value before 2025-04-01; part of it from that date |
| D4 | §1950.5(c)(6) | A deposit collected 2024-06-30 → the subdivision doesn't apply (tenancy fact); a deposit after 2024-07-01 → applies; with no date given → an open tenancy condition, the address result stays `applies` |
| D5 | FAIR Act (T3) | 2026-10-01 not_yet_effective, 2027-06-30 not_yet_effective, 2027-07-01 applies; `possible_conflict` from §6b recorded (flags appear once the JC and Hoboken obligations exist, per decision A) |
| D6 | S.2983 (T4) | pending at every date; a hypothetical enactment gives an affected set of all slice MA properties; nothing written to the store |
| D7 | X001, an amendment with a future operative date | before it: the previous version applies and the upcoming change is listed; after it: the new version applies. Never `not_yet_effective` for the obligation as a whole |
| D8 | Conflicting dates (a synthetic second effective date for X001) | both kept; `conflicting_dates`; unknown only where the results differ |
| D9 | MA rent limits | `Absence: barred_by_law` from c.40P; no rent cap on Boston rows |

### 6.3 Evidence integrity and updates

| # | Case | Expected |
|---|---|---|
| V1 | All slice spans | exact substrings of their `DocumentVersion` (sha256 pinned); curly apostrophes ("month’s") and non-breaking spaces preserved |
| V2 | A planted quote stitched from (c)(1) and (c)(5) | rejected |
| V3 | A planted key value "two months" on (c)(1) | claim support says unsupported; the value is cleared |
| V4 | Section completeness for D024 and D025 | every section cited or classified non-rule; zero unexplained gaps |
| V5 | §1950.5 consolidation | the deposit limit, permitted uses, deductions and return deadline stay separate obligations |
| V6 | A new version of D079 with a changed cutoff date (test-only copy) | old spans still resolve against the old version. Dependents (SF coverage, the §1947.12 exemption through `rule_applies`) are invalidated, re-verified and re-evaluated. The diff lists the affected properties. |
| V7 | X001 arriving as a new document | runs through `make ingest`; creates a new version via `amends`; dependents re-evaluated; diff printed with the operative date |
| V8 | Rerun the slice | byte-identical outputs from the cached extraction; the audit log shows model, prompt hash and version hashes for every record |

**Measured on the slice:** Jev vs Luna agreement for each decision type in §5.1 sets the routing thresholds for the full corpus.

**Gate to scale out:** E1–E10, D1–D9 and V1–V8 are green. Every red case has a fix in the prompt, verifier or evaluator, never in the records. Then, in order:
1. all 54 documents
2. all 500 addresses
3. T1–T5
4. interfaces
5. a rehearsal of the hour-16 path on a held-back document

## 7. What we deliberately don't build

- **Topic ontology and passage tagging.** Jurisdiction + category over whole documents already gives complete, small evidence sets.
- **Dataset revision publishing.** Fixed document versions plus git commits of `out/` give pinned, reproducible revisions.
- **A general link graph.** Only interactions, condition references, definitions and section dependencies.
- **Model-decided precedence or coverage** (decisions 0002, 0003).

## 8. Decisions

| # | Decision | Recommendation |
|---|---|---|
| A | **Source gap: Hoboken ch. 158, Jersey City §218-12, Newark** | Ask on Discord whether extra sources count for citations. Meanwhile support `corpus_origin: supplemental`: read the three ecode360 sections by hand within their terms, store them as S-documents with provenance, and label their records. Never create an obligation without a quote found in a stored document version. |
| B | Engine language | Python for pipeline and evaluator; the web calls a small API. One evaluator. |
| C | Record this plan as decision 0004 | Yes, once the slice gate passes. |
| D | `rules.json` granularity, given several obligations per citation and upcoming versions | Default: one record per obligation that carries a key value or a distinct requirement. Upcoming amendments become a second record with `not_yet_effective`. Revisit if `score.py` or the dev key is released. |
| E | Jev routing thresholds | Set from the slice measurements (§6); Jev is preferred wherever it meets them. |

## 9. Ask on Discord

1. Do quotes from sources outside the supplied corpus count for citations, and may we capture the Hoboken and Jersey City ordinance text?
2. Will `score.py` and the dev key be released?
3. In `changes.json`, do addresses with an unknown result count as affected?
4. Does the key expect one record per citation or one per obligation (e.g. §1950.5 limit vs return deadline)?

## 10. Differences from spec.md

| spec.md | This plan | Why |
|---|---|---|
| Fuzzy span snapping (rapidfuzz ≥90) | Exact or normalised against a fixed document version; otherwise unsupported | A fuzzy match can point at a different sentence |
| One record per jurisdiction × category × cited section | One per obligation, anchored to its provision path | One section can hold several obligations |
| One flat compiled record with `effective.from` | Versions + events (effective, operative, repealed) + history boundaries | Amendments, operative dates and sunsets |
| Tenant conditions as card notes | Tenancy conditions and value branches, evaluated when supplied | Service-member status changes the deposit value |
| `units` interval used directly as the owner's portfolio | A named inference with premises (whole-building parcel, owner = landlord) | The bound only holds if the landlord owns the units |
| Year built as a "built" interval used for certificate cutoffs | Separate facts plus the named inference `co_from_year_built` | The guide distinguishes them |
| No extracted clause → both rules apply as coexisting | Both reported as applying, plus `relationship_unresolved` | Missing evidence doesn't establish coexistence |
| AST schema validation | Anchoring, operator phrases, structure back-translation, probes | Syntax doesn't prove meaning |
| Rerun extraction of the new document | Dependency-driven invalidation and re-evaluation | Amendments and definitions change other rules |
| Strong Claude model for extraction | Jev for bounded decisions where measured good, Luna for open text | Team preference; measured on the slice |

## 11. Changes in v2 (from review)

1. **Obligation identity:** an obligation ID anchored to the provision path; the consolidation key includes the path (§3, V5).
2. **Dates:** effective, operative and repeal events; provision-level and tenancy-event dates; "new law not yet effective" vs "amendment not yet operative, earlier version governs" (§4.2, D2–D7).
3. **Tenant conditions:** evaluated as tenancy conditions and value branches, not display-only; address coverage stays decidable (§4.1, E2–E4, E10, D4).
4. **Evidence versions:** spans pin a fixed `DocumentVersion` by content hash (§3, V1, V6).
5. **Condition verification:** value anchoring, operator phrases, structure back-translation, boundary probes, a second-extraction comparison (§5.5, E8, E9).
6. **Conservative assumptions:**
   - missing interaction evidence → `relationship_unresolved`, not coexistence
   - the portfolio bound needs stated premises
   - year built and certificate date stay separate (§4.3, E4–E6)
7. **Completeness and updates:** a section-level completeness check; dependency-driven invalidation for amendments and definitions (§5.4, §5.9, V4, V6, V7).
8. **Jev and Luna:** Jev preferred for bounded decisions where it measures well, Luna for open text and ambiguous cases (§5.1).
