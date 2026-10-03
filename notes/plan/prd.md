# HomeRule PRD (draft 4, Sun 04.10.2026) — the master document

This PRD is the single source for scope, priorities and owners. The how lives in `docs/ARCHITECTURE.md`. Earlier plans (`notes/plan/archive/`) are superseded.

Short product requirements for the c2 build. The build detail stays in `spec.md`. This file says **what must be true** and **why**. Sources: brief PDF (`data/brief/…`, cited p.N), participant guide (`data/realpage-starter/README.md`, cited G§N), pack PDF "discussion draft" (cited DD p.N), `dev/change_tests.json` (CT). Tags: [verified] · [assumed] · [unknown].

## Problem statement

US rental law is layered: state statute, county and city ordinance, each with its own coverage tests, effective dates and exemptions [verified p.2]. Whether a protection covers one apartment depends on the exact legal city, the building's age and size, and the date you ask. The source text is public, but nobody reads municipal codes and pending bills by hand to answer "what applies to my building today". So renters don't know which cap governs, small owners don't know their obligations, and advocates can't see which buildings a bill would reach [verified p.2, as the brief's claim; no user evidence of our own, assumed]. General chatbots make it worse: they answer from a training snapshot, so they confuse pending with enacted law, miss effective dates, and miss struck measures [assumed; we haven't measured it, S2a would].

## Job to be Done

When **I'm holding a rent-increase notice, a deposit demand or an eviction notice for a specific apartment**, I want **to see which published rules cover my building today and what is about to change, quoted from the law itself**, so I can **go to a clinic or answer the landlord with the right rules and the right questions, without reading three layers of code**. HomeRule does not judge the notice itself (no rent-vs-cap comparison, no lease facts).

Secondary job (advocate or agency): when **a bill or ordinance changes**, I want **the list of buildings it reaches and from when**, so I can **target outreach** [verified as a brief user group p.2; job wording assumed].

## Demand evidence

None from renters in the repo. The judging rubric is the demand here [verified p.6]; the sponsor's stated outcome is a public rule dataset [verified p.5]. Cheapest real check: show the beat-1 card on Discord or to a RealPage person before the freeze and ask which persona they judge for.

## Users

| Segment | Role in the build | Evidence |
|---|---|---|
| Renter | Primary; the demo persona | Brief user group 1 [verified p.2]; team choice D7 (tentative) |
| Advocate / agency | Free view from Module C (affected-address lists) | [verified p.2] |
| Small housing provider | Wording only; no "compliant" badge, no exemption filter | [verified p.2]; evasion risk [verified p.5] |
| Judges | The real buyer of this build: 75 pts by script, 25 by demo | [verified p.6] |

No interviews with any of these. Every job claim beyond the brief is [assumed].

## Root cause vs. symptom

Presenting symptom: "I can't find out which rules apply to my apartment."
Underlying driver: applicability is a **function of (legal address, building facts, date)** over law that changes. Search and chat return documents or a remembered summary, not that function. For more than half the rows, the missing input is building facts, not law (San Diego, Berkeley, most of NJ, Boston "A/" codes) [verified CSV]. Three sub-drivers, each a trap the scoring tests: postal city ≠ legal city; enacted ≠ in effect ≠ pending ≠ struck; missing building facts get guessed instead of reported as unknown [verified G§4.1, CT T1–T5, p.5].

## Alternatives scanned

1. **Do nothing / read the codes by hand**: correct, but hours per address. We beat it on time, and match it on traceability by quoting the source text.
2. **Local program lookups** (LA RSO lookup, SF Rent Board): authoritative, but one city and one rule family each, and no state layer, no dates ahead, no pending bills [verified p.4]. We cover all layers and treat these as validation sources only.
3. **State tenant guides** (NJ DCA "Truth in Renting", the Mass.gov / AG guide, the CA DCA guide) and **legal-aid self-help sites** (LawHelp): free, authoritative and plain-language, but state-level and not per address: no local layer, no building test, no dates ahead. We answer for one building on one date.
4. **Commercial 50-state surveys** (Westlaw/Lexis, NAA): the incumbent for providers; paywalled, per topic, not per address.
5. **Legal aid clinic or tenant hotline** (non-software): the real answer for a dispute, but capacity-bound. HomeRule is the intake sheet *before* the clinic, not a replacement.
6. **General chatbot (ChatGPT / Claude without tools)**: instant and fluent, but answers from memory with no as-of date and no quotes. We beat it by deterministic, dated, quoted answers, and we serve them to the chatbot via MCP instead of competing with it.
7. **Naive RAG over the corpus** (what most teams will build) [assumed]: lets the model decide coverage and precedence. We extract once into rule records and decide coverage in code (decision 0002), so answers are reproducible and unknowns stay unknown.

