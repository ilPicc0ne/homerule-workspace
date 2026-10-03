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
| I1 | `contracts/jurisdictions.json`: 13 rule-bearing IDs (e.g. `NJ-HOBOKEN`) plus display-only county entries; each with legal name, level, `parent` (city → county → state), Census code, `schema_name` (the exact string the rule schema expects, e.g. "San Francisco, CA") and `aliases` ("Dorchester", "SF", "Jersey City NJ") | S → D, S | Only these IDs internally; `rules.json` writes `schema_name`; search resolves names and aliases through it |
| I2 | `out/rules.json` + `out/rules.compiled.json` | D → S | Schema-valid; `jurisdiction` = the list's `schema_name`; status mapped to the schema values (`enacted_not_effective` → `not_yet_effective`, `repealed` → `failed`); effective date or null (two dates kept when sources disagree); verbatim quote |
| I3 | `out/addresses.resolved.json` | S → engine, D eval | All 500; jurisdiction IDs, coords, facts as ranges, source + confidence |
| I4 | Engine CLI `build --as-of <date>` | S → eval, web | Deterministic; writes `lookups.json` and `changes.json` in the guide's shapes |
| I5 | `/api/address/<id>?as_of=` | S → page, email, MCP | Same data as `lookups.json`; `as_of`, retrieval dates, `not_legal_advice: true` |
| I6 | Per-address diff | S → changes, change log, email | One computation feeds all three |

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
  | {fact: "units"|"built"|"use_class"|"jurisdiction"|"owner_type"|"owner_occupied"|"subsidised",
     op: "eq"|"ne"|"lt"|"le"|"gt"|"ge"|"in", value: string|number|string[]}
  | {age_years: {op: "lt"|"le"|"gt"|"ge", n: number}}   // relative to the as-of date
  | {ref: string}                                        // another rule's result, e.g. local rent control
  | {unparsed: string};                                  // evaluates to unknown

type Compiled = { team_rule_id: string; jurisdiction: string; level: "state"|"city";
  category: string; status: "in_force"|"enacted_not_effective"|"pending"|"failed"|"repealed";
  effective: {from: string|null; precision: "day"|"month"|"year"};
  applies_if: Node; exempt_if: Node; tenant_conditions: string[];
  interaction: {type: "none"|"yields_to_local"|"coexists"|"may_preempt_local", target_category?: string, quote?: string};
  retrieved_at: string; parse_status: "ok"|"partial"|"failed" };
