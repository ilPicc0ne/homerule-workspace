> **Superseded on 04.10.2026** by `notes/plan/prd.md` (scope, owners) and `docs/ARCHITECTURE.md` (how). Kept for history.

# HomeRule build spec (c2 RealPage, Rental Housing Law Navigator)

Written Sat 03.10.2026, 21:15 CEST. Freeze Sun 12:00, submission Sun 15:00.

> **Update Sat 03.10. ~22:00: the participant pack has no `score.py` and no dev answer key.** Dimitar imported the full pack (`participant-final-no-hour16`, 65 files); its provenance note says it excludes the hour-16 ordinance, `score.py` and the dev key. Consequences: M0 calibrates against `schema/`, `submission_templates/` and the participant PDF instead of `score.py`; the brief-derived assertion suite (T1–T6 from `change_tests.json`, the SF example, the named rules) becomes our only self-test; the S2a contrast runs on that suite, not on `score.py`. Mentor question 0, before all others: will `score.py` and the dev key be released, and when?

- **Sources:** the brief PDF (cited as p.N), which wins on rules. The concept `funnel/deepdives/c2-winning-concept.md` wins on product. Starter-pack files are cited as SP:file.
- **Owners:** S = Silvan, D = Dimitar.
- **Tags:** [verified p.N / SP:file] · [assumed] · [unknown].
- **Point estimates:** every gain in points is an [assumed] estimate.

## 0. Starter pack: what was reached, what it changes

**Reached** (read-only through the Drive connector; folder "03 RealPage - Codebase and Data" › `participant-final-no-hour16 3`):
- `dev/change_tests.json`
- `schema/sample_rule_record.json`
- `data/sample_addresses.csv`
- `corpus/text/D085.txt`

**Not reachable:** the participant guide, the rule JSON Schema, score.py, the dev answer key, the corpus manifest and the other 86 texts. The connector only lists files someone has opened in a browser. Everything that depends on them is [unknown] and sits behind the adapters calibrated in M0.

| Finding | Evidence | Consequence |
|---|---|---|
| Scored as-of date is 2026-10-01 | SP:change_tests T2–T5 `as_of`; p.3 mock | Default `AS_OF=2026-10-01`, still a parameter |
| The struck ballot question is a key record: `MA-RENT-P1`, "IP 25-21 recorded as failed" | SP:change_tests T5 | Emit it with the failed/struck status; never in lookups or affected sets (**Deviation 1**) |
| The pending bills are key records `MA-ALG-P1/P2` | SP:change_tests T4 | Extract them as pending; `pending` for every MA address |
| Key IDs follow `<JUR>-<CAT>-<NN or Pn>` (CA-ALG-01, HOB-ALG-01, JC-ALG-01, NJ-ALG-01) | SP:change_tests | Mirror the pattern in `team_rule_id`. Matching stays on jurisdiction/category/citation [verified p.6] |
| Result token `not_yet_effective` | SP:change_tests T1/T3 | Tokens: `applies`, `unknown`, `superseded`, `not_yet_effective`, `pending`. The spelling of the four others is [assumed] |
| Rule record has 20 fields | SP:sample_rule_record | Details in the next row |
| — fields | | `team_rule_id`, `jurisdiction` ("NJ"), `level` ("state"), `category` ("security_deposits"), `status` ("in_force"), `title`, `requirement`, `key_value`, `coverage_conditions` (free text), `exemptions` (free text), `overrides` [], `interaction`, `effective_date`, `citation`, `source_doc_id` ("D0xx"), `source_url`, `quoted_span`, `confidence`, `conflict_flag`, `conflict_note` |
| — consequences | | Coverage is free text, so a predicate sidecar is needed (concept right). Precedence comes from the extracted `overrides`/`interaction` (**Deviation 2**). `penalty` is listed on p.2 but missing from the sample: emit it only if the Schema has it |
| Each document starts with `SOURCE: <url>` / `RETRIEVED: <UTC>`. The text holds NBSP and curly quotes | SP:D085 | Parse the retrieval date from the header. Copy spans as raw substrings |
| 37 Boston rows sit under 9 neighbourhood names (Dorchester 13, Roxbury 7, East Boston 6, Brighton 4, Allston 3, 1 each for South Boston, Jamaica Plain, Hyde Park, Mattapan). One "San Ysidro" row is the City of San Diego | SP:CSV | 38/500 visible postal ≠ legal rows before geocoding LA; neighbourhood table plus Census (M4) |
| NJ ZIPs: about 83/140 don't belong to the city (a Newark row has 11219, Brooklyn), so they are likely owner mailing ZIPs. SF and Cambridge rows have no ZIP (130 rows) | SP:CSV | Never send the CSV ZIP to the geocoder for NJ (**Deviation 3**) |
| Missing facts: year_built 212/500, units 242/500 | SP:CSV; matches p.4 | Per city in the next row |
| — per city | | Berkeley 40/40 have neither. San Diego 50/50 have no year. Newark 48 have no year, 50 no units. Jersey City 22 no year, 50 no units. Hoboken 36 no year, 39 no units. Boston 60/60 have no units. Unknown dominates local rent control in Berkeley, San Diego and NJ |
| Unit classes hide in use codes ("A5 Apartment 5 to 14 Units", "APT 7-30 UNITS", "(5+ units)", "4-8-UNIT-APT", NJ "…-20U-…" parsable in 100/140) | SP:CSV | Derive unit intervals. They settle the ≤4-unit small-landlord exceptions without owner data. Gated by a flag (**Deviation 3**) |
| Conflicting facts: A0227 has units=2 but the description says 93U | SP:CSV | Conflict → unknown plus a review flag |
| T6 is not in the pack (folder name "no-hour16") | SP:folder | The T6 runner reads its spec from the hour-16 drop |

