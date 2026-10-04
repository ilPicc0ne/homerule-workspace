# HomeRule architecture

How HomeRule is built. What it must do, and why, is in [PRD.md](PRD.md); this file is the how. Status: draft, Sun 04.10.2026.

> **Not legal advice.** HomeRule shows which published housing rules may apply to an address, with quotes and dates.

## Overview

```
corpus (87 docs, manifest)          sample addresses (500, CSV)
        │                                   │
   A Extraction                        B Address resolution
   triage → classify (Jev) →           Census geocoder → neighbourhood table →
   extract fields → quote check        fallback; building facts as ranges
        │                                   │
   rules.json + rules.compiled.json    addresses.resolved.json
        └──────────────┬────────────────────┘
                 C Engine (as-of date)
        evaluate every rule × address → lookups.json
                       │
                 D Change: run C twice → diff per address
                 → changes.json · change log · alert email
                       │
          Web (Vercel): address dashboard + JSON API (+ MCP later)
```

Everything between the corpus and the outputs is one command: `make all`. Extraction results are cached, so a rebuild without new documents takes minutes.

## Interfaces

Frozen before parallel work; changed only via PR with the other person tagged.

| ID | Interface | From → to | Must hold |
|---|---|---|---|
| I1 | `contracts/jurisdictions.json`: 13 rule-bearing IDs (e.g. `NJ-HOBOKEN`) plus display-only county entries; each with legal name, level, `parent` (city → county → state), Census code (`census_geoid`; NJ/MA cities also `census_cousub_geoid`; counties optionally `county_law`), `schema_name` (the exact string the rule schema expects, e.g. "San Francisco, CA") and `aliases` ("Dorchester", "SF", "Jersey City NJ") | S → D, S | Only these IDs internally; `rules.json` writes `schema_name`; search resolves names and aliases through it |
| I2 | `out/rules.json` + `out/rules.compiled.json` | D → S | Schema-valid; `jurisdiction` = the list's `schema_name`; status mapped to the schema values (`enacted_not_effective` → `not_yet_effective`; repealed rules are left out of `rules.json`, since `failed` means a measure that never became law); effective date or null (two dates kept when sources disagree); verbatim quote |
| I3 | `out/addresses.resolved.json` (type `ResolvedFile` in `web/lib/resolve/types.ts`) | S → engine, D eval | All 500; jurisdiction IDs + `stack`, tree, coords, facts as ranges, source + confidence per field, `review` flags |
| I4 | Engine CLI `make build AS_OF=<date>` (`python -m engine.build --as-of <date>`) | S → eval, web | Deterministic (byte-identical reruns); reads only I2, I3, I8; writes `outputs/lookups.json` and `outputs/changes.json` in the guide's shapes plus `out/lookups.full.json` for the web (shape in C) |
| I5 | `/api/address/<id>?as_of=` | S → page, email, MCP | Same data as `lookups.json`; `as_of`, retrieval dates, `not_legal_advice: true` |
| I6 | Per-address diff | S → changes, change log, email | One computation feeds all three |
| I8 | `out/findings.json`: what is not a rule — `barred_by_law` (e.g. MA c.40P), `measure_failed` (e.g. IP 25-21), `not_in_corpus` (e.g. Hoboken ch. 158: manifest link, no text) per jurisdiction × category, with quote where one exists; `open_question` (the guide's known open questions, e.g. Berkeley's two published effective dates: our rule and its source next to each competing claim and its source) | D → S | Never emitted as rules; the page shows them ("No rent cap: barred by …") and they fill the 13 × 6 grid |
| I7 | `contracts/facts.json`: building-fact names, types, operators, three-valued semantics, special nodes (`age_years`, `ref`, `unparsed`) | S → D | Coverage conditions use only these names; anything else becomes `unparsed` (unknown) or a tenant condition |

## Shared vocabulary: the jurisdiction list