## Requirements

Every requirement maps to points. Scored = by script (75), judged = by demo (25) [verified p.6].

### R1 Extraction accuracy · 25 pts · owner **Dimitar (first step)**

- R1.1 Automated extraction from the 87-doc corpus into `schema/rule_record.schema.json`; nothing hand-coded; the pipeline is shown live in the demo [verified G§3, p.5].
- R1.2 One record per jurisdiction × category × cited section, [assumed granularity], so records join the held-out key on **jurisdiction, category and citation** [verified p.6]; then field accuracy on **date, status, key value, citation**.
- R1.3 Statuses kept apart: in force, enacted not yet effective, pending, failed (IP 25-21 recorded as failed, CT T5) [verified].
- R1.4 "No rule at this level" only where a text bars the rule (e.g. MA c.40P); never invent rules or citations [verified p.5]. How the 19 "no rule" findings are represented: [unknown].
- R1.5 Six categories, three states, ten cities incl. Santa Ana (extraction only) [verified p.3, G§4.1].
- R1.8 **Document → jurisdiction mapping comes from the manifest** [verified: `corpus_manifest.csv`]: each of the 87 docs has exactly one jurisdiction, and the 13 distinct values are exactly the 13 in the jurisdiction list (T1). Levels in the corpus are state and city only; no county documents. The classifier does not re-decide a document's jurisdiction; it tags rules inside a document that refer to another level (e.g. a state rule that yields to local rent control) and flags any rule whose jurisdiction disagrees with its document.
- R1.9 **Documents in scope:** 55 with official text are extracted; 23 link-only (law firm, news) are skipped and logged; 9 code-publisher pages marked `check-terms` are extracted only if their text is supplied, never fetched [verified: manifest].
- R1.6 Precedence comes from the extracted `overrides` / `interaction`, not a hand table [assumed: needed to stay "automated"].
- R1.7 **Fill the 13 × 6 grid.** The key holds 58 rules + 19 "no rule" = 77 items [verified p.3]; 13 jurisdictions (3 states + 10 cities) × 6 categories = 78 cells. Hypothesis: one key item per cell, so every cell gets one rule or one explicit "no rule" [assumed, ~70%]. First step: build the grid against `corpus_manifest.csv` and mark which cells have source text.
- Target: ≥22 of the ~27 brief-named rules with correct status and date, and ≥70 of 78 grid cells filled [assumed bars; no dev key in the pack].

### R2 Address coverage · 20 pts · owner **Silvan (first step)**