## 1. Scoring model

### 1.1 The seven metrics

| Metric · pts | How it is measured | What loses points | Our design response | Acceptance test | Owner · fed by |
|---|---|---|---|---|---|
| **Extraction · 25 auto** | Team rules matched to the held-out key (58 rules + 19 "no rule") by jurisdiction, category and citation, then field accuracy on date, status, key value and citation [verified p.3, p.6]. Partial credit and whether extra records cost [unknown, guide] | Citation in the wrong style, so no match and the fields are lost too. Merged or split records. Pending/struck stored as in force. Wrong effective date. Rules invented where the key says "no rule". Records from link-only docs | One record per jurisdiction × category × cited section. Citation canonicaliser calibrated on the dev key. Status and date taken from a quote. Link-only docs skipped. "No rule" only from a text that bars the rule | Dev ≥7/10 rules by 03:00 and ≥9/10 by 12:00. Status and date right on 100% of the brief-named rules in the suite | D · M0 M1 M2 M3 (C1) |
| **Address coverage · 20 auto** | Results on 100 held-out addresses. A missed "applies" costs 2× other errors; "unknown" earns partial credit [verified p.6]. Pair granularity and the partial-credit rule [unknown] | Postal city used as legal city. The LLM guesses coverage. Omission instead of unknown (2×). "Superseded" claimed without a yield clause. Tenant-level conditions turned into unknown | Census legal place plus neighbourhood table. Kleene logic on building facts. Unparsed → unknown, never omitted. Superseded only with an extracted yield clause. Tenant conditions become card notes | 0 missed "applies" on the 20 dev addresses. The SF 1962/20-unit card matches p.3 | S · M4 M5 M6 |
| **Citations · 15 auto** | Share of "applies" answers backed by a source and a quoted span found in the corpus [verified p.6]. Exact vs normalised match [unknown] | Paraphrased or stitched quotes. Quote from another doc. The model "cleans" NBSP or curly quotes | Span = `doc[start:end]`, raw bytes, one contiguous span. A failed span is kept and flagged | ≥98% of "applies" answers over the 500 have a span that is a substring of its source doc | D · M2 |
| **Change tracking · 15 auto** | Overlap with the expected affected sets for T1–T6, plus the conflict flags on T3 [verified p.6]. Overlap formula; whether unknowns count [unknown] | Lookups built separately, so the sets drift. T5 not empty. T4 reported in force. T1 boundary dates wrong. T2 by postal city. T6 date wrong | changes.json comes from the same engine at the test's dates. Struck → empty set; pending → `pending`; conflict from the extracted interaction | T1: 250 CA flip. T2: 40 / 50 / 0. T3: 140 + 90 flags. T4: 110 pending. T5: []. T6 in <10 min | S (T6 ingest D) · M5 M7 M9 |
| **Plain language & usability · 10 judges** | The demo [verified p.6] | Legalese. A chat box. Unknown as a dead end. No "what changes next" | Card: status in words, one-line summary, quote, citation, dates. "What changes next". The one question | A renter answer in ≤60 s on a phone | S · M10 S1 S5 C2 |
| **Responsible design · 10 judges** | Uncertainty, audit trail, guardrails [verified p.6]. Do/don't list [verified p.5] | Disclaimer missing on one view. No as-of date. Pending mixed with law. "Illegal" or "compliant" wording. No audit trail | As-of and retrieval date on every card. Disclaimer on every view and payload. Enacted vs pending separated. Low-confidence and conflict → "needs review" badge. Audit JSONL. Never compare a user's number to a cap | The p.5 checklist passes on web, print and MCP | S+D · M8 M10 S1 S3 |
| **Scalability path · 5 judges** | How the approach extends to new jurisdictions [verified p.6] | Hand tables per city. Claims without proof | New jurisdiction = docs + manifest rows; Census is national; no per-city code; precedence extracted. The hour-16 run is the proof. Cost and minutes per doc measured from the audit | README section plus the hour-16 clip | S README, D · M9 M5 C4 |

### 1.2 The six traps

