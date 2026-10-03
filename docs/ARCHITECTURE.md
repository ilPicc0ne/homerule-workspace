# HomeRule architecture

How HomeRule is built. What it must do, and why, is in the product requirements; this file is the how. Status: draft, Sun 04.10.2026.

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

## Shared vocabulary: the jurisdiction list

`contracts/jurisdictions.json` holds the 13 jurisdictions in scope: 3 states (CA, NJ, MA) and 10 cities or municipalities (Los Angeles, San Francisco, San Diego, Berkeley, Santa Ana, Jersey City, Hoboken, Newark, Boston, Cambridge). Each entry has an ID (e.g. `NJ-HOBOKEN`), legal name, level (`state` or `city`) and Census place code.

Both pipelines emit only these IDs: the extraction for rules, the address resolver for addresses. A value outside the list is an error, never a new jurisdiction. This is what keeps rules and addresses joinable. The corpus has no county documents. Counties are resolved for display only.

## A · Extraction

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

Measured on all 500 (04.10.2026): 493 geocoded to the right city, 7 not geocodable to a point (6 without a house number, 1 unknown to Census) but certain from the postal city. Jurisdiction: 500/500.

Each record: `address_id`, `jurisdictions` (state, county, city IDs), `postal_city`, `coords` (or approximate), `facts {built, units, use_class, owner_type: null}`, `source` and `confidence` per field.

## C · Engine

A deterministic function of (rules, compiled predicates, resolved addresses, as-of date). The same input gives byte-identical output. Per address and rule:

1. **Jurisdiction:** the rule's jurisdiction ID is in the address's stack, else the rule is not listed.
2. **Status gate:** failed or repealed rules are never listed; pending → `pending`; an effective date after as-of → `not_yet_effective`.
3. **Coverage:** `applies_if ∧ ¬exempt_if` under three-valued logic over fact ranges. True → `applies`; unknown → `unknown` with the missing facts named; false → not listed. A building whose year equals a certificate-of-occupancy cutoff year is unknown.
4. **Precedence**, per category:
   - A state rule that yields to local rules becomes `superseded` (governed by the local rule) when the local rule applies.
   - It becomes `unknown` when the local rule's coverage is unknown.
   - Without an extracted clause, both rules apply.
5. **Conflicts:** `may_preempt_local` plus a local rule of the same category → `conflict_flag` on both.

Output: `out/lookups.json` in the challenge format, `{as_of, lookups: {address_id: [{team_rule_id, result, explanation, conflict_flag}]}}`, for all 500 addresses. Rules that don't apply are left out.

## D · Change and diff

A change is either a new document (ingest) or a second date (as-of query).

- Ingest: `make ingest DOC=<path>` runs A for that document, then C before and after.
- **Diff per address:** the before and after result lists are compared by rule ID, giving added, removed and changed results.
- One diff feeds three outputs, so they can't disagree:
  - `changes.json` (`{test_id: {affected_address_ids, conflict_flag_address_ids, notes}}`);
  - the change log on the address page;
  - the alert email (preview in P0, sending in P1).
- Change tests T1–T5 come from `dev/change_tests.json`; T6 is the hour-16 ordinance, run through the same ingest.

## Web and API

- **Hosting:** Vercel (Next.js), Pro plan, phone-first.
- **Data:** the page reads precomputed engine output, not a live computation, so the page and the scored files show the same results.
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
  - `/api/address/[id]?as_of=`: read-only JSON with `as_of`, retrieval dates and `not_legal_advice: true`.
  - Later `/api/mcp`, the same functions behind `mcp-handler`.
- **As-of other than the build date:** the engine runs at build time for the as-of dates the page offers (today, each upcoming effective date).
- **Email (P1):** subscriptions per address ID with double opt-in. Sent after a rebuild from the diff, through a transactional mail service.
- **Database:** subscriptions (and any stored state) live in a managed Postgres. Dimitar picks the provider (open). Supabase (EU region) and Vercel's marketplace Postgres are the candidates.

## Audit and evaluation

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

1. Add documents and manifest rows.
2. Add one entry to the jurisdiction list.
3. Run `make all`.

The Census geocoder is national, precedence is extracted rather than hand-coded, and there is no per-city code. The hour-16 ingest is the live proof.