- R2.1 All 500 addresses in `lookups.json` in the guide's shape: `{as_of, lookups: {address_id: [{team_rule_id, result, explanation, conflict_flag}]}}` [verified G§5]. Rules that don't apply are left out.
- R2.2 `result` ∈ applies · unknown · superseded · not_yet_effective · pending [verified G§5]. Default as-of 2026-10-01.
- R2.3 Legal jurisdiction resolved, not taken from `postal_city`: 37 Boston neighbourhood rows, San Ysidro → San Diego, Van Nuys-type LA rows, NJ ZIPs that are owner mailing ZIPs (A0256 Hoboken carries East Orange 07017) [verified CSV]. The guide's "Van Nuys" example does not occur: all 80 LA rows say Los Angeles [verified CSV], but the resolver must handle it for typed addresses.
- R2.7 **Address mapping, in order:** (1) Census geocoder single-address call with street, city, state; ZIP only for CA (not SF) and MA (not Cambridge), never NJ; (2) if no exact match: neighbourhood table (9 Boston names → Boston, San Ysidro → San Diego); (3) NJ fallback: CSV municipality. Each address gets a jurisdiction ID from the list (T1), coordinates, `legal_city_source` and confidence. Every postal ≠ legal pair is logged; the count is a demo stat. Acceptance: all 37 neighbourhood rows → Boston, zero NJ rows outside NJ, ≥95% resolved by Census. **Measured Sun 04.10. on all 500** [verified: live run]: 485 matched the expected legal city (97%), 14 no match (SF 7, Boston 5, Hoboken 1, San Diego 1) → fallback to the table/CSV city with lower confidence; 1 wrong city: A0009 "322 Western Ave, Cambridge" matched a Boston street of the same name (no ZIP sent for Cambridge). Rule: a Census city that contradicts a non-neighbourhood postal city is rejected → CSV city + review flag. **Normalising before the call fixes 8 more** [verified: retry]: strip leading zeros in ordinals ("05TH AV" → "5TH AVE", 6 SF rows), split double addresses ("600 JACKSON/601 HARRISON" → first), send the ZIP for A0009 (02139) → 493/500 geocoded to the right city. The last 7 can't be geocoded to a point: 6 have no house number ("WILLOWWOOD ST", "Harvard ST LOT 2A-13"), 1 (21 Guerrero St) is unknown to Census. Their jurisdiction is still certain from the postal city (Dorchester/Roxbury → Boston, SF, San Diego), so **jurisdiction is 500/500**; the map shows them as "approximate location". 
- R2.8 **Building facts:** year built → range (year → whole year); units from `units`, else parsed from the use description ("5B-20U", "APT 7-30 UNITS", "(5+ units)") behind a flag; conflicting facts (A0227: units 2 vs "93U") → unknown plus a review flag; owner type always unknown.
- R2.9 **County level:** the county comes from the Census geocoder (verified: Suffolk, Essex). The corpus has no county documents [verified: manifest], and county tenant ordinances in scope (LA, Alameda, San Diego County) cover unincorporated areas only [assumed]; all 500 addresses are inside incorporated cities. The stack shows the county with "No county rules for addresses inside <city>". No external county sources.
- R2.4 Unknown over omission: a missed "applies" costs 2×; unknown earns partial credit [verified p.6]. Missing year or units, and a build year equal to a certificate-of-occupancy cutoff year (SF 1979, LA 1978), give `unknown` [verified G§4.1].
- R2.4a **Owner type is absent, but don't let it spread unknowns.** Where an owner-type exception also needs a unit count the building can't meet (CA small-landlord deposit exception, ≤4 units [assumed threshold, check D-text]), the rule `applies` and the explanation says why the exception can't apply [verified G§4.1: "answer unknown or explain why the exception can't apply"; p.3 mock-up: deposit applies at 20 units]. Unknown only where owner type actually decides it.
- R2.5 `superseded` only where a stricter rule at another level governs, and the answer says which [verified p.2, G§5].
- R2.6 `explanation` per answer, in plain words, from the rule record only.

### R3 Citations · 15 pts · D

- R3.1 Every `applies` answer carries a source doc and a quoted span that is a verbatim substring of the corpus text [verified p.6]. Spans are copied raw (NBSP, curly quotes).

### R4 Change tracking · 15 pts · S (T6 ingest: D)

- R4.1 `changes.json`: `{test_id: {affected_address_ids, conflict_flag_address_ids, notes}}` [verified G§5], built by the same engine as lookups.
- R4.2 T1 date flip, T2 city boundary, T3 not-yet-effective plus conflict flags on Jersey City and Hoboken, T4 pending for all MA, T5 empty set [verified CT].
- R4.3 An as-of-date query in CLI and UI [verified p.2].
- R4.4 **T6 is a Must.** The brief scores "T1–T6" and wants the hour-16 run in the videos [verified p.6]. The pack's PDF says five tests and "no mid-event release required" (DD p.2, p.4), but the brief governs the event. One-command ingest; it doubles as scalability proof. Ask on Discord for the drop time, not whether it counts.
- R4.5 **Bonus: surface the four open questions in G§9** [verified G§9]: Berkeley 13.63 has two published effective dates; the FAIR Act may preempt JC/Hoboken; the LA RSO formula has two effective dates; the CA screening-fee cap has no single 2026 figure. Show them as conflict flags with both sources, never pick one.

### R5 Plain language and usability · 10 pts judged · S

The product is one **address dashboard**: the renter enters an address and sees the common questions answered. No chatbot.