| Trap | Brief | Metrics hit | Mechanism | Test |
|---|---|---|---|---|
| Unknown is valid | p.2, p.5, p.6 | Coverage (omission costs 2×), Responsible | Kleene logic; `missing_facts` | Berkeley row: rent increase = `unknown`, missing `year_built` |
| Mailing city ≠ legal city | p.4 ("teams resolve the legal jurisdiction") | Coverage, Change T2/T6 | Census incorporated place; neighbourhood table; NJ ZIP ignored | Dorchester → Boston · San Ysidro → San Diego · Newark row with ZIP 11219 → Newark |
| Enacted ≠ in effect | p.4 T1/T3/T6 | Change, Coverage, Extraction (date) | `effective_from` compared with as-of | T1 2025-12-31 vs 2026-01-02; T3 2026-10-01 vs 2027-07-02 |
| Pending ≠ law | p.4 T4, p.5 | Change, Coverage, Extraction (status) | Pending is never `applies` | All 110 MA addresses: S.2983 and H.5222 `pending` |
| Struck ≠ law | p.4 T5 | Change, Coverage | Failed status, excluded from lookups and sets | T5 = []; no MA rent-cap result |
| Stricter rule wins, say which governs | p.2 Module B, p.3 SF example | Coverage (superseded), Extraction (`overrides`) | Extracted interaction; `governed_by` | SF 1962/20 units: Civ. §1947.12 `superseded`, governed by SF ch. 37 |

### 1.3 Event criteria and submission

Event-wide criteria [verified, kickoff slide 15 in `funnel/challenges.md`]:
- **Technical depth** → compiled engine (AST, Kleene logic, intervals), span snapping, eval gate, one-command hour 16, MCP.
- **Communication (incl. video)** → three videos, README, Proof page, headline.
- **Innovation** → measured contrast (S2), law as code with two front doors, the one question.

| Submission item [verified p.5–6] | Done when | Owner |
|---|---|---|
| `rules.json`, in the provided format, with citation and quoted text | Schema-valid; spans checked | D |
| `lookups.json`: all 500 addresses, each rule's result in the 5 values | 500 present; adapter matches the guide | S |
| `changes.json`: affected addresses and conflict flags per test | T1–T6 present | S |
| Team, demo and technical videos, which must include scores | Next row | S (demo, team), D (tech) |
| — what the scores must show | | The score.py dev report in full, the T1–T6 results, and the hour-16 processing, all on screen |
| GitHub repo: code, a README on how to run it, the output files | A fresh clone runs `make all` | S |
| Live demo link | Works on a phone | S |
| Rules: | Next row | Both |
| — | | Minimum viable entry is Modules A+B scored on dev. Extraction must be automated (hour 16 and a **live rerun in the demo** check this). Unknown is valid. No non-public data. "Not legal advice" on every interface |

The product repo is public and new, not `snp` (decision.md).

## 2. Points at risk and points per build hour

**Naive team vs us:**
- **Naive team** [assumed]: Extraction 10–13 · Coverage 8–11 · Citations 8–10 · Change 7–9 · judged 12–15 ≈ **45–58**.
- **Our target:** 18–21 · 15–17 · 14–15 · 13–15 · 18–22 ≈ **78–90**.

**The naive losses concentrate in four places:**
1. A citation, jurisdiction or category string that doesn't join the key. It silently breaks the joins behind three auto metrics.
2. Omission instead of unknown (2×), plus the postal city.
3. Pending or struck treated as law in T4/T5.
4. A disclaimer or as-of date missing on some view.

| Rank | Item | Metrics | Est. pts | Hours | Pts/h |
|---|---|---|---|---|---|
| 1 | **M0 format calibration** against score.py and the dev key (jurisdiction strings, category and status enums, citation style, output shapes) | Extraction, Coverage, Change | +8–15 | 0.75 | ~15 |
| 2 | **Guardrail layer**: disclaimer, as-of and retrieval date on every view and payload; review badge | Responsible, rule compliance | +2–3 | 0.25 | ~10 |
| 3 | **changes.json from the engine** (T4 pending, T5 empty, T3 flags) | Change | +6–9 | 1 | ~7 |
| 4 | **Span snapper**: raw substrings | Citations, Extraction (citation field) | +5–8 | 1.5 | ~4.5 |
| 5 | **Unknown over omission**, Kleene logic, unit intervals | Coverage | +3–5 | 1 | ~4 |
| 6 | **Hour-16 one command** | Change T6, Scalability, Communication | +3–5 | 1 | ~4 |
| 7 | **Status/as-of discipline** | Change, Coverage, Extraction (status, date) | +4–7 | 1.5 | ~3.5 |
| 8 | **Legal-city resolver** | Coverage, Change T2/T6 | +3–6 | 1.5 | ~3 |
| 9 | **Precedence from the extracted interaction** | Coverage, Extraction (`overrides`) | +2–3 | 1 | ~2.5 |
| 10 | Web cards (M10) | Plain language, Responsible | +4–6 | 2.5 | ~2 |
| 11 | S1 · S3 · S2a | Judged and event criteria | +1–3 each | 1–1.5 | ~1.5 |
| 12 | C1 overnight loop | Extraction +0–2 | 0–2 | 3+ | <0.7 |

## 3. BASE (all green by 03:00, hardened by 12:00)