Requirement: PRD [Owners and handoffs](PRD.md#owners-and-handoffs); interface I1 below.

`contracts/jurisdictions.json` holds the 13 jurisdictions in scope: 3 states (CA, NJ, MA) and 10 cities or municipalities (Los Angeles, San Francisco, San Diego, Berkeley, Santa Ana, Jersey City, Hoboken, Newark, Boston, Cambridge). Each entry has an ID (e.g. `NJ-HOBOKEN`), legal name, level (`state` or `city`) and Census place code.

Both pipelines emit only these IDs: the extraction for rules, the address resolver for addresses. A value outside the list is an error, never a new jurisdiction. This is what keeps rules and addresses joinable. The corpus has no county documents. Counties are resolved for display only.

## A · Extraction

Requirements: PRD [scoring](PRD.md#what-we-must-get-right-scoring): Extraction, Citations.

**Document scope** (from `corpus_manifest.csv`): each document has exactly one jurisdiction, and the 13 values are exactly the jurisdiction list. Of 87 documents, 55 official texts are extracted; 23 link-only sources are skipped and logged; 9 code-publisher pages (`check-terms`) are used only if their text is supplied. The classifier does not re-decide a document's jurisdiction; it tags rules that refer to another level and flags a rule whose jurisdiction disagrees with its document.

**Grid triage:** 13 jurisdictions × 6 categories. Each cell gets one or more rules, a "no rule" record backed by barring text (e.g. MA c.40P), or "no source in corpus". Never filled to reach a count; some cells hold two rules (MA fees).

Input: `corpus/text/*.txt` and `corpus_manifest.csv`. Output: `out/rules.json` (the challenge schema) and `out/rules.compiled.json` (machine-checkable coverage).

1. **Triage per document.** Official text is extracted. Link-only sources (law firms, news) are skipped and logged. Code-publisher pages are used only if their text is supplied. The document's jurisdiction comes from the manifest (one per document).
2. **Classify** each candidate rule with Jev (typesafe.ai): category (six scored categories plus sub-type tags), level, jurisdiction ID, status (in force, enacted not yet effective, pending, failed). The classifier's confidence feeds the record's `confidence`. Fallback: the same classification as a structured-output call to a frontier model.
3. **Extract fields** with a frontier model and structured output: requirement, key value, coverage conditions, exemptions, effective date, citation, penalty, quoted span, plus the quote that justifies the status and the date. Granularity: one record per jurisdiction × category × cited section.
4. **Quote check.** Every quoted span must be a raw substring of its source document. Matching is exact, then normalised (whitespace, quotes, dashes, with an offset map back to the raw text), then fuzzy. A failed span triggers one retry; after that the record is kept with low confidence and a review flag, never dropped.
5. **Compile coverage** into predicates over building facts (below). Parts that can't be parsed are kept as `unparsed` and evaluate to unknown.
6. **Precedence and conflicts** come from the extracted `overrides` / `interaction` fields (e.g. a state rule that yields to stricter local rent control). They are linked in a second pass. Conflicts are flagged, never resolved by a model.

Runs one pass per category, in parallel. Adding or fixing a category reruns only that pass. A single document can be re-extracted live (`make rerun DOC=D0xx`) with a field-level diff against the committed record.

### Coverage predicates (`rules.compiled.json`)

```ts
type Node = {all: Node[]} | {any: Node[]} | {not: Node} | boolean
  | {fact: "built"|"units"|"use_class"|"subsidised"|"owner_type"|"owner_occupied",   // contracts/facts.json
     op: "eq"|"ne"|"lt"|"le"|"gt"|"ge"|"in", value: string|number|boolean|string[]}
  | {age_years: {op: "lt"|"le"|"gt"|"ge", n: number}}   // relative to the as-of date
  | {ref: string}                                        // another rule's result, e.g. local rent control
  | {unparsed: string};                                  // evaluates to unknown

type Compiled = { team_rule_id: string; jurisdiction: string; level: "state"|"city";
  category: string; status: "in_force"|"enacted_not_effective"|"pending"|"failed"|"repealed";
  effective: {from: string|null;       // operative date if the text gives one, else effective date
              until: string|null;       // repeal or sunset date (e.g. Civ. Code §1947.12: 2030-01-01)
              precision: "day"|"month"|"year";
              derived: string|null};    // how a computed date was derived, e.g. "1st day of 12th month after enactment"
  applies_if: Node; exempt_if: Node; tenant_conditions: string[];
  key_value: string|null;
  key_value_conditions: {value: string; when: Node; tenant_note: string|null}[];  // alternative amounts, e.g. the
                                        // small-landlord deposit cap; coverage is unaffected
  interaction: {type: "none"|"yields_to_local"|"coexists"|"may_preempt_local", target_category?: string, quote?: string};
  interactions: {type: string; target_category: string; quote: string}[];  // all of them; `interaction` is the first
  retrieved_at: string; parse_status: "ok"|"partial"|"failed";
  checks: string[];                     // names of failed extraction checks; empty when parse_status is ok
  x_source: {unit: string; source_doc_id: string; citation: string;
             effect: "protection_or_duty"|"bars_or_limits_local_rules";
             cap_pct_low: number|null; cap_pct_high: number|null;   // rent caps: the evaluator compares them to
                                                                    // decide whether a local cap supersedes the state's
             status_evidence: object|null; origin: "starter"|"supplemental"|"ingested"; stub: boolean} };
```

## B · Address resolution

Requirements: PRD [scoring](PRD.md#what-we-must-get-right-scoring): Address coverage.

Input: `data/sample_addresses.csv`. Output: `out/addresses.resolved.json`. Code: `web/lib/resolve/` (one TypeScript implementation for the batch run and the website), batch in `web/scripts/resolve-batch.ts`, `make resolve`.

1. **Normalise** the street: strip leading zeros in ordinals ("05TH AV" → "5TH AVE"), take the first of double addresses ("600 JACKSON/601 HARRISON"), drop lot suffixes.
2. **Census geocoder**, one geographies call per address (the batch endpoint returns no city name): street, city, state. The ZIP is sent for CA and MA but never for NJ, because the NJ ZIPs in the data are owners' mailing ZIPs.
3. **Reject contradictions.** A Census city that contradicts a non-neighbourhood postal city is rejected, and the address gets a review flag.
4. **Fallback:** a neighbourhood table (Dorchester, Roxbury, … → Boston; San Ysidro → San Diego), else the CSV city, with lower confidence.
5. **Building facts as ranges:**
   - year built y → [y-01-01, y-12-31];
   - units from `units`, else parsed from the use description ("5B-20U", "APT 7-30 UNITS", "(5+ units)");
   - Boston land use "A/…" without a range of its own (LUXURY APARTMENT, SUBSD HOUSING, ELDERLY HOME) → 7+ units [assumed: `boston_land_use_A_is_7_plus`]; ELDERLY HOME counts as an apartment building [assumed: `boston_elderly_home_is_apartment`];
   - subsidised: "SUBSD HOUSING" or an NJ description with "AFFORDABL" → true; no affordability code in the record → false [assumed: `no_recorded_affordability_restriction`];
   - conflicting facts → unknown plus a flag;
   - owner type is always unknown.

   The assumptions mirror the extraction's APT5 guard (use_class in [apartment, mixed_use] ∧ units ≥ 5 ∧ subsidised = false, `extract/luna_pass.py`) and its stand-in `lab/schema_experiment/facts.py`. Each record names the ones it relies on in `assumptions`, its `source` says `assumption` for such a fact, and `source_detail` gives a short quotable origin per fact.

**Jurisdiction tree** (`tree.ts`), the same for the batch and the website: Federal › State › County › Municipality. Each level has a status: `covered` (rules in HomeRule), `not_covered` (law exists there, HomeRule doesn't have it: federal law, an unchecked county, LA County for an unincorporated address) or `no_rules` (nothing to cover: no county government, county law only for unincorporated areas, no city government). Counties carry `county_law` in the list (`none` for Suffolk and Middlesex, `unincorporated_only` for LA County, ch. 8.52); unchecked counties stay `not_covered`.
- Municipality = the Census incorporated place; else a county subdivision with an active government (Census `FUNCSTAT` A: NJ townships, MA towns such as Brookline town). CA county subdivisions are statistical CCDs and never count; a CDP is only a label.
- No incorporated place and no town government → "unincorporated": the county governs, no city's law applies (4801 E 3rd St, postal "Los Angeles", is unincorporated East Los Angeles).
- MA counties have no county government (`FUNCSTAT` N); the tree says so.

**Census cache:** every raw Census response of the batch run is committed in `engine/cache/census/` (one file per request URL, layers limited to the tree's six). `make resolve` runs offline from it and is byte-identical on every run; `make resolve-live` fills missing requests.

**Website search** (`/api/resolve`, `/where`): place-only input ("Boston, MA", "Dorchester", "Hudson County", "California") resolves through the list and its aliases, never Census; a ZIP alone gives its state (CA/NJ/MA only) and asks for the street; a street address that is one of the 500 answers from the batch file with its building facts; any other street address goes to Census. Several matches in different places → `ambiguous` with candidates; Census matching another city than the one typed → a warning; Census down or slow → `unavailable` (one retry, 8 s timeout).

Further rules:
- **Unknown, not omitted:** missing year or units, or a build year equal to a certificate-of-occupancy cutoff year (SF 1979, LA 1978), gives `unknown`.
- **Owner type** is never in the data, but it shouldn't spread unknowns: where an owner-type exception also needs a unit count the building can't meet (CA small-landlord deposit exception), the rule `applies` and the explanation says why the exception can't apply.
- **County:** resolved for display only. No county documents in the corpus; county tenant ordinances in scope cover unincorporated areas only [assumed, check LA County], and all 500 addresses are in incorporated cities. The page says "No county rules for addresses inside <city>".
- **Tenant facts** (12 months' tenancy, owner-occupied duplex) are notes on the card, never inputs.

Measured on all 500 (04.10.2026, `make resolve`): 492 placed by Census in the expected city, 8 from the postal city (6 without a house number, 21 Guerrero St unknown to Census, 85-87 Sierra Rd no match), 0 contradictions after normalisation (A0009 matches Cambridge once "322-322.5" becomes "322"). 38 postal ≠ legal city (37 Boston neighbourhoods, San Ysidro). Units: 255 from the CSV, 242 from use codes (32 of them Boston land use A = 7+, assumed), 3 unknown, all 3 conflicts flagged (A0227, A0041, A0398). Subsidised: 27 true from the use code (26 SUBSD HOUSING, A0049 "AFFORDABL"), 473 false by assumption, 0 unknown. 468 rows meet the APT5 guard.

Each record: `address_id`, `jurisdictions` (state, county, city IDs), `stack`, `tree`, `postal_city`, `legal_city`, `postal_differs`, `coords` (null when Census didn't place it), `census` (matched address, attempts), `facts {built, units, use_class, subsidised, owner_type: null, owner_occupied: null}`, `source`, `source_detail` and `confidence` per field, `assumptions` (sorted names), `review`. Unit ranges from use codes count as facts (`units_from_use_code`, switch `--no-use-code-units`); NJ class 4C = 5+ units, "3SB" is storeys and never units.

## C · Engine

Requirements: PRD scoring (Address coverage); interface I4.

A deterministic function of (rules, compiled predicates, resolved addresses, as-of date). The same input gives byte-identical output. Per address and rule:

Built as a thin adapter around one evaluator (`engine/evaluate.py`, the three-valued reference evaluator from the extraction work; `lab/schema_experiment/evaluate.py` re-exports it). `make build AS_OF=<date>` = `python -m engine.build --as-of <date>`:

- `engine/rules.py` reads I2 (`out/rules.compiled.json`, `out/rules.json`) and I8 (`out/findings.json`) and turns each compiled record back into the evaluator's format (Nodes inverted from `compile.to_node`; dates only from `effective.from/until`; `effect` = bars local rules when an I8 `barred_by_law` finding has the same jurisdiction, category and citation). It never reads `out/extracted/`, so a clean checkout builds.
- `engine/facts.py` turns each I3 record into the evaluator's facts (`address.city` = the city's `schema_name`, `built`, `units`, `use_class`, `subsidised`; a null fact is left out, so it counts as missing). Each fact keeps its I3 `source_detail` and named assumption for the explanation. `subsidised_housing` is read as `apartment` (assumption `subsidised_housing_counts_as_apartment`; the subsidy stays in `subsidised`).
- `engine/explain.py` words each result in one or two sentences from the same conditions: the deciding facts with their source ("built 1926 (year_built, DataSF …), before the June 13, 1979 cutoff"), or for unknown the missing or undecidable fact and where to check it.

Per address and rule:

1. **Jurisdiction:** the rule's jurisdiction is the address's state or legal city, else the rule is not listed.
2. **Status gate:** failed or repealed rules are never listed, nor rules whose `effective.until` is on or before as-of; pending → `pending`; an `effective.from` after as-of → `not_yet_effective` (on the day itself the rule is in force). A `from` with month or year precision: before it `not_yet_effective`, during that month/year `unknown` ("takes effect during <month>"), after it normal. Today all dates are day precision.
3. **Coverage:** `applies_if ∧ ¬exempt_if` under three-valued logic over fact ranges. True → `applies`; unknown → `unknown` with the missing facts named; false → not listed. A building whose year equals a certificate-of-occupancy cutoff year is unknown.
4. **Precedence**, per category:
   - A state rule that yields to local rules becomes `superseded` (governed by the local rule) when the local rule applies.
   - It becomes `unknown` when the local rule's coverage is unknown.
   - Without an extracted clause, both rules apply.
5. **Conflicts:** `may_preempt_local` plus a local rule of the same category → `conflict_flag` on both (also while the preempting law is not yet effective); never decided.

Outputs (byte-deterministic: sorted keys and order, no timestamp but `as_of`):

- `outputs/lookups.json`: the challenge format `{as_of, lookups: {address_id: [{team_rule_id, result, explanation, conflict_flag}]}}`, all 500 addresses (an empty list is allowed), only rules in `rules.json` (a verbatim quote), only the template fields.
- `outputs/changes.json`: T1–T5 (T6 once an ingested rule exists) through `extract/changes.py`, driven by the same evaluator and I3 facts.
- `out/lookups.full.json` for the web:

  ```
  {as_of, not_legal_advice: true,
   rules:    {team_rule_id: {jurisdiction_id, category, citation, title, source_url, source_doc_id, requirement_quote,
                             retrieved, eff {from, until, precision, derived}, document_status, key_value,
                             tenant_conditions, scored, confidence, origin}},
   findings: {jurisdiction_id: [{category, kind, citation, quote, note, source_doc_ids, url}]},   // I8
   addresses: {address_id: {stack, jurisdictions, facts, assumptions, review,
                            results: [{team_rule_id, result, explanation, conflict_flag, jurisdiction, category,
                                       scored, confidence, missing, assumptions, governed_by, conflict_with,
                                       value, flags, invalid}]}}}
  ```

  `confidence` = rule confidence × jurisdiction confidence × the confidence of `built`/`units` when the rule tests them. `scored: false` marks rules without a verbatim quote (not in `lookups.json`). `value` is the key value or `{conditional, depends_on}`.
- `out/build_summary.json`: counts per city × result; each build prints it with the deltas to the previous one and warns when a count halves.

Tests: `make test` (adapter, determinism, guards on the scored file, as-of boundaries, J1–J3 and Dorchester); `make eval` uses the same rule loader and I3 facts.

## D · Change and diff

Requirements: PRD scoring (Change tracking), journeys J3–J4; interface I6.

A change is either a new document (ingest) or a second date (as-of query).

- Ingest: `make ingest DOC=<path>` runs A for that document, then C before and after.
- **Diff per address:** the before and after result lists are compared by rule ID, giving added, removed and changed results.
- One diff feeds three outputs, so they can't disagree:
  - `changes.json` (`{test_id: {affected_address_ids, conflict_flag_address_ids, notes}}`), with the before/after rule set per address summarised in `notes` (the brief asks for it);
  - the change log on the address page;
  - the alert email (preview in P0, sending in P1).
- Change tests T1–T5 come from `dev/change_tests.json`; T6 is the hour-16 ordinance, run through the same ingest.

**Built (`s/changes`, issue #11):**

- `engine/diff.py` is the one diff (I6). It compares two engine evaluations (the same rows as `lookups.json`) per address by `team_rule_id`: added, removed, or changed (result or conflict flag). Each change carries old → new result and explanation, both conflict flags, and the rule's title, citation, verbatim quote, effective date and official source.
- `make build` writes `out/changes.full.json` with the change sources it can compute from the committed files: the brief's as_of tests (`asof:2025-12-31..2026-01-02` for T1, `asof:2026-10-01..2027-07-02` for T3/J3), plus `ingest:<doc>@<as_of>` for each ingested document already in I2 (`origin: ingested`). Deterministic. Only addresses with a change are listed:

  ```
  {as_of, not_legal_advice: true,
   sources:   {source_id: {kind: as_of|ingest, title, test_id?, before {as_of}, after {as_of}, document, demo_label,
                           affected_address_ids, rule_ids}},
   addresses: {address_id: {label, jurisdictions,
                            entries: [{source, kind, title, before_as_of, after_as_of, demo_label,
                                       changes: [{team_rule_id, change: added|removed|changed,
                                                  before|after: {result, conflict_flag, explanation} | null,
                                                  result_changed, conflict_flag_changed, scored, title, citation,
                                                  requirement_quote, source_url, effective_from, jurisdiction_id,
                                                  category, document_status, origin}]}]}}}
  ```
- `changes.json` is still computed by `extract/changes.py` (Dimitar's, also used by `make eval`); `tests/test_diff.py` asserts that both agree: T1 and T3 affected and conflict-flag sets are equal, T2 equals the diff's before side, T4 rules never flip by date, T5 has no MA rent-cap change, and the T6 ingest mechanics agree on a test-only in-memory rule. Sharing one function was left out: not small enough before the freeze.
- Change log + email: `/changes/[id]` reads `web/data/changes.full.json` (synced) and shows every entry old → new, dated, then the alert email preview from `web/lib/changes/email.ts` (`render(addressChange)` → `{from, subject, html, text, headers: List-Unsubscribe, List-Unsubscribe-Post}`; HTML in a sandboxed iframe). Nothing is sent.
- `make demo-change [DOC=… JUR=… ID=…]` (default the fictional `tests/fixtures/synthetic/X001.txt`): ingest (extraction, cached by request hash) → the new rules compiled to I2 in memory → engine before/after at `AS_OF` → diff → `out/changes.full.json` → web sync → prints the changed addresses and the preview URL. It never writes `outputs/` or the committed I2 files and removes the document's index and extraction records afterwards; anything from a fictional document is labelled "Demo: fictional ordinance" in the log and the email. `make build` drops the demo source again. It needs `OPENROUTER_API_KEY` or a warm `build/cache`; without either it stops and says so (no faked extraction).

## Web and API

Requirements: PRD [the address page](PRD.md#the-product-one-address-page), [priorities](PRD.md#priorities-and-feature-status), [user journeys](PRD.md#user-journeys).

- **Hosting:** Vercel (Next.js 16), Pro plan, project `homerule`, domains `yourhomerule.com` and `www.yourhomerule.com`, phone-first.
- **Data store: files in git, no database.** Rules, resolved addresses and engine results are a few MB of JSON, committed and reproducible with `make all`; the page reads them at build time, so the page and the scored files show the same results. Address resolution runs once offline and is committed as a cache. The only mutable data is subscriptions (Redis, below).
- **Hour-16 update:** the ingest rebuilds the outputs and triggers a production redeploy (~1 min). Fallback if a redeploy is too slow: upload the outputs to Vercel Blob and let the page read from there.
- **Contacts for "what you can do next":** a small table per jurisdiction (rent board, housing department, legal-aid line) in `contracts/contacts.json`, with source links; cards pick the entry for the rule's jurisdiction and category.
- **Routes:**
  - `/`: search over the 500 addresses, with example addresses.
  - `/a/[id]`: the address dashboard, in this order:
    - "not legal advice" banner and as-of picker;
    - the subscribe box;
    - map;
    - the jurisdiction stack;
    - building facts;
    - summary chips;
    - six question cards;
    - coming up and the change log.
  - `/j/[id]`: jurisdiction page for any level, rules with their conditions; `/api/jurisdiction/[id]?as_of=` read-only JSON.
  - `/where?q=`: the jurisdiction tree for any US address or place (server-rendered, plain GET form; client-side autocomplete over the sample addresses and places from `lib/resolve/suggest.ts`, nothing fetched while typing).
  - `/api/resolve?q=`: free text (address, city, neighbourhood, county, state, ZIP) → `{kind: address | place | ambiguous | not_found | unavailable, tree, coverage, notes, …}`; sample addresses carry `sample.address_id` and facts. 404 for not found, 503 when Census is down.
  - `/api/address/[id]?as_of=`: read-only JSON with `as_of`, retrieval dates and `not_legal_advice: true`.
  - Later `/api/mcp`, the same functions behind `mcp-handler`.
- **As-of dates:** the engine runs at build time for a fixed list: 2025-12-31 and 2026-01-02 (T1), 2026-10-01 (default), and each effective date in the rules ±1 day. The picker snaps to this list.
- **Email (P1):** Resend (EU region), domain `yourhomerule.com` verified (DKIM on `resend._domainkey`, SPF and bounce MX on `send.`, DMARC `p=none`); sender `HomeRule <alerts@yourhomerule.com>`. Subscriptions per address ID with double opt-in; sent after a rebuild from the diff. Deliverability: HTML + text part, unsubscribe link and `List-Unsubscribe` header, a warm-up of a few mails to our own inboxes. The first test landed in Outlook spam (new domain, no reputation yet). Use a dedicated sending-only API key for the app, not the account-wide one.
- **Alert sending (Tier A of the email journey, issues #11/#14):** `dispatchAlerts(file, source)` (`web/lib/alerts/dispatch.ts`) walks the addresses that have an entry for that source in the per-address diff (I6, the change log's own data, nothing recomputed), then each confirmed subscriber in `sub:<address_id>`, renders the one alert template with that subscriber's unsubscribe link (its stored token) and sends it. Trigger: `POST /api/alerts/dispatch {source}` with `Authorization: Bearer $DEMO_TOKEN`, called by `make alert SOURCE=…` as the last step after the production deploy is Ready (the diff is imported at build time; the script retries a 404 `unknown_source` every 10 s until the new deploy serves it). Recipient rule, data not env: demo-labelled sources go only to subscribers flagged `demo`, always; while the postal address in `disclaimer.ts` is a placeholder (closed test), real sources go only to subscribers flagged `allowed`. `make alert SOURCE=… RESET=1` clears that source's `sent:` keys for demo-flagged subscribers before triggering, so rehearsals don't use up the live take. `make notify [SEND=1]` runs the same function locally against Redis and Resend, no token. Env: `RESEND_API_KEY` (sending-only), `DEMO_TOKEN`, `ALERTS_SITE_URL`, plus the `KV_*` vars. Fallback when sending fails on stage: the simulated preview on `/changes/[id]` and the address page.
- **Subscription store (Silvan):** Upstash Redis `homerule-subscriptions` (Vercel Marketplace, free plan, created 04.10.2026), connected to project `homerule` for production, preview and development; credentials only as Vercel env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`), pulled locally with `vercel env pull` into git-ignored `.env.local`. No database for law or address data: Dimitar pushes output files to git, we deploy from here. Keys (`web/lib/alerts/store.ts`, all under `alerts:`): `pending:<token>` = JSON {email, address_id, label, created_at}, expires after 48 h; `sub:<address_id>` = hash email → JSON {email, address_id, label, confirmed_at, token, allowed, demo} (confirmed only; `token` is the random unsubscribe token, carried over from the confirm token; `allowed` = may get mail during the closed test; `demo` = the demo inbox, sole recipient of fictional sources); `allowed` = set of emails the seed script allowed (gates confirmation mails during the closed test); `sent:<source>:<address_id>:<sha256(email)[:16]>` = "1" once Resend accepted that alert (idempotency, 90 days); `rl:<ip>:<10-min window>` = signup counter (5 per window). Who may get mail is this data, set by `npm run seed-subscriber -- [--demo] <email> <ids>` (email from the argument or `DEMO_INBOX` in `.env.local`, never the repo), not an env var. Nothing else is stored. Swap for Neon Postgres if we ever need queries beyond "who follows this address".

## Audit and evaluation

Requirements: PRD scoring (Responsible design), [Done by the 12:00 freeze](PRD.md#done-by-the-1200-freeze), [Never](PRD.md#never).

- **Audit log**, `audit/*.jsonl` (git-ignored, append-only): `calls.jsonl` one line per model call (stage, document, model, request hash, seconds, cost, usage), `builds.jsonl` one line per build. Raw model responses sit in `build/cache/` keyed by request hash.
- **`make eval`** runs, and writes one report:
  - the assertion suite: brief-named rules with status and date;
  - the jurisdiction × category grid;
  - change tests T1–T6;
  - the trap addresses;
  - the quote check;
  - a crawl for "not legal advice".
- **Prompt lint** (`extract/prompts.py`, in `make eval`): no citation, date or key value from the test suite (`tests/fixtures/`, `dev/change_tests.json`) appears in any prompt literal; reviewed exceptions are listed with a reason. **Freeze:** `make freeze` writes the prompt digest to `extract/PROMPTS.lock` before the hour-16 drop; `make eval` reports whether the prompts still match it.
- **Curated audit trail** `out/audit.json` (D → S, for the rule page), one entry per `team_rule_id`: `source` (version, URL, retrieved, verbatim quote), `model` (what Luna extracted, dates as stated), `checks` (code checks, Jev overrides, gate answers with confidence, triaged conditions), `code` (status, effective dates and how they were derived, status evidence, open questions), `calls` (stage, model, request hash, cost). The `model` / `code` split is the reasoning boundary. `audit/builds.jsonl` gets one line per build (git SHA, prompt digest, counts).
- **Promotion rule:** a change to prompts or the engine is kept only if no eval component drops.

## Scaling to a new jurisdiction

Requirement: PRD scoring (Scalability).

1. Add documents and manifest rows.
2. Add one entry to the jurisdiction list.
3. Run `make all`.

The Census geocoder is national, precedence is extracted rather than hand-coded, and there is no per-city code. The hour-16 ingest is the live proof.

## Non-functional rules

- One command rebuilds everything (`make all`), under 15 min with cached extraction.
- A single document re-extracts live in under 3 min; prompts frozen before hour 16 (hash checked).
- "Not legal advice" and the as-of date in every view, email and API payload.
- Page usable on a phone; address view loads in under 2 s.
- No secrets in the repo; keys in `.env.local` and Vercel.

## Data sources to extend coverage (P1, checked 04.10.2026)

Only the Census geocoder is P0. Nothing below runs before the P0 items are green. Proxies and partial matches appear as card notes and never change a result. A source is used only if it fills a gap for ≥40 sample addresses or settles a rule directly.

| Source | Fills | Access | Effort |
|---|---|---|---|
| HUD LIHTC + Multifamily Assisted | Subsidised flag; 9 sample matches | ArcGIS REST, no key | 1 h |
| Boston parcels with income-restricted units | Subsidised flag + units, ~15 Boston rows | ArcGIS, no key | 1 h |
| Cambridge `residentialexemption`, SF `homeowner_exemption_value` | Owner-occupied proxy (note only) | Socrata, no key | 1 h |
| TIGER/Line 2025 places | Offline point-in-city check; city outline | Download (1–10 MB per state) | 1 h |
| MassGIS L3 parcels | Boston year built + units | Download, CC-BY | 2–3 h |
| SanGIS parcels | San Diego units, maybe year | Download after disclaimer | 2–3 h |
| LegiScan | Bill status (MA S.2983/H.5222) | Free key | 1 h |
| NJ MOD-IV | Year built for ~11% of NJ rows | ArcGIS, no key | 2 h |
| Berkeley Rent Registry | Hand validation only (the brief allows local lookups for validation, not as data) | Lookup only, no scraping | 1 h |
| LA RSO lookup, SF Rent Board | Hand validation of ~5 addresses | Manual | 0.5 h |

Skipped: Alameda County (no public building data, so Berkeley stays unknown, stated as a known limit) · Open States (LegiScan is enough) · data.boston.gov (blocked from Switzerland).