**The six questions** (one card each; one per scored category; exact enum strings from `rule_record.schema.json`, only `security_deposits` confirmed so far):

| Category | Card heading | Card parts |
|---|---|---|
| Rent increase limits | How much can my rent go up? | Governing rule, cap, why the other level is replaced or doesn't apply |
| Just-cause eviction | When can they end my tenancy? | Allowed reasons · notice · relocation money (R5.7) |
| Security deposits | How much deposit can they ask? | Maximum, exceptions, return rules |
| Application and screening fees | What can they charge me to apply? | Fee cap, allowed upfront charges, broker fee (MA) |
| Screening restrictions | What can they check about me? | Criminal history, source of income, timing |
| Algorithmic rent-setting | Can rent-setting software be used on my rent? | Covered software, what's banned, effective date |

**Page layout, top to bottom:**

| # | Section | Content | Prio |
|---|---|---|---|
| 1 | Header | "Not legal advice" · as-of date with picker | P0 |
| 2 | Address field | Autocomplete over the 500 sample addresses; example chips (the five Q1 buildings) on the landing page | P0 |
| 3 | Subscribe | "Email me when the law changes for this address" (R5.8) | P0 form + preview, P1 sending |
| 4 | Map | Small map with a pin from the Census coordinates (Leaflet + OpenStreetMap tiles) | P1; city boundary outline P2 |
| 5 | Where this is | State › County › City, rules added per level; note when postal city ≠ legal city | P0 |
| 6 | Building facts | Year built · units · source and retrieval date; "unknown" plainly; one-question prompt (P1) | P0 |
| 7 | Summary chips | Six categories as counts: applies / unknown / changing / none | P0 |
| 8 | Today | The six question cards, each naming the level the rule comes from; "new since" marker | P0 |
| 9 | Coming up + changes | Timeline (not yet effective, pending, conflicts); change log old → new | P0 |
| 10 | Footer | How this works (sources, audit, method note) · disclaimer again | P0 |

