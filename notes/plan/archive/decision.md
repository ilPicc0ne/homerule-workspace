> **Superseded on 04.10.2026** by `docs/PRD.md` (scope, owners) and `docs/ARCHITECTURE.md` (how). Kept for history.

# Decision: Rights Engine (c2 RealPage, Rental Housing Law Navigator)

Written Sat 03.10.2026, 20:30 CEST. Feature freeze Sun 12:00, submission Sun 15:00. Combines Rights Engine Repair (merge rank 2), Missing Fact Finder (rank 4) and Ask Your Address (rank 6), with the quarantine gate from `funnel/deepdives/memory-quarantine-lab.md`.

> **Update Sat 03.10. ~21:15 — concept: HomeRule.** The product and headline now follow `funnel/deepdives/c2-winning-concept.md`: **"A model has a training cutoff; a law has an effective date."** Same engine as below (rules extracted once with verbatim quotes, compiled into date-aware checks per address, "unknown" becomes one question), with three changes: (1) the differentiator is a measured contrast, a typical RAG-chatbot approach vs ours on the judges' `score.py` and ~25 dated trap questions; (2) demo hero is a Berkeley rent increase, not Hoboken's algorithmic-pricing ban (that would cast RealPage's own product as the villain); (3) MCP moves from cut-first to Should (same engine on the web and inside Claude/ChatGPT). Where this file and the concept file disagree, the concept file wins (feature tiers, stack, demo, cut order).
>
> **Open, Dimitar decides by 21:30:** (a) self-repair loop as Should (headline feature) or Could (overnight only if the 03:00 check is green, as the concept file proposes); (b) rule engine in TypeScript (one engine for build, web and MCP, as proposed) or Python.

**One-liner:** Type your address and see which housing laws protect you today and what changes next, each with the quoted law. An AI turns the statutes into checkable rules, repairs its own mistakes only when a held-out test confirms the fix, and when it can't know, it asks you the one question that settles it.

## User and job

- **Primary: a renter** in one of the 9 cities who has a rent increase, a deposit deduction or a fee in hand. Job: *"Tell me which rules protect me at my exact address today and what is about to change, in words I understand, with proof I can show my landlord."*
- Also benefit: tenant advocates and clinic volunteers (which buildings a pending bill would cover); small landlords without a legal team (their obligations before they act).
- Demand evidence: the sponsor names renters as the first user group [verified, brief p.2]. That renters would use an address-level tool and act on it is [assumed]. We have no interview, and none fits in 18 h. Cheapest proxy: ask the RealPage mentor which user they would show this to.

## Public evidence

| Claim | Tag | Source |
|---|---|---|
| 22.7M US renter households (49%) were cost-burdened in 2024, a record | [verified] | JCHS, America's Rental Housing 2026: https://www.jchs.harvard.edu/press-releases/new-report-finds-cooling-rental-markets-affordability-crisis-deepens-renters |
| 14 cities/counties in 8 states have banned algorithmic rent-setting since late 2024, with different definitions | [verified, sponsor brief only; not independently checked] | RealPage brief p.2 |
| CA AB 325 (common pricing algorithms, Cartwright Act) was signed 06.10.2025 and took effect 01.01.2026 | [verified] | https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB325 |
| On 23.06.2026 the MA SJC struck the statewide rent-control question from the ballot. Proposed law is not law. | [verified] | https://www.wbur.org/news/2026/06/23/massachusetts-high-court-rent-control-ballot-question-struck |

## Why this is differentiated

The crowd will build a RAG chatbot over the corpus, an address dashboard with rule cards, a Leaflet map, a change-tracker dashboard, a bilingual rights card and a landlord portfolio view. Most of these either bolt lookups.json on late or let an LLM decide coverage per question. That loses the 75 script points: coverage misses cost double, and judges cannot audit the citations.

We score differently because:
1. **Law as code.** The LLM extracts each rule once. Coverage compiles into deterministic three-valued checks, so all 500 lookups can be reproduced and audited.
2. **Measured self-repair.** A proposed fix is kept only if a held-out slice confirms it, and the demo shows rejected fixes too.
3. **Useful "unknown".** The renter gets the one question that resolves the most outcomes, not a dead end.

## Scope

**In:** one user (a renter), one workflow (address → rules today and upcoming → answer the one missing fact → re-evaluated answer), all of Modules A–C, the three JSON outputs, score.py on the dev set, T1–T6, live hour-16 ingestion, a deployed UI that says "not legal advice" on every screen.

**Out:** anything beyond the 9 cities and 500 sample addresses (Santa Ana is extracted but has no addresses). Also out: scraping or any non-starter-pack legal text, legal verdicts or compliance certificates, free-form chat that is not grounded in rule records, landlord-side views or anything that helps someone avoid a rule, and accounts or stored user data.

## Riskiest spike (proof by 22:00 Sat)

The risk is that automated extraction yields rules whose coverage conditions we can execute, and that score.py accepts our files. **Check at 22:00:**
1. score.py runs end to end on the dev set against our own `rules.json` and `lookups.json` and prints a baseline number.
2. The extraction agent emits schema-valid records for the documents behind the 10 dev rules, and at least 4 of the 10 match.
3. At least 70% of extracted coverage conditions parse into the predicate format. A condition that doesn't parse becomes "unknown", never a guess.

## Architecture

```
starter corpus (87 docs + manifest)
  └─► EXTRACTION AGENT [LLM #1] ── per doc: segment → extract records → schema validate
        │                          → span verifier (quoted span must occur verbatim in the doc, else drop)
        ▼
      rules.json (schema records + coverage predicates + cached plain-language summary [LLM #2, once per rule])
        │
addresses.csv ─► Census Geocoder batch ─► legal place (≠ postal city) ─► jurisdiction stack state › county › city
        │
        ▼
COMPILER (pure code): predicates → 3-valued checks (true / false / unknown via Kleene logic on null facts)
  + date/status logic (pending · enacted-not-yet-effective · in effect · struck)
  + precedence (local over state where the statute yields → state rule "superseded"; name the governing rule)
        ▼
      lookups.json (500 × rules, status per pair, as-of date)
CHANGE ENGINE: as-of(t1) vs as-of(t2) diff per test case → changes.json (T1–T6, T3 conflict flag)

REPAIR LOOP [LLM #3, proposer]: read failures on the repair slice → propose prompt or mapping change
  → rerun extraction → score.py on the repair slice AND the gate slice + label-free checks
  → promote only if gate ≥ baseline and nothing that was correct regresses; else reject (logged)

RENTER UI (Next.js on Vercel): address search → rule cards (quote, citation, retrieval date, as-of, status)
  → "one question" from the missing-fact ranker → re-evaluate via Python function (fallback: precomputed variants)
  → [LLM #4] maps a free-text question to a category only; answer text comes from rule records
AUDIT LOG: append-only JSONL: doc id, prompt hash, model, raw output, validator verdicts, score, repair decisions
```

**Dev-key split:** the dev key has 10 rules and 20 addresses. We use 6 rules and 12 addresses for repair, and 4 rules and 8 addresses for the gate. Two label-free checks run over the whole corpus: the citation span must be found, and the schema must be valid. With 8 gate addresses, a gain is weak evidence. We present the gate as protection against regressions, not as proof of generalization. The real out-of-sample test is the hour-16 ordinance [assumed: the dev key is not a subset trap; ask the mentor].

**Models:** a strong Claude model for extraction, the repair proposer and the hour-16 document. A cheap model for summaries and question routing. Exact IDs are fixed at 22:00 against our credits [unknown].

## Data

Starter pack only: corpus, about 500 addresses, schema, dev key, change tests, score.py. Its licence and exact formats are [unknown] until Dimitar downloads it at 20:30. Census Geocoder (no key, batch) and TIGER/Line for the legal city are US government public data [assumed public domain].

Not covered: San Diego has no year built, and Berkeley has no year built or unit count [verified, brief p.4]. The team's working figure of 212 of 500 addresses without a year built is [unknown until checked in the CSV]. Owner type is absent everywhere [assumed], so rules that hinge on it stay "unknown". Missing Fact Finder is built for exactly that case.

## Build plan

| Time (CEST) | Dimitar (agent core) | Silvan (scope, data, compiler, front, pitch) |
|---|---|---|
| Sat 20:30–22:00 | Download the starter pack, read the schema, score.py and the participant guide. Extract the dev-key docs, get score.py running and record a baseline. | Profile the address CSV (missing facts per city). Batch-geocode the 500 addresses. Write the predicate format and evaluator with trap tests (postal ≠ legal city, MA has no rent control, a struck ballot question, pending bills). Create a new public product repo (not `snp`: it holds the World Bank "Official Use Only" brief and the funnel internals) and put a Vercel skeleton with the "not legal advice" banner live. |
| **22:00** | **Go / no-go on the spike** | |
| 22:00–00:30 | Extract all 87 docs, add the span verifier, build rules.json v1 and the audit log | Compiler, precedence and date/status logic; lookups.json for all 500 addresses |
| 00:30–03:00 | Repair loop with the dev split and gate. Start it unattended with a budget cap (soft $5, hard $15 [assumed]). | T1–T5 runner and changes.json v1. Run the full score.py and commit. |
| **03:00** | **Checkpoint, then sleep 03:00–07:30.** The loop runs overnight and logs every candidate. | |
| 07:30–10:30 | Review the loop and accept the gated repairs. Re-extract and plot the score curve. Make hour-16 ingestion a single command. | Renter UI: cards, statuses, the one question and re-evaluation; deploy. Make the dev-set score.py report and the T1–T6 view presentable. |
| 10:30–11:00 | Dry-run the ingestion on a corpus doc we hold back | Write the video scripts |
| **~11:00 (hour 16)** | Ingest the Cambridge ordinance unaided; record the screen with a visible timestamp | Check the affected addresses and future effective date in the UI; add T6 to changes.json |
| 11:00–12:00 | Fixes; final score.py; commit the final rules/lookups/changes JSON | Finish README (scalability path: add a jurisdiction = add docs + one geocoder layer) |
| **12:00 freeze** | | |
| 12:00–14:30 | Tech video: architecture, score.py report, T1–T6, hour-16 recording, repair curve | Demo video and pitch. Record the team video together (20 min). |
| 14:30–15:00 | Check repo and live link | Submit in HackOS and the Google Form backup |

## Demo story

1. Half of US renters are cost-burdened, and the rules that protect them depend on the exact address and change every few months.
2. Maria rents in a 1962 building in Hoboken and wants to know whether her landlord may set her rent with an algorithm.
3. She types her address. Hoboken ch. 158 applies, with the quoted text. The NJ FAIR Act is signed but not in effect until 01.07.2027, with a conflict flag. For her neighbour in Cambridge, the answer is "unknown until we know one fact", and the tool asks that one question.
4. The aha: no chatbot decided any of this. The AI turned the law into rules once, fixed its own extraction errors only when a held-out test confirmed the fix, and absorbed a new Cambridge ordinance live at 11:04 without help.
5. Why now: 14 local algorithm bans, a new state layer in California, and a struck ballot question in 2026 alone. Only a tool that knows enacted from pending stays correct.

## Kill criteria and cut order

- **22:00, score.py not running or fewer than 3 of 10 dev rules matched:** drop the repair loop and the Q&A. Both of us work on extraction quality and the compiler; prompt fixes are made by hand, never rule fixes.
- **22:00, under 70% of conditions parse:** switch to fixed coverage fields (year-built cutoff, minimum units, owner types, exemption flags) instead of a free predicate format.
- **03:00, lookups.json for 500 addresses not produced end to end:** cut everything from step 3 of the cut order down.
- **Cut order:** 1 MCP server · 2 Spanish · 3 polish on the repair-loop UI (the curve stays in the video) · 4 the live re-evaluation API (use the precomputed variants) · 5 free-text questions (address → cards only) · 6 the repair loop itself.
- **Never cut:** Modules A–C, rules/lookups/changes JSON, the score.py report, the hour-16 run, "not legal advice", the deployed link.

## Open questions for the RealPage mentor

1. Which as-of date is lookups.json scored at, and do "does not apply" pairs get listed or left out?
2. In what form does score.py expect the T3 conflict flag in changes.json?
3. Will the hour-16 ordinance arrive in the corpus format (text plus a manifest row), and should it also go into rules.json?
4. Does the dev key overlap the held-out key, and does "unknown" earn the same partial credit whatever fact is missing?