**Pipeline:** `make calibrate | extract | snap | geocode | build | eval | ingest DOC= | all`. `make all` takes <15 min with cached extraction.

**Repo:** `starter/` (the pack, untouched) · `pipeline/` (Python, D) · `engine/` (TypeScript, S; D2 open) · `web/` · `contracts/` · `adapters/` · `out/` · `audit/` · `eval/`.

### M0 · Format calibration (D, 0.75 h, inside the 20:30–22:00 slot)

- **Inputs:** the guide, the rule JSON Schema, score.py (read it before running), the dev key.
- **Outputs:** `adapters/{jurisdiction,category,status,citation,lookups_shape,changes_shape}.json` and a dev baseline report.
- **How:** read the dev key's ten records. Write mapping tables, never rule content. Run score.py on an empty and a one-record submission to learn its report.
- **Acceptance:** score.py prints on our files. The adapters cover every value seen in the dev key.

### M1 · Extraction (D, 4 h)

- **Inputs:** 87 texts, the manifest, the schema.
- **Outputs:** `audit/raw/*.json` (one per model call) → `out/rules.json` plus extraction fields for `rules.compiled.json`.
- **Algorithm:**
  1. Triage each doc: law text / official summary / links-only. Links-only is skipped and logged [p.4: law-firm and news pages are links only].
  2. Extract per doc and category with structured outputs: the schema fields, plus `plain_summary`, `applies_if`/`exempt_if` (AST, §5), `tenant_conditions[]`, `interaction{type, target_category, quote}`, `effective_quote`, `status_quote`.
  3. Granularity: one record per jurisdiction × category × cited section. Duplicates across docs merge; prefer official text over a press page.
  4. Status from text: chaptered and in effect → `in_force`; enacted with a future date → enacted-not-effective; bill → `pending`; struck or failed → failed (schema token via the adapter).
  5. "No rule" findings only where a text bars the rule (e.g. MA G.L. c.40P). Their format is [unknown].
  6. Concurrency 8; document first in the prompt, so reruns hit the cache.
- **Edge cases:**
  - An amending act vs the code section (AB 12 vs Civ. §1950.5): the citation style comes from the dev key.
  - One ordinance, several categories: SF §37.9 (just cause) and §37.10C (algorithmic) become separate records.
  - Month-precision dates ("Oct 2024").
  - Santa Ana is extracted even though it has no addresses.
- **Acceptance:** 100% schema-valid; 50–90 records; dev ≥7/10 by 03:00; ≥22/27 named rules in the suite.

### M2 · Spans and citations (D, 2.5 h)

- **Snapper:** exact → normalised (NFKC, collapsed whitespace, folded quotes and dashes, with an offset map back to raw) → fuzzy (rapidfuzz ≥90 over sentence windows). It always emits the raw `doc[start:end]`.
- **Audit:** `span_match` is one of `exact`, `normalised`, `fuzzy:NN` or `failed`.
- **On failure:** one retry with candidate sentences. Then keep the record with confidence ≤0.4 and a review flag; never drop it.
- **Citation canonicaliser:** regex onto the dev key's style. An unknown style passes through unchanged and is logged.
- **Acceptance:** ≥95% exact or normalised; 100% of spans are substrings of their source doc; citation field right on ≥9/10 dev rules.

### M3 · Statuses (D in extraction, S in the engine)

- **Internal statuses:** `in_force`, `enacted_not_effective`, `pending`, `failed`, `repealed`, mapped to the schema by the adapter.
- **What reaches lookups:** failed and repealed never do. Pending gives `pending`. A future effective date gives `not_yet_effective`. In both cases only when coverage ≠ false.
- **Acceptance:** T4 and T5 pass in the suite. `MA-RENT-P1`'s twin is present in rules.json with the failed status and absent from lookups.

### M4 · Geocoding, legal city, facts (S, 1.5 h + 0.5 h)

- **Geocoding:** Census batch geocoder (geographies; layers: incorporated places, county subdivisions, counties) [p.4: no key, up to 10,000 per batch].
  - Input: street, city, state; ZIP only for CA (not SF) and MA (not Cambridge), never for NJ.
  - Results are committed.