- R5.1 **Today:** jurisdiction stack (with "postal Dorchester → legal Boston" note), then six cards headed with renter questions; category name as a small label. Each card: status in words, one-line summary, quote, citation, retrieval and as-of date. Changes from the last 12 months marked "new since <date>".
- R5.2 **Outlook:** enacted but not yet effective, and pending bills ("proposed, not law"), as a timeline; as-of slider.
- R5.3 **Unknown is never a dead end:** the card names the missing building fact and how to check it. Tenant-level conditions (12 months' tenancy, owner-occupied duplex, subsidised housing) stay as notes on the card, never questions.
- R5.4 Six category chips at the top as a count ("4 of 6 apply, 1 unknown, 1 changing on 01.07.2027"). The renter-protection score builds on them (P1, below).
- R5.5 Input is the address only. Every rule in scope is per building; no unit or floor number needed [verified: coverage facts in schema and G§4.1 are building facts].
- R5.6 Stretch: Spanish summaries [verified p.3].
- R5.7 The eviction card has three parts: allowed reasons · notice · relocation money. All three sit inside the just-cause category [verified DD p.3: "allowed causes, notice, relocation assistance"]. Notice shows the rule ("30 days' written notice"), never a computed deadline. Corpus: CA state, LA, SD, SF, Berkeley, Santa Ana, MA, Boston, Cambridge; NJ cities only via the state guide; no relocation text for Boston/Cambridge [verified: corpus check, D023 D040 D041 D043 D050 D051 D058 D067 D073 D079 D082 D083]. Repairs (the most-asked hotline topic) has almost no corpus text, so no card.
- R5.8 "Email me when the law changes for this address" sits at the top, right under the address.

### Product priorities

| Prio | Item | Serves |
|---|---|---|
| P0 | Engine + rules.json, lookups.json, changes.json | 75 auto |
| P0 | Address dashboard (R5.1–R5.5) with address lookup over the 500; reads precomputed engine output via a read-only JSON endpoint per address (`/api/address/<id>?as_of=`); "not legal advice" on every view and payload | 20 judged |
| P0 | **Change log + email preview:** a demo-only trigger (`make ingest DOC=…`, or an admin button behind a secret, never public) ingests a new doc, rebuilds, and computes per address before vs after (the same diff changes.json needs). The page shows a "Changes" log (old → new, highlighted) and a rendered preview of the alert email: new rule, status, effective date, quote, citation, as-of, "not legal advice" | Module C made visible, Usability |
| P1 | **Real email sending:** subscriptions per building (address ID), double opt-in, unsubscribe, disclaimer in every mail; sent from the same diff. Demo: subscribe to a Cambridge address, run the hour-16 ingest live, the mail arrives. Only our own addresses get mail during the event. ~2 h (Supabase + a sender). Fallback: .ics calendar file. Never a form that collects emails without sending | Usability |
| P1 | **Renter-protection score + comparison:** scores which protections apply ("8 of 12 apply"), per category, formula shown; unknown counted separately, never as zero. Compare a building against others in its city and other cities in the sample (for someone deciding where to move). Protections only: no rent levels (no rent data; pricing data barred, p.5). Never a verdict on a landlord or place | Usability, Innovation |
| P1 | **One missing building fact** answered by the renter (e.g. year built), marked "you told us", re-evaluated in the page, never written to lookups.json | Usability, Responsible |
| P2 | MCP route (read-only, `mcp-handler`, ~45 min), same functions as the JSON endpoint. Manual connector setup in Claude/ChatGPT | Innovation, Scalability |
| P2 | Compare view: one question across several addresses | Demo Q1 |
| P3 | ChatGPT integration: custom GPT with an Action on our OpenAPI description (~1 h); a shared GPT link may be the one-click path MCP lacks [assumed, test] | Innovation |
| Idea | Own chatbot (redundant with the dashboard; the likely follow-ups are comparisons and advice we must not give) · typed addresses outside the 500 · neighbourhood-level comparison (area within a city) · repairs/habitability card once the corpus has text | — |

### R6 Responsible design · 10 pts judged · both

- R6.1 "Not legal advice" on every interface, incl. print and MCP payloads [verified p.5, G§3].
- R6.2 As-of date on every answer; source and retrieval date on every rule; enacted separated from pending [verified p.5].
- R6.3 Conflicts and low confidence flagged for human review, not decided by a model (decision 0003).
- R6.4 Auditable log of sources, model outputs and changes; another person can reproduce the result [verified p.5, DD p.6].
- R6.5 Never "compliant" / "illegal", never advice on avoiding a rule [verified p.5].
- R6.6 Stretch: audit view per answer showing source, retrieval date, as-of date and **reasoning boundary** [verified DD p.2]. Cheap with our records; worth it.

### R7 Scalability path · 5 pts judged · S

- R7.1 New jurisdiction = documents + manifest rows; no per-city code; Census is national. Proof: T6 ingest or a typed address outside the sample (C4).

### R8 Submission package [verified p.5–6, DD p.6]

rules.json · lookups.json · changes.json · GitHub repo with README and outputs · live demo link · three videos (team, demo, technical) showing scores and T1–T6 · **one-page method note** (only in the pack PDF, DD p.6) · score report on screen. score.py is not in the pack [verified]; until it is released, our own assertion suite stands in.

## Technical requirements (what must hold; the how lives in `docs/ARCHITECTURE.md`)

### Owners

| Area | Owner |
|---|---|
| Data pipeline up to `rules.json`: corpus triage, Jev classification, field extraction, quote check, statuses, hour-16 ingest | **D** |
| Jurisdiction list (the shared vocabulary), address lookup, building facts | **S** |
| Engine: rules × addresses × as-of → `lookups.json`, `changes.json`, per-address diff | **S** |
| Dashboard, change log, email, later the protection score | **S** |
| Eval suite and audit log | D, S adds the engine tests |

### Interfaces (frozen before parallel work starts)

| ID | Interface | Producer → consumer | Must hold |
|---|---|---|---|
| T1 | **Jurisdiction list** `contracts/jurisdictions.json`: 13 entries (3 states, 10 cities/municipalities) with ID (e.g. `NJ-HOBOKEN`), legal name, level, Census place code | S → D, S | Classifier and address lookup emit only these IDs; anything else is an error, not a new value |
| T2 | **Rule records** `out/rules.json` (schema-valid) + `out/rules.compiled.json` (coverage conditions as machine-checkable predicates; unparsed parts marked, never dropped) | D → S | 100% schema-valid; every rule has jurisdiction ID, category, status, effective date or null, quote that is a substring of its source doc |
| T3 | **Resolved addresses** `out/addresses.resolved.json`: legal jurisdiction IDs, coordinates, building facts as ranges, source and confidence per fact | S → engine, D eval | All 500 present; postal ≠ legal logged; NJ never resolved via ZIP |
| T4 | **Engine** CLI `build --as-of <date>`: deterministic, same input → byte-identical output | S → D eval, web | Writes `lookups.json` and `changes.json` in the guide's shapes (G§5) |
| T5 | **Address JSON** `/api/address/<id>?as_of=`: what the dashboard, email and later MCP read | S | Same data as `lookups.json`; carries `as_of`, retrieval dates, `not_legal_advice: true` |
| T6 | **Diff** per address: before/after rule set for a change | S | Feeds `changes.json`, the change log and the email from one computation |

### Non-functional

- N1 One command rebuilds everything from the corpus (`make all`); cached extraction keeps it under 15 min.
- N2 Extraction is automated end to end; a single document can be re-extracted live in the demo in under 3 min (G§3, p.5).
- N3 Hour-16 ingest in one command; prompts frozen before the drop (prompt hash checked).
- N4 Audit log: one line per model call and per build (source, model, prompt hash, output, timing) (p.5).
- N5 "Not legal advice" and the as-of date in every view, email and API payload (p.5).
- N6 Page usable on a phone; address view loads in under 2 s (reads precomputed data).
- N7 No secrets or private data in the repo; public repo via the filtered export.

### Acceptance checks (run by `make eval`)

- A1 Assertion suite: ≥22/27 brief-named rules with correct status and date; ≥70/78 jurisdiction × category cells filled (rule or "no rule").
- A2 Change tests: T1 flip at the boundary dates, T2 per-city sets, T3 flags on Jersey City + Hoboken, T4 pending for all MA, T5 empty, T6 within 10 min of the drop.
- A3 Trap addresses: the five Q1 buildings give the answers in the demo table; Dorchester → Boston; Newark row with a foreign ZIP → Newark.
- A4 100% of `applies` answers carry a verbatim quote from the corpus.
- A5 Crawl finds "not legal advice" on every route, email template and API payload.

## Data sources to extend coverage (checked Sun 04.10.2026 ~00:30)

Only the Census geocoder is P0 (part of R2 address lookup). Everything else is P1, used only if it fills a gap for ≥40 sample addresses or settles a rule's coverage directly. Owner per row to assign. Live checks by agent [verified: live call] unless tagged.

**Finding:** NJ ZIPs in the CSV are the owner's mailing ZIP (MOD-IV `ZIP_CODE`); e.g. 834-836 Raymond Blvd, Newark: CSV 08805, Census 07105 [verified]. Never key on ZIP for NJ.

| Source | Fills | Access | Effort | Prio | Owner |
|---|---|---|---|---|---|
| Census geocoder, single-address geographies call (batch returns no city name) | Legal city, county, coordinates for all 500; map pin | No key [verified: Dorchester → Boston, Newark → Newark] | 1 h | **P0** | S |
| HUD LIHTC + Multifamily Assisted (ArcGIS REST) | Subsidised-housing flag; 9 sample matches (SF 4, Boston 2, JC 2, LA 1) | No key [verified] | 1 h | P1: settles affordable-housing exemptions | |
| Boston parcels with income-restricted units (ArcGIS) | Subsidised flag + unit counts, ~15 Boston rows | No key [verified]; last edited Apr 2023 | 1 h | P1 | |
| Cambridge `residentialexemption`, SF `homeowner_exemption_value` | Owner-occupied **proxy** (exemption ≠ proof of occupancy), 50 Cambridge + 80 SF rows | Socrata, no key [verified: field exists] | 1 h | P1, card says "proxy" | |
| TIGER/Line 2025 places (CA 9.9 MB, NJ 2.9 MB, MA 1.2 MB) | Offline point-in-city check; city outline on the map | Download [verified] | 1 h | P1 | |
| MassGIS L3 parcels | Boston year built + units ("A/" rows) [assumed: field docs] | Download, CC-BY | 2–3 h | P1 (MA answers barely depend on it) | |
| SanGIS parcels | San Diego units; year built maybe only "effective year" [assumed] | Download after disclaimer | 2–3 h | P1 | |
| LegiScan | Bill status for MA S.2983/H.5222 (in Ways and Means, last action 12.03.2026 [verified: URL]) | Free key | 1 h | P1 | |
| NJ MOD-IV (ArcGIS) | Year built for ~11% of NJ rows; no units field | No key [verified] | 2 h | P1, low value | |
| Berkeley Rent Registry | Units + rent-control status, by hand for a few rows | Lookup only, no bulk; don't scrape | 1.5 h | P1 hand subset | |
| LA ZIMAS RSO lookup, SF Rent Board portal | Validation of ~5 addresses | Manual only (brief: validation only) | 0.5 h | P1 validation | |
| Skip / idea | Alameda County (no public building data → Berkeley stays unknown, stated as a known limit) · Open States (LegiScan enough) · data.boston.gov (blocked from CH, Cloudflare 1009) · NJ DCA inspection lookup (idea) · SF Rent Board housing inventory (block-level only, idea) · LA/SF assessor (no gap) | | | | |

## Technical approach

Moved to `docs/ARCHITECTURE.md` (extraction with Jev classification, address resolution, engine, change/diff, web, audit). Decisions that stay here:
- **Classifier:** Jev (typesafe.ai) for category, level, jurisdiction and status; a frontier model for fields that need verbatim quotes. Vendor claims unverified; 5-document test first; fallback = frontier model.
- **Deployment:** Vercel (Silvan's Pro plan) for the web and API. Database for subscriptions: managed Postgres, provider decided by Dimitar (Supabase EU or Vercel marketplace Postgres).

## User journeys (end user only; technical flows in `docs/ARCHITECTURE.md`)

**J1 · What applies at my address (P0).** Ana rents at 3515 Fillmore St, SF, and got a rent-increase notice. She opens HomeRule, types "3515 Fill…", picks the suggestion. The page shows California › San Francisco, "built 1926 · 21 units", the six chips and all six question cards; the example here is the card "How much can my rent go up?": SF Rent Ordinance applies, the state cap is replaced by the stricter local rule, with the quote and citation. She knows which rule to bring to the clinic.
- Given address A0016 and as-of 01.10.2026, when she opens its page, then the rent card shows SF ch. 37 `applies` and Civ. §1947.12 `superseded`, each with a verbatim quote, citation, retrieval date and "not legal advice".
- Evidence: brief p.3 mock-up [verified, illustrative]; renter need [assumed]. Instruments: A3 trap test; time from landing to answer (target ≤60 s with a non-team tester).

**J2 · An honest unknown (P0; answering it P1).** Marco rents at 10635 Sherman Grove Ave, LA, built 1978. The rent card says "Unknown: depends on whether the certificate of occupancy is dated on or before 01.10.1978", with how to check it (LA Housing Department lookup, landlord). In P1 he can enter the date himself; the card re-evaluates, marked "you told us", and nothing is written back to the scored files.
- Given A0107, when the page loads, then the LA rent-control rule is `unknown` with the missing fact named and a check path, never omitted and never guessed.
- Evidence: G§4.1 cutoff-year rule [verified]. Instruments: count of unknowns with a named missing fact (target 100%).

**J3 · What's coming (P0).** A tenant at 327 Jackson St, Hoboken, opens the "Coming up" timeline: the NJ FAIR Act takes effect 01.07.2027, with a flag that it may conflict with Hoboken's own ban. She drags the date to 02.07.2027; the card flips to applies and the conflict flag stays visible, undecided.
- Given A0256, when as-of moves from 01.10.2026 to 02.07.2027, then the FAIR Act moves from `not_yet_effective` to `applies` and carries `conflict_flag` naming the Hoboken rule.
- Evidence: CT T3 [verified]. Instruments: A2 change test T3.

**J4 · Tell me when the law changes (P0 preview, P1 real mail).** A tenant at 134 Oxford St, Cambridge, clicks "Email me when the law changes for this address" at the top of the page and confirms by email. Later a new ordinance is ingested; the page's change log shows old → new, and the email arrives with the new rule, its effective date, quote, citation and "not legal advice".
- Given a subscription on A0010 and the hour-16 ordinance, when the ingest and rebuild run, then the address's diff is non-empty, the change log shows it, and exactly one email goes to that subscriber with the same content.
- Evidence: brief p.4–5 hour-16 test [verified]; demand for alerts [assumed]. Instruments: time from ingest start to email received (target <10 min); email content equals the diff.

**J5 · Compare before I move (P1).** Someone choosing between two apartments opens both pages and the comparison view: protections that apply, unknown and coming up, per building and against the city average. No rent levels, no grade for landlords.
- Given two addresses, when compared, then each category shows applies / unknown / coming per building, unknowns counted separately.
- Evidence: [assumed]. Instruments: none yet; built only after J1–J4 pass.

## Demo case: renter questions

The demo follows a renter's questions; each is a card on the dashboard. Expected answers come from the brief and guide, not yet from our engine [assumed until extraction runs]. The five Q1 addresses also become engine trap tests.

**Q1 "How much can my rent go up?"** (the spine: same question, five buildings, five correct answers)

| Address | Facts | Expected answer | Shows |
|---|---|---|---|
| A0016, 3515 Fillmore St, SF | 1926, 21 units | SF Rent Ordinance applies; state cap superseded | Local rule governs, with the reason |
| A0081, 145 Taylor St, SF | 2005, 69 units | No SF rent control; state 5% + CPI (max 10%) applies | Same city, built after 1979 |
| A0105, 140 Portola Dr, SF | 2019, 7 units | No cap: state cap exempts buildings under 15 years | The surprise; age relative to as-of |
| A0107, 10635 Sherman Grove Ave, LA | 1978, 20 units | Unknown: LA RSO needs certificate of occupancy ≤ 01.10.1978 | Honest unknown with how to check |
| A0258, 471 Columbia Rd, "Dorchester" | 1930 | Boston: no rent cap (c.40P; ballot question struck 23.06.2026) | No invented rules; postal ≠ legal city |

**Q2 "What's about to change for me?"** A0256, Hoboken: slider to 02.07.2027, the FAIR Act goes from not yet effective to applies, conflict flag with the Hoboken ban shown, not decided. Cambridge: two bills "proposed, not law"; after hour 16 the fictional ordinance appears, and the email alert fires (P1).

**Q3 "What can they charge me up front?"** NJ $50 application-fee cap (eff. 01.05.2026): the training-cutoff contrast. CA screening-fee cap: two figures shown (G§9). Deposits: CA 1 month, NJ 1.5, MA first month. A0227 Hoboken (units 2 vs "93U") shows a fact conflict, flagged.

**Q4 "When can they end my tenancy?"** SF §37.9 next to the state rule; NJ Anti-Eviction Act. Card only, no demo beat.

**Q5 "Does the rent-setting software rule cover my building?"** T2 boundary (Hoboken vs Jersey City, none in Newark); Berkeley's two effective dates (G§9). One card.

**Demo spine (2:30):** Q1 across five buildings → Q2 slider on Hoboken → Q3 NJ fee cap as the training-cutoff contrast → hour-16 ingest with the alert email. Headline: "A model has a training cutoff. A law has an effective date."

Risk: whether SF post-1979 buildings fall under SF just cause; only the extracted text settles it, so Q1 stays on rent increases.

## Non-goals

- Legal advice, compliance certification, comparing a user's rent to a cap, exemption search for owners.
- An own chatbot (see Product priorities). Rent levels or any pricing data in the score.
- Critical user journeys beyond the demo beats (not needed for this build).
- Tenant-level facts (lease terms, household) beyond notes on the card; owner-type data.
- GIS overlays (zoning, special districts); jurisdictions beyond the ten cities, except as the scalability proof.
- Scraping beyond the corpus.

## Success signal

By the Sunday 12:00 freeze: acceptance checks A1–A5 (Technical requirements) pass, and J1–J4 work end to end on the deployed page, on a phone, tried by one person outside the team.

## Open questions

- [unknown] score.py and dev key release; how unknowns and extra records are scored (Discord).
- [unknown] Exact hour-16 drop time and format (the brief scores T6; the pack's PDF says no release).
- [unknown] Representation of the 19 "no rule" findings in rules.json.
- [unknown] Jev early access: key available? Quality on our 6 categories (test on 5 docs before relying on it).
- [assumed] County ordinances in scope apply to unincorporated areas only (check LA County's ordinance, ~10 min) before the page claims "no county rules".
- [unknown] Whether use-code unit classes ("5B-20U") count as known facts in the key.
