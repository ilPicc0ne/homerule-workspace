# HomeRule PRD

**Your rights as a renter, for your exact address.**
Demo headline: *A model has a training cutoff. A law has an effective date.*

The master document for scope, priorities and owners. The brief wins on rules; the how lives in [ARCHITECTURE.md](ARCHITECTURE.md). Updated Sun 04.10.2026. Submission 15:00 CEST, freeze 12:00.

## In one minute

- **What:** enter an address and see which housing rules apply there today and what is about to change: quoted, dated, with "unknown" where the data can't decide.
- **For whom:** renters first. Advocates get the affected-address lists for free. Small landlords get wording only.
- **How it's scored:** 75 points by script on three files (`rules.json`, `lookups.json`, `changes.json`), 25 by judges on the demo.
- **Our bet:** extract the law once into rule records and decide coverage in code, not by a model. Answers are reproducible, quoted, and stay "unknown" when a fact is missing.
- **Scope:** 3 states, 10 cities, 500 sample addresses; the landing page says so plainly. A new city = its law texts + one list entry.
- **Not:** legal advice, a compliance check, a chatbot, rent prices.

## What we must get right (scoring)

| Score | Pts | Owner | Must hold |
|---|---|---|---|
| Extraction | 25 auto | D | Automated from the corpus. Records join the key on jurisdiction + category + citation. Status (in force / not yet effective / pending / failed) and dates right. Never invent a rule |
| Address coverage | 20 auto | S | All 500 addresses. Legal city, not postal city. **Unknown instead of omitting** (a miss costs 2×). Superseded only when a stricter local rule governs |
| Citations | 15 auto | D | Every "applies" has a verbatim quote from the corpus |
| Change tracking | 15 auto | S (T6 ingest D) | T1–T5 from the pack, T6 = hour-16 ordinance, all through one engine |
| Plain language | 10 judges | S | The address page (below) |
| Responsible design | 10 judges | both | "Not legal advice" everywhere, as-of date on every answer, conflicts flagged not decided, audit log |
| Scalability | 5 judges | S | New city = documents + one list entry; hour 16 is the live proof |