- **Legal city:**
  1. A Census exact match wins.
  2. Else the neighbourhood table (9 Boston names → Boston; San Ysidro → San Diego).
  3. Else for NJ the CSV municipality (MOD-IV is the assessor's municipality [assumed]).
  - Record `legal_city_source` and confidence. Log every postal ≠ legal pair; the count is a demo stat.
- **Facts:**
  - `built` is an interval: year y → [y-01-01, y-12-31].
  - `units` is an interval from `units`, else from the use description (table per dataset, behind the flag `UNITS_FROM_USECODE`).
  - `place_type` is incorporated or unincorporated.
  - Conflicting facts → unknown plus a flag.
  - Owner type is absent everywhere [verified CSV] → always unknown.
- **Acceptance:** ≥95% resolved to a place; all 38 neighbourhood rows correct; zero NJ rows resolved to NY; the flag decided by the dev score (on vs off).

### M5 · Engine (S, 3 h)

For each address, rule and as-of date:
1. **Jurisdiction:** the rule's level matches the address's state, county or legal city; otherwise the rule is not listed.
2. **Status gate:** as in M3.
3. **Coverage:** `applies_if ∧ ¬exempt_if` under Kleene logic over intervals → T/F/U. `age_years` is relative to the as-of date (AB 1482's rolling 15 years).
4. **Result:** T → `applies`; U → `unknown` + `missing_facts`; F → not listed.
5. **Precedence, per address and category:** a state rule whose extracted `interaction` is `yields_to_local`:
   - local rule of the same category `applies` → `superseded`, with `governed_by`;
   - local rule `unknown` → the state rule is `unknown`, depending on the local rule's facts.
   No extracted clause → both `applies` (coexist).
6. **Conflict:** `may_preempt_local` or `conflict_flag`, plus a local rule of the same category → `conflict_flag` and `conflict_with` on both.
7. **`ref` atoms:** e.g. `local_rent_control` = a local rent-limits rule that applies (T), is unknown (U) or is absent (F).

**Acceptance:** the 10 trap tests in §6 pass, including the p.3 SF example and T1.

### M6 · lookups.json (S, 0.5 h)

- **How:** run the engine on the 500 at `AS_OF` and write through the adapter. "Does not apply" pairs are omitted: the five values on p.5 have no "no" [assumed].
- **Per result:** `rule_id`, `result`, `governed_by`, `conflict_with`, `missing_facts`, `confidence`, `notes`. Confidence and a conflict flag per answer are a stretch goal on p.3 and cost almost nothing.
- **Acceptance:** 500 addresses present; byte-identical on rerun; 0 missed "applies" on dev.

### M7 · changes.json, as-of query, T1–T6 (S, 1 h)

Driven by data from `change_tests.json` plus the T6 spec at hour 16.

**Mapping key rule IDs to ours:** by state or city (`HOB`, `JC`, …), by category code (`ALG` → algorithmic, `RENT` → rent limits) and by status. The mapping is logged. If it is ambiguous, all candidates are kept.

| Test type | Affected set | Expected size (CSV) |
|---|---|---|
| `as_of` (T1, T3) | The before and after sets differ | T1: 250 CA · T3: 140 NJ |
| `boundary` (T2) | Per rule, the addresses where it applies | 40 Hoboken · 50 Jersey City · 0 Newark |
| `pending` (T4) | Addresses where it is `pending` | 110 MA |
| `negative` (T5) | Any listed result | Must be 0 |

- **T3:** a conflict flag on every Jersey City and Hoboken address (90).
- **Uncertain addresses:** included with `uncertain: true` [assumed; mentor Q2].
- **As-of query:** `homerule asof <address_id> <date>` on the CLI, plus a date picker on the web (required by p.2).
- **Acceptance:** the sizes above, plus the T1 flip between 2025-12-31 and 2026-01-02.

### M8 · Eval harness and audit (D, 1.25 h)

- **`make eval`:** score.py on dev, the assertion suite, the trap tests, the T1–T5 checker, the span checker and the prompt lint. It writes one report (`eval/report-<ts>.md` plus JSON).
- **`make gate`:** compares against `eval/baseline.json`.
- **Audit:** append-only `audit/*.jsonl`, one line per model call and per build (§5).
- **Acceptance:** one command, one report, <2 min without extraction.

### M9 · Hour-16 ingestion and live rerun (D, 1 h)

`make ingest DOC=<path> [TEST=<t6.json>]` runs: triage → extract → snap → canonicalise → AST → merge (new IDs) → lookups at `AS_OF` and at the T6 dates → changes T6 → eval → audit. It prints the records, spans verified, affected addresses, effective date and minutes taken.

- **Live rerun:** `make rerun DOC=Dxxx` re-extracts one doc in <3 min and prints a field-level diff against the committed record. The rule says a live rerun happens in the demo (p.5).
- **No prompt edits after the release:** the lint checks the prompt hash against the tag `pre-h16`.
- **Rehearsal** at 09:00 on a held-back doc.
- **Acceptance:** the rehearsal reproduces the record in <10 min. T6 contains Cambridge legal-city addresses only, with the effective date right.

### M10 · Web (S, 2.5 h)

Next.js on Vercel, phone-first.

**Routes:**
- `/` · address search over the 500 (ID or fuzzy street).
- `/a/[id]` · the address view:
  - the stack State › County › City, with a note when postal city X becomes legal city Y;
  - an as-of picker (default 2026-10-01);
  - one card per category: chip in words ("Applies", "Not in effect until 7/1/2027", "Proposed, not law", "Replaced by stricter local rule", "Unknown: depends on year built"), summary, verbatim quote, citation link, retrieved date, review badge;
  - "What changes next".
- `/proof` · score.py report, T1–T6 table, audit sample, postal ≠ legal count.

**Guardrails:**
- The disclaimer sits in the layout and in the print CSS.
- Summaries come from rule records only.
- Never "illegal" or "compliant". Never a comparison of a user's number to a cap.

**Acceptance:** the URL works on a phone; a route crawl finds "Not legal advice" on every page.

**Hour totals:**
- **D:** M0 0.75 + M1 4 + M2 2.5 + M8 1.25 + M9 1 = 9.5 h.
- **S:** M4 2 + M5 3 + M6 0.5 + M7 1 + M10 2.5 = 9 h.
- That leaves ≈0–1 h each for Shoulds, as the concept says.

## 4. EXTENSIONS (concept order; it is the reverse of the cut order)

| # | Extension | Raises | Est. gain | Cost | Risk | Depends on | Acceptance |
|---|---|---|---|---|---|---|---|
| S1 | **One question.** Missing building facts ranked by the number of categories they settle, each with how to check it (assessor, lease, rent registry). Provenance tag: *public record* / *you told us*. Re-evaluated in the browser, never written to lookups | Plain language, Responsible | +1–3 | 1.5 h S | Feels like advice → phrase as "what decides it" | M5 in TypeScript, M4 facts | On a Berkeley row, the year-built answer settles ≥2 categories |
| S2a | **Measured contrast.** An LLM-decides-coverage pipeline vs our engine, same model and corpus, scored by score.py on dev | Innovation, Communication | +1–2 | 1 h D | "Straw man" → same model, publish both runs | M8 | One table with both score.py totals |
| S3 | **MCP**, four read-only tools: `lookup_address`, `rules_as_of`, `whats_changing`, `missing_facts`. Records carry quote, citation, `source_url`, `retrieved_at`, `status`, `result`, `as_of`, `not_legal_advice: true`. Outside the 9 cities: `{"covered": false}`. Demo in Claude; ChatGPT only if tested | Innovation, Technical depth, Scalability | +1–2 | 1 h S | The assistant drops the disclaimer → it goes in every payload and tool description; pre-record the demo | M5, M10 deployed | Claude cites the hour-16 ordinance with as-of and disclaimer |
| S2b | **Trap set:** about 25 dated questions graded only against the brief and dev key; plain model vs model + tool; the plain model's correct answers are reported too | Innovation, Communication | +0.5–1 | 1.5 h D | Cherry-picking → fixed list, written before the run | S3 | One script regenerates the table |
| S5 | **Clinic sheet:** print CSS of the address view | Plain language, Responsible | +0.5–1.5 | 0.75 h S | Low | M10 | One A4 page per address, with disclaimer, as-of, quotes, open questions |
| C1 | **Self-improving loop:** repair half / gate half of the suite. Prompt lint (answers never enter prompts). Budget cap (soft $5 / hard $15). Promoted only without regressions | Extraction +0–2, Technical depth | 0–2 | 3 h+ D, overnight | Overfitting 10 dev rules; "hand-coded" suspicion | M8 green at 03:00 | Promoted variant ≥ baseline on the gate half; hour 16 is the out-of-sample test |
| C2 | **Spanish:** summaries only; quotes stay English | Plain language (stretch goal, p.3) | +0.5–1 | 1 h | Mistranslated legal terms | M10 | Toggle; quotes untranslated |
| C3 | **Provider wording** | Plain language (providers, p.2) | 0–0.5 | 0.5 h | Evasion or certification → no "compliant" badge, no "exempt buildings" filter | M10 | Toggle; no forbidden words |
| C4 | **Live typed address:** Census live, cached; a Santa Ana address resolves to the extracted Santa Ana rules (no sample addresses there, p.3) | Scalability 5, Plain language | +0.5–1 | 1 h S | Census latency → cache plus fallback | M4, M5 | A typed address outside the 500 gets cards |

S5 has high points per hour (0.75 h). If S1 is cut, S5 is the cheapest remaining judged gain.

## 5. Frozen contracts between S and D

| Contract | Producer → consumer | Freeze |
|---|---|---|
| `contracts/ast.schema.json` (below), owned by S, validated by both | D's extraction emits it → S's engine | **22:00** |
| `team_rule_id` = `<JUR>-<CAT>-<NN or Pn>`; audit line | Both | 22:00 |
| `adapters/*.json` | D (M0) → both | 23:00, then append-only |
| `out/addresses.resolved.json` (`address_id`, `legal{state,county,city,place_type,source,confidence}`, `postal_city`, `facts{built:{from,to},units:{min,max},use_class,owner_type:null}`) | S → engine, D eval | 23:00 |
| CLI `node engine/build --rules … --compiled … --addresses … --as-of … --out …` (<1 s) | S → D (eval, C1) | 23:30 |
| Internal lookup and change records (below); the adapter writes the guide's shape | S → D eval | 00:30 |

```ts
// rules.compiled.json — one entry per team_rule_id
type Node = {all: Node[]} | {any: Node[]} | {not: Node} | boolean
  | {fact: "units"|"built"|"use_class"|"legal_city"|"county"|"state"|"place_type"|"owner_type"|"owner_occupied"|"structure_type",
     op: "eq"|"ne"|"lt"|"le"|"gt"|"ge"|"in", value: string|number|string[]}
  | {age_years: {op: "lt"|"le"|"gt"|"ge", n: number}}   // relative to as_of
  | {ref: "local_rent_control"|"local_just_cause"|string}
  | {unparsed: string};                                   // evaluates to U
type Compiled = { team_rule_id: string; level: "state"|"county"|"city"; state: string; county?: string; city?: string;
  category: string; status: "in_force"|"enacted_not_effective"|"pending"|"failed"|"repealed";
  effective: {from: string|null; precision: "day"|"month"|"year"}; applies_if: Node; exempt_if: Node;
  tenant_conditions: string[]; interaction: {type: "none"|"yields_to_local"|"coexists"|"may_preempt_local", target_category?: string, quote?: string};
  provides_atoms: string[]; retrieved_at: string; parse_status: "ok"|"partial"|"failed" };
```

```json
{"address_id":"A0002","as_of":"2026-10-01","rule_id":"NJ-ALG-01","result":"not_yet_effective","governed_by":null,
 "conflict_with":["HOB-ALG-01"],"missing_facts":[],"confidence":0.82,"notes":[]}
{"test_id":"T3","key_rule_ids":["NJ-ALG-01"],"rule_ids":["NJ-ALG-01"],"as_of_before":"2026-10-01","as_of_after":"2027-07-02",
 "affected_addresses":["A0002"],"per_address":{"A0002":{"before":[{"rule_id":"NJ-ALG-01","result":"not_yet_effective"}],
 "after":[{"rule_id":"NJ-ALG-01","result":"applies"}],"conflict_flag":true,"conflict_with":["HOB-ALG-01"],"uncertain":false}}}
{"ts":"2026-10-04T09:12:03Z","run_id":"…","stage":"extract|snap|compile|build|eval|ingest|repair","doc_id":"D085","model":"…",
 "prompt_hash":"sha256:…","input_hash":"sha256:…","raw_ref":"audit/raw/…","verdicts":{"schema":"pass","span":"exact"},
 "rule_ids":["…"],"score":null,"cost_usd":0.41,"git_sha":"…"}
```

## 6. Test plan

**Trap tests** (engine, S):
1. SF 1962, 20 units, as of 2026-10-01 [p.3]:
   - Rent: SF ch. 37 `applies`; §1947.12 `superseded` (governed by ch. 37).
   - Just cause: §37.9 `applies`; §1946.2 per its extracted clause.
   - Deposit: §1950.5 `applies` (small-landlord exception false at ≥5 units).
   - Screening fee: §1950.6 `applies`.
   - Algorithmic: §37.10C and AB 325 both `applies`.
2. T1 boundary dates.
3. Dorchester row → Boston.
4. Newark row with ZIP 11219 → Newark.
5. Year 1979 against a 1979-06-13 cutoff → U; 1978 → T.
6. Berkeley, missing year → `unknown` with `missing_facts`.
7. Unparsed node → `unknown`, never omitted.
8. Pending → `pending`.
9. Failed → never listed.
10. T3 conflict pair.

**Assertion suite** (D, derived from the brief), about 27 named rules from p.3 plus the SF example:
- **Rent limits:** §1947.12, SF ch. 37, LA RSO, MA c.40P bar.
- **Just cause:** §1946.2, N.J.S.A. 2A:18-61.1, SF §37.9.
- **Deposits:** §1950.5 (eff. 7/1/2024), N.J.S.A. 46:8-21.2, c.186 §15B.
- **Fees:** §1950.6, P.L.2025 c.405 ($50, eff. 5/1/2026), c.186 §15B, c.112 §87DDD½ (8/1/2025).
- **Screening:** NJ Fair Chance (2021), FEHA SB 329.
- **Algorithmic:** AB 325 (1/1/2026), SF §37.10C, SD §§98.1101–1104, Berkeley 13.63, Santa Ana NS-3090, JC §218-12, Hoboken ch. 158, FAIR Act (7/1/2027), S.2983, H.5222.
- **Failed:** IP 25-21.

The suite also covers T1–T5 and the legal-city cases. It is split by a stable hash into a repair half and a gate half, for C1 only.

**Prompt lint:** no citation, date or key value from the suite may appear in any prompt. CI fails if one does. This also protects "automated extraction only".

**score.py for the videos:**
- Fresh terminal: `date; git rev-parse --short HEAD; python starter/score.py …` with the full report on screen.
- `make changes-report` for T1–T6.
- The hour-16 run recorded with the clock visible.
- Every run is also teed to `eval/`.

**Regression gate:** a prompt or engine change is promoted only if every score.py component stays ≥ baseline, and the assertion and trap sets lose no passes. The baseline moves only by such a commit.

**Disclaimer test:** crawl the web routes, the print view and the MCP responses for "not legal advice".

## 7. Gates and cut rules

| Gate | Pass | If red |
|---|---|---|
| **22:00 go/no-go** | score.py prints on our files; ≥4/10 dev rules; ≥90% spans verbatim; geocoding has run; AST schema frozen | <3/10: cut S2b, S3 and C; both on extraction. <70% of conditions parse: switch to fixed fields (year cutoff, minimum units, owner type, exemption flags) |
| **03:00 checkpoint** | `make all` <15 min; trap tests green; dev ≥7/10 with 0 missed "applies"; URL live | No overnight loop; the morning goes to Musts only |
| **07:00–11:00 hour-16 watch** | Next row | Next row |
| — | | Alarm at 07:00; whoever is up watches the Drive folder and announcements and runs `make ingest` |
| **Hour 16** | T6 in changes.json; recording committed; no prompt edits | Fix only the parsing glue, never the prompts |
| **12:00 freeze** | Final `make eval`; outputs committed; Proof page updated | After 12:00: videos, README, submission only |

- **Cut order** (concept): C4 → C3 → C2 → C1 → S5 → S2b → S3 → S2a → S1. If S1 goes, each unknown shows a static reason instead.
- **No Should before M10 is live.**
- **Never cut:** M0–M10, score.py on screen, the hour-16 run, "not legal advice", the live link.

## 8. Mentor questions and open decisions

> **Update Sat 03.10. ~22:45:** no mentor or judge is assigned to this challenge. The questions below go to the Discord challenge channel instead (priority: score.py release, hour-16 time and format, how unknowns count, licensing of the starter pack for a public repo). D8 is dropped.

**Mentor questions,** only what the guide leaves open, ranked by points at stake:
1. When exactly (CEST) does hour 16 drop? Is it text plus a manifest row plus a T6 spec? What does the "live rerun in the demo" involve?
2. Do affected sets and lookups count addresses whose coverage is unknown? Does the key treat use-code unit classes ("5+ units", "APT 7-30 UNITS") as known facts?
3. Is IP 25-21 a rules.json record with a failed status? How are the 19 "no rule" findings represented, and are extra records penalised?
4. Are lookups scored at 2026-10-01? Are "does not apply" pairs omitted?
5. If local coverage is unknown, does the key expect the yielding state rule as `unknown`, `applies` or `superseded`?
6. What is the format of the T3 conflict flag in changes.json?
7. Citation for amended sections: AB 12 or Civ. §1950.5?
8. Is the dev key a subset of the held-out key?

| Decision | Options | Metrics affected |
|---|---|---|
| D1 self-repair loop | Could (concept) / Should / drop | Extraction +0–2, technical depth. As a Should it takes 2–3 h of D from M2/M8/M9 hardening, which puts Citations and Change at risk |
| D2 engine language | TypeScript (concept) / Python | No scored effect if the outputs match. TypeScript gives instant S1 re-evaluation and one engine for MCP. Python is native to the C1 loop; S1 then needs an API or precomputed variants |
| D3 headline | "Training cutoff vs effective date" / other | Communication and innovation only |
| D4 demo hero | Berkeley (concept) / Hoboken | Berkeley: 40/40 rows lack year and units [verified CSV], so the unknown → one question story shows Responsible and Plain language. Hoboken shows RealPage's product as the villain; T2/T3 already show NJ |
| D5 MCP | Should (concept) / Could | Innovation, technical depth, Scalability; 1 h of S otherwise goes to S1/M10 |
| D6 measured contrast | Both / S2a / none | Communication and innovation; 1–2.5 h of D |
| D7 primary user | Renter (concept) / clinic / advocate | How Plain language and Responsible are judged. Renters are the brief's first user group [p.2]; the clinic is served by S5 |
| D8 mentor contact | S / D | How fast M0's [unknown]s close, which affects all auto metrics. Proposal: whoever is off the critical path at that moment |

## 9. Deviations from the concept

1. **Struck record emitted** (M3 said "struck never emitted"). The key holds `MA-RENT-P1` and T5 expects IP 25-21 "recorded as failed" [SP:change_tests]. Dropping it forfeits a key match. It still never reaches lookups or affected sets.
2. **Precedence comes from extraction; the hand table becomes a test** (M5 had a hand `yields_to` table). The schema has `overrides` and `interaction` fields [SP:sample_rule_record]. A hand table invites the "hand-coded" charge (p.5) and weakens the scalability story. The concept's table moves into the assertion suite. Without an extracted clause, rules coexist (both `applies`), because a wrong `superseded` risks the 2× miss.
3. **M4 additions** (+0.5 h S): unit intervals from use codes, behind the flag `UNITS_FROM_USECODE` and decided by the dev score; the CSV ZIP is never used for NJ; the 38 neighbourhood rows go through a table. All three come from SP:CSV.
4. **Hour-16 watch from 07:00, not 09:30.** If hour 0 = submission − 24 h, hour 16 is Sun 07:00 CEST; if hour 0 = kickoff (~18:00), it is ~10:00 [unknown]. Also a `make rerun` path, because p.5 announces a live rerun in the demo.
5. **M0 made explicit:** it is the existing 20:30–22:00 slot, now with deliverables (adapters, baseline). It adds no hours.
6. **Affected sets include uncertain addresses** with `uncertain: true` [assumed] until mentor Q2 settles it.