```

## B · Address resolution

Requirements: PRD [scoring](PRD.md#what-we-must-get-right-scoring): Address coverage.

Input: `data/sample_addresses.csv`. Output: `out/addresses.resolved.json`.

1. **Normalise** the street: strip leading zeros in ordinals ("05TH AV" → "5TH AVE"), take the first of double addresses ("600 JACKSON/601 HARRISON"), drop lot suffixes.
2. **Census geocoder**, one geographies call per address (the batch endpoint returns no city name): street, city, state. The ZIP is sent for CA and MA but never for NJ, because the NJ ZIPs in the data are owners' mailing ZIPs.
3. **Reject contradictions.** A Census city that contradicts a non-neighbourhood postal city is rejected, and the address gets a review flag.
4. **Fallback:** a neighbourhood table (Dorchester, Roxbury, … → Boston; San Ysidro → San Diego), else the CSV city, with lower confidence.
5. **Building facts as ranges:**
   - year built y → [y-01-01, y-12-31];
   - units from `units`, else parsed from the use description ("5B-20U", "APT 7-30 UNITS", "(5+ units)");
   - conflicting facts → unknown plus a flag;
   - owner type is always unknown.

Further rules:
- **Unknown, not omitted:** missing year or units, or a build year equal to a certificate-of-occupancy cutoff year (SF 1979, LA 1978), gives `unknown`.
- **Owner type** is never in the data, but it shouldn't spread unknowns: where an owner-type exception also needs a unit count the building can't meet (CA small-landlord deposit exception), the rule `applies` and the explanation says why the exception can't apply.
- **County:** resolved for display only. No county documents in the corpus; county tenant ordinances in scope cover unincorporated areas only [assumed, check LA County], and all 500 addresses are in incorporated cities. The page says "No county rules for addresses inside <city>".
- **Tenant facts** (12 months' tenancy, owner-occupied duplex) are notes on the card, never inputs.

Measured on all 500 (04.10.2026): 493 geocoded to the right city, 7 not geocodable to a point (6 without a house number, 1 unknown to Census) but certain from the postal city. Jurisdiction: 500/500.

Each record: `address_id`, `jurisdictions` (state, county, city IDs), `postal_city`, `coords` (or approximate), `facts {built, units, use_class, owner_type: null}`, `source` and `confidence` per field.

## C · Engine

Requirements: PRD scoring (Address coverage); interface I4.

A deterministic function of (rules, compiled predicates, resolved addresses, as-of date). The same input gives byte-identical output. Per address and rule:

1. **Jurisdiction:** the rule's jurisdiction ID is in the address's stack, else the rule is not listed.
2. **Status gate:** failed or repealed rules are never listed; pending → `pending`; an effective date after as-of → `not_yet_effective`.
3. **Coverage:** `applies_if ∧ ¬exempt_if` under three-valued logic over fact ranges. True → `applies`; unknown → `unknown` with the missing facts named; false → not listed. A building whose year equals a certificate-of-occupancy cutoff year is unknown.
4. **Precedence**, per category:
   - A state rule that yields to local rules becomes `superseded` (governed by the local rule) when the local rule applies.
   - It becomes `unknown` when the local rule's coverage is unknown.
   - Without an extracted clause, both rules apply.
5. **Conflicts:** `may_preempt_local` plus a local rule of the same category → `conflict_flag` on both.

Output: `out/lookups.json` in the challenge format, `{as_of, lookups: {address_id: [{team_rule_id, result, explanation, conflict_flag}]}}`, for all 500 addresses. Rules that don't apply are left out. Each result also carries a `confidence` (rule confidence × fact confidence) for the cards and the API; extra fields are dropped if the scorer rejects them.

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

## Web and API

Requirements: PRD [the address page](PRD.md#the-product-one-address-page), [priorities](PRD.md#priorities-and-feature-status), [user journeys](PRD.md#user-journeys).

- **Hosting:** Vercel (Next.js), Pro plan, phone-first.
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
  - `/api/resolve?q=`: free text (address, city, neighbourhood, county, state) → address ID, jurisdiction ID, or `{covered: false}`.
  - `/api/address/[id]?as_of=`: read-only JSON with `as_of`, retrieval dates and `not_legal_advice: true`.
  - Later `/api/mcp`, the same functions behind `mcp-handler`.
- **As-of dates:** the engine runs at build time for a fixed list: 2025-12-31 and 2026-01-02 (T1), 2026-10-01 (default), and each effective date in the rules ±1 day. The picker snaps to this list.
- **Email (P1):** subscriptions per address ID with double opt-in. Sent after a rebuild from the diff, through a transactional mail service.
- **Subscription store (Silvan):** Upstash Redis from the Vercel Marketplace, free tier [assumed]. Keys: `sub:<address_id>` = set of confirmed emails; `pending:<token>` = email + address ID with a 48 h expiry for double opt-in. Nothing else is stored. Swap for Neon Postgres if we ever need queries beyond "who follows this address".

## Audit and evaluation

Requirements: PRD scoring (Responsible design), [Done by the 12:00 freeze](PRD.md#done-by-the-1200-freeze), [Never](PRD.md#never).

- **Audit log**, `audit/*.jsonl`, append-only: one line per model call and per build (stage, document, model, prompt hash, input hash, verdicts, rule IDs, cost, git SHA). Raw model outputs sit in `audit/raw/`.
- **`make eval`** runs, and writes one report:
  - the assertion suite: brief-named rules with status and date;
  - the jurisdiction × category grid;
  - change tests T1–T6;
  - the trap addresses;
  - the quote check;
  - a crawl for "not legal advice".
- **Prompt lint:** no citation, date or key value from the assertion suite appears in any prompt. Prompts are frozen before the hour-16 drop (hash checked).
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