Bonus the guide offers: show its four open legal questions (e.g. Berkeley's ban has two published effective dates) as flags with both sources.

## The product: one address page

**The six questions**, one tile each (= the six scored categories):

| Tile | Category |
|---|---|
| How much can my rent go up? | Rent increase limits |
| When can they end my tenancy? (reasons · notice · relocation money) | Just-cause eviction |
| How much deposit can they ask? | Security deposits |
| What can they charge me to apply? | Application and screening fees |
| What can they check about me? | Screening restrictions |
| Can rent-setting software be used on my rent? | Algorithmic rent-setting |

**Each tile is an accordion** (one open at a time):

| Level | Shows |
|---|---|
| Closed | Big title with icon · one plain answer · status mark + word + colour |
| Open | Plain explanation · **next step**: first a human contact (office, phone, "free") from `contracts/contacts.json`, then action helpers (J7) |
| "Show the law" (second toggle) | Verbatim quote · citation · dates · confidence · rules it replaces · link to the rule page |

**Status labels** (one meaning per colour; colours rate the renter's protection, never the building or landlord):
- **There's a rule** · green
- **We're missing one fact** · amber; names the fact and who can tell you
- **No local rule — state basics only** · grey, neutral mark
- Blue only for actions and dates.

**Words** (judged as Plain language; the legal-advice line):
- Reading level grade 6–8. Tenant facts (length of tenancy, etc.) are notes, never inputs.
- Never phrase a cap so it invites comparing the renter's own number: "The Rent Board can check your notice", not "max 3.4%: is yours higher?".
- State facts, let the reader conclude: "Public records list 21 units. The exception is for 4 units or fewer." Never apply the law to the case.
- Coverage is about the building: always "your unit may differ".
- Plain words instead of jargon: good cause → a reason the law accepts · struck → removed (say by whom) · in force → applies now · certificate of occupancy → the date the city first approved the building for living in · notice to quit → a letter telling you to move out · source of income → how you pay rent (e.g. a voucher) · algorithmic software → rent-setting software.

**Ask at any level: one search box, one hierarchy.** The search accepts an address, a city, a neighbourhood ("Dorchester"), a county or a state, and resolves it through the jurisdiction list (with aliases), so nobody has to know the exact name or ID.
- **Address** → the address page (below).
- **Jurisdiction page** for every level (`/j/<id>`): State › County › City as breadcrumbs, each level browsable. It shows the six questions with the rules for that level and everything above it, and *what they depend on* instead of a building result ("applies to buildings with a certificate of occupancy on or before 13.06.1979"). A state page lists its cities; a county page says it has no rules of its own and lists its cities.
- **Outside the scope** ("New York", "Austin") → "Not covered: HomeRule has law for 3 states and 10 cities", never a guess.

**Click any answer → the rule page** (one page per rule, shared by all addresses):
- **Source:** the verbatim quote highlighted in the source text, citation, **link to the official law** (`source_url`), retrieval date, effective date, status.
- **Audit trail:** what the model extracted (and its confidence), what the code decided (jurisdiction match, coverage test on this building's facts, precedence), with the line between the two shown ("reasoning boundary").
- **Impact map:** every sample address this rule touches, coloured by result (applies / unknown / not yet effective / pending), with the date slider. Moving the date flips the dots (e.g. FAIR Act on 02.07.2027).
- This page is also the advocates' view: "which buildings does this law or bill reach?"

**Page, top to bottom (one view):**

1. **Sticky address bar:** address search (address, city, neighbourhood) + compact **"Get alerts" bell** that opens the email field in place; disabled until an address is found, then named after it ("Alerts for 3515 Fillmore St"). "Not legal advice" · as-of date in the header
2. **"Next change: <date> — <what>"**
3. **Small map** (P1): pin + legal-city outline, "Inside <city> city limits" (+ postal city when it differs); State › County › City; building facts (year, units, source), "unknown" shown plainly
4. **"At a glance":** one plain sentence; status tokens only when the tiles differ
5. **Now:** the six accordion tiles
6. **Coming up:** dated plain lines, change log old → new; undated bills as "Proposed, not law"
7. **Alerts:** signup and email preview
8. How this works · disclaimer

## Priorities and feature status

This is the project's feature list; each build updates its status in the same commit.

| Prio | Feature | Owner | Status |
|---|---|---|---|
| P0 | Extraction → `rules.json` | D | built (26/27 brief-named rules, T1-T5 pass, quotes 100% verbatim in `rules.json`, `make eval`, prompt lint + freeze, audit trail `out/audit.json`; Santa Ana has no text in the corpus: recorded as a finding) |
| P0 | Jurisdiction list + address lookup (Census geocoder) | S | planned |
| P0 | Engine → `lookups.json`, `changes.json`, per-address diff | S | planned |
| P0 | Address page, one view (sticky bar with search + alert bell, next change, at a glance, six accordion tiles, coming up; sections 1–2, 4–8), JSON endpoint per address | S | planned |
| P0 | Change log + email preview, triggered by a demo-only ingest | S | planned |
| P0 | Rule page: quote in source, link to the law, audit trail with reasoning boundary | S (audit data from D) | planned |
| P0 | Search resolves address / city / neighbourhood / county / state via the jurisdiction list; "not covered" for anything outside | S | planned |
| P1 | Jurisdiction pages for all levels (state › county › city), rules with their conditions | S | planned |
| P1 | Chatbot scoreboard: ~20 dated city-level questions, plain chatbot vs HomeRule, date-stamped | D | planned |
| P1 | Impact map on the rule page with date slider | S | planned |
| P0 | Hour-16 ingest in one command | D | built (`make ingest`, `make rehearse`, `make rerun`; rehearsal 45/45 addresses in ~24 s) |
| P1 | Real email sending (double opt-in) via Resend from `alerts@yourhomerule.com`; deliverability: HTML + text, unsubscribe link and header, warm-up | S | partial (domain verified, test mail sent) |
| P0 | Coming-soon landing page on yourhomerule.com | S | WIP (`s/landing`, preview) |
| P1 | Renter-protection score + compare picked addresses (no ranking, no rent levels, unknown counted apart) | S | planned |
| P0 | Contacts per tile (J7): hand-checked table per city × topic (rent board, housing department, tenant hotline, legal aid; link + phone, free or not, source + retrieval date) in `contracts/contacts.json`; every tile's first next step is one human contact | D (data), S (display) | planned |
| P1 | Action helpers (J7): neutral one-tap follow-ups on the page: ready email asking the landlord for a missing fact, call checklist ("have your notice, lease, move-in date"), check item ("Did your notice include the required tenant-rights form?"). They ask for information or point to an office, never argue the renter's case | S | planned |
| P2 | Legal-aid finder: nearest free legal help for the exact address from public directories | S | planned |
| P1 | Renter answers one missing building fact ("you told us", never in the scored files) | S | planned |
| P1 | Small map on the address page (section 3), a real map, not a drawn outline: MapLibre GL JS + OpenFreeMap vector tiles, light "Positron" style (no API key); building pin; legal-city outline from Census TIGER/Line place boundaries, simplified once into a small GeoJSON for the 10 covered cities; caption "Inside <city> city limits"; OSM attribution shown; tap to enlarge | S | planned |
| P1 | Show the guide's four open legal questions as flags with both sources (e.g. Berkeley's two effective dates) | D | built (`out/findings.json` kind `open_question`, `extract/open_questions.py`; card display: S) |
| P1 | Spanish card summaries (brief stretch goal; quotes stay English) | S | planned |
| P1 | "I rent / I own" wording toggle (sponsor's users) | S | planned |
| P2 | Typed address outside the sample, e.g. Santa Ana (brief stretch goal "new jurisdiction live") | S | planned |
| P1 | Extra data sources (see [ARCHITECTURE](ARCHITECTURE.md#data-sources-to-extend-coverage-p1-checked-04102026)) | D | planned |
| P2 | MCP route | D | planned |
| P2 | Compare view · city outline on the map | S | planned |
| P3 | ChatGPT custom GPT on the JSON endpoint | D | planned |
| Idea | Own chatbot · addresses outside the 500 · neighbourhood comparison · repairs card | — | idea |

## User journeys

**J1 · What applies at my address?** (P0) Ana, 3515 Fillmore St, SF, just got a rent-increase notice.
1. Types "3515 Fill…", picks the suggestion.
2. Sees: California › San Francisco · built 1926 · 21 units · six tiles.
3. Opens "How much can my rent go up?": SF Rent Ordinance applies; the state cap is replaced by it; quote, citation, date.
- ✅ Done when: both rules show with the right result and a verbatim quote, in under 60 s.

**J2 · An honest unknown** (P0) Marco, 10635 Sherman Grove Ave, LA, built 1978.
1. Opens his address.
2. Rent tile says "We're missing one fact": whether the city first approved the building for living in on or before 01.10.1978. Who can tell you: LA Housing Department or your landlord.
3. (P1) Enters the date himself → tile updates, marked "you told us".
- ✅ Done when: the rule shows as unknown with the missing fact and where to check it, never hidden or guessed.

**J3 · What's coming?** (P0) A tenant at 327 Jackson St, Hoboken.
1. Scrolls to "Coming up": NJ FAIR Act takes effect 01.07.2027, may conflict with Hoboken's own ban.
2. Moves the date to 02.07.2027.
3. The tile flips to "There's a rule"; the conflict flag stays, undecided.
- ✅ Done when: the status flips at the date and the conflict is shown, not resolved.

**J4 · Tell me when the law changes** (P0 preview, P1 sending) A tenant at 134 Oxford St, Cambridge.
1. Taps the "Get alerts" bell in the address bar ("Alerts for 134 Oxford St"), enters an email and confirms.
2. A new ordinance is ingested (hour 16).
3. The change log shows old → new; the email shows the same: new rule, date, quote, "not legal advice".
- ✅ Done when: the ingest produces the change log and the matching email preview in under 10 min.

**J6 · Which buildings does this bill reach?** (P0 rule page, P1 map) An advocate in Boston.
1. Opens the rule page for MA S.2983 (from any Boston address, or search).
2. Sees: status "proposed, not law", the bill text quote, link to malegislature.gov, and all 110 MA sample addresses marked "pending".
3. Clicks one quote → sees what the model extracted and what the code decided.
- ✅ Done when: the affected list matches `changes.json` T4, every address says pending (never in force), and the law link opens the official source.

**J5 · Compare before I move** (P1) Someone choosing between two apartments.
1. Opens both addresses and "compare".
2. Sees per category: applies / unknown / coming, side by side.
- ✅ Done when: the comparison shows unknowns apart from "doesn't apply". No rent prices, no ranking.

**J7 · Take action** (P0 contacts, P1 helpers) Marco, 10635 Sherman Grove Ave, LA, has just read his rent tile.
1. Opens the tile: the first next step is a person: "LA Housing Department · phone · free".
2. Taps "Ask your landlord": a ready email asking for the missing fact; copies it.
3. Taps "Before you call": checklist "have your notice, lease, move-in date". On the eviction tile, a check item: "Did your notice include the required tenant-rights form?"
- ✅ Done when: every tile has a contact from `contracts/contacts.json` and the renter can copy a ready email or open a checklist without leaving the page.

## Demo (2:30)

| # | Beat | Shows | Time |
|---|---|---|---|
| 1 | **Chatbot scoreboard** (only with its method on screen: who wrote the questions, date, model and version, link to the question set; if not measured by 12:00, drop it and open on beat 2): "ChatGPT 9/20 · HomeRule 19/20" on dated questions (struck Boston ballot, NJ $50 fee cap) | The headline, as a number | 0:15 |
| 2 | **Ana's address, 3515 Fillmore St, SF:** six tiles; rent tile: SF ordinance applies, state cap superseded | The product | 0:30 |
| 3 | **Same question, two more buildings:** 10635 Sherman Grove Ave, LA → unknown with what to check; 471 Columbia Rd "Dorchester" → Boston, no rent cap | Honest unknown, postal ≠ legal city, no invented rules | 0:25 |
| 4 | **Click the answer → rule page:** quote in the law text, link to the official source, what the model extracted vs what the code decided | The AI and the responsible design, visible | 0:25 |
| 5 | **Date slider on the FAIR Act map:** NJ dots flip on 02.07.2027, conflict rings on Hoboken and Jersey City | Change tracking | 0:20 |
| 6 | **Hour-16 live:** ingest the new ordinance on camera with a clock, change log updates, the alert email arrives on a phone | Automation, the live proof | 0:30 |
| 7 | **Proof frame:** 500/500 addresses resolved · 38 postal-city corrections · 100% verbatim quotes · T1–T6 pass | Credibility | 0:05 |

The order of beats still holds with the one-view page. Mockup: `lab/ui-proposal` on branch `s/demo-site` (v2 → v3 in progress). Expected answers come from the brief, not yet from our engine; these addresses are also engine tests. If the map isn't built, beat 5 uses the slider on the Hoboken address page.

## Owners and handoffs

| Dimitar | Silvan |
|---|---|
| Everything up to `rules.json`: triage, Jev classification, extraction, quote check, statuses | Jurisdiction list (13 IDs both sides use), address lookup, building facts |
| Hour-16 ingest, eval suite, audit log | Engine, lookups, changes, diff |
| Extra data sources (P1), MCP route and ChatGPT GPT (P2/P3) | |
| | Page, change log, email + subscription store, score |
| Technical video | Submission package 12:00–15:00 (videos, method note, README) |

**First steps:**
- **Dimitar:** triage the 13 jurisdictions × 6 categories grid against the corpus; test Jev on 5 documents.
- **Silvan:** the jurisdiction list and the address lookup. Already measured: 500/500 jurisdictions.

The interfaces between us (file shapes, the jurisdiction list) are in [ARCHITECTURE.md](ARCHITECTURE.md#interfaces). Change them only via PR.

## Done by the 12:00 freeze

- `make eval` green:
  - ≥22 of the ~27 rules the brief names, with the right status and date;
  - every jurisdiction × category cell triaged;
  - T1–T6 right;
  - the demo addresses right;
  - 100% of quotes verbatim;
  - "not legal advice" found everywhere.
- J1–J4 work on the deployed page, on a phone, tried by someone outside the team.

## Submission checklist (12:00–15:00, lead: Silvan)

| Item | Owner | Done when |
|---|---|---|
| `rules.json`, `lookups.json`, `changes.json` committed in `outputs/` from a build on `main` | S | Schema-valid, all 500 addresses, T1–T6 present |
| Public GitHub repo with code, README (how to run), output files | S | A fresh clone runs `make all` |
| Live demo link (yourhomerule.com) | S | Works on a phone |
| Team video | S | Both of us, 30–60 s |
| Demo video, with the scores on screen | S | Follows the demo table |
| Technical video: `score.py` report on the dev set (or the `make eval` report if no score.py ships), T1–T6 results, the hour-16 run, a live `make rerun DOC=` | D | All four visible on screen |
| One-page method note | S | Sources, pipeline, what code decides vs the model, limits |

## Never

- **Advice and verdicts:** no legal advice, no "compliant" or "illegal", no comparing a user's rent to a cap (nor wording that invites it), no applying the law to the renter's case (state facts, let them conclude), no tips on avoiding a rule.
- **Inventions:** no invented rules or citations. Pending law is never shown as law.
- **Ranking:** no ranked list of least-protected buildings.
- **Data:** no non-public or pricing data; no scraping against site terms.

## Open questions

- Will `score.py` and the dev key be released? How are unknowns scored? (Discord)
- When exactly does the hour-16 ordinance drop?
- How are the 19 "no rule" findings represented in `rules.json`?
- Jev access and quality (5-document test).
- Tagline: Dimitar may still argue for the provocative line, "Your landlord has a lawyer. You have the law."
