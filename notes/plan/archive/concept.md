> **Superseded on 04.10.2026** by `notes/plan/prd.md` (scope, owners) and `docs/ARCHITECTURE.md` (how). Kept for history.

# c2 winning concept: HomeRule (RealPage, Rental Housing Law Navigator)

Sat 03.10.2026, ~20:30 CEST.
- **Source of truth:** the brief PDF.
- **Baseline:** `funnel/decision.md`.
- **Built from:** three parallel critiques (judge red team, concept generator, scoring/feasibility).
- **Starter pack:** not read yet, so its conventions are [unknown].
- "HomeRule" is a working name.

**Verdict:** keep the baseline engine: law as code, three-valued coverage, unknown → one question, hour 16 as the climax. Change the headline from "self-improving on 8 gate addresses" to ***a model has a training cutoff; a law has an effective date***. Prove it with one honest results table, and serve the same engine to AI assistants via MCP.

## 1. Diagnosis

**Why the crowd looks alike.** The brief fixes the pipeline, the outputs and even a mock UI (p.3). All three simulated crowds end up with the same six products: RAG chatbot, address dashboard, change tracker, date-slider map, bilingual card, landlord view. They differ in the UI, not in the 75 scripted points, and none of them measures anything.

| Pts | Decided by | Crowd failure | Our lever |
|---|---|---|---|
| Extraction 25 | Match on (jurisdiction, category, citation) with 58 rules, then field accuracy | Over-extraction, free-form citations, pending/struck extracted as law | One record per jurisdiction × category × cited section; dev-key citation style; links-only docs skipped |
| Coverage 20 | A miss costs ×2; unknown gets partial credit | Postal city used as legal city; LLM decides per question; unknown overused | Census legal place; Kleene logic on **building-level facts only**; unparsed → unknown, never omitted |
| Citations 15 | Quoted span appears in the corpus | Paraphrased quotes | Spans snapped to verbatim substrings |
| Changes 15 | T1–T6 sets, T3 flag | Lookups bolted on late | As-of diff from the same engine |
| Judged 25 | Plain language, audit, scale path | Chat box plus a banner | Today/next, quote, one question with how to check it, audit JSONL |

**Where differentiation is possible:**
1. **Discipline on the unglamorous traps:** granularity, citation format, verbatim spans, legal city, supersession, statuses, the 19 "no rule" findings.
2. **A measured contrast no other team will have.** It answers every judge's silent question: "why not just ask ChatGPT?"
3. **Beyond the prompt:** one engine with two front doors, web and MCP. The hour-16 ordinance did not exist at 10:59; minutes later both cite it.

## 2. Problem worth solving

| User | Moment | Role |
|---|---|---|
| Renter | Holds a rent-increase notice, deposit deduction, fee demand or eviction notice | **Primary, demo persona** |
| Clinic intake volunteer | Has 10–20 min to triage a case | **Multiplier; the clinic sheet is the handoff** |
| Advocate or agency | Which buildings a bill covers (T4's list) | Free view from Module C |
| Small landlord | Before raising rent or charging fees | Could: wording toggle only (evasion and certification risk) |

**Do renters gain from knowing the rules?** Not cheaper rent. They gain at four decisions where money moves:
1. **Rent increase:** pay it, or raise the cap.
2. **Deposit:** demand it back. Penalties make the demand credible: treble in MA (c.186 §15B(7)), up to ×2 in CA (Civ. §1950.5(l)), ×2 in NJ [assumed; check the `penalty` fields].
3. **Application fee:** NJ caps it at $50 from 5/1/2026 [verified, brief p.3].
4. **Eviction notice:** does just cause apply, and is it time to get counsel?

The tool never says "illegal". It shows the rule, the quote and what is unknown, then hands off.

| Claim | Tag | Source |
|---|---|---|
| Tenants have a lawyer in ~3–4% of eviction cases, landlords in ~80–84% | [verified, secondary] | https://civilrighttocounsel.org/resources/organizing_around_right_to_counsel/ |
| 92% of low-income Americans' serious civil legal problems get no or inadequate help (2022) | [verified] | https://justicegap.lsc.gov/resource/executive-summary-2022/ |
| 26% of renters denied a deposit; 42% got it back in full | [verified, weak industry surveys] | https://www.yahoo.com/news/2013-01-29-security-deposit-refund.html · https://www.joinroost.com/post/security-deposits-what-roost-members-say-2021-survey-results |
| Renters don't know which layer covers them | [unknown] | No survey found |
| Renters ask chatbots about housing law; a cited sheet speeds up a clinic consult | [assumed] | Cheapest test: the RealPage mentor and one US clinic volunteer react to the sheet, Sun morning |

**Alternatives, and why none fits:**
- Rent-board lookups: one city each.
- Static guides: not address-level.
- The LSC database: stale since 2021.
- Chatbots: training cutoff, no legal city.
- Crowd RAG bots: they guess coverage.

None is address-level, three-layer, dated and cited.

## 3. Options

| | **A · HomeRule** | B · Address Time Machine | C · Public Rule Ledger |
|---|---|---|---|
| Idea | Law compiled into checkable, dated rules, for renters on the web and for any assistant via MCP | Your address on a 2024–28 timeline, one band per protection | Two models extract each rule; disagreements go to human review; a new law arrives as a PR with a buildings diff |
| Aha | A plain model says the 11:00 ordinance doesn't exist; HomeRule cites it minutes later, on the web and in Claude | Scrub to 1/2/2026: AB 325 applies; to 7/2/2027: FAIR Act plus conflict flag | Hour-16 PR: 37 buildings, one disputed date settled by a human |
| Crowd distance · delta | High · ~4 h | Low (the crowd has sliders) · ~3 h | Medium, no renter · ~6 h, 2× extraction cost |

decision.md is A's engine with a weaker headline. The concept critique scored it 17/25 against 23/25: the self-repair claim rests on 8 gate addresses and cannot be seen in a 60-second video.

## 4. Recommendation: HomeRule

**Problem.** A renter with a notice or a charge has days to decide whether to push back. The answer depends on three layers of law, the building's age and size, and dates that move every few months. They face it almost alone. The general chatbot they reach for:
- cannot know laws passed after its training;
- confuses pending, struck and not-yet-effective law;
- doesn't know that a "Los Angeles" mailing address can lie outside the city.

**Solution.** An extraction agent reads the law once and must back every field with a verbatim quote. Coverage compiles into three-valued, date-aware rules. Every address then gets a deterministic answer (applies / superseded / not yet effective / pending / unknown) with quote, citation and as-of date. An unknown becomes one question, with how to check it. The result prints as a clinic sheet. The same engine is an MCP tool, so assistants answer from current law rather than from memory.

**Why it wins:**
- **Vs the crowd:** it scores the 75 by construction and proves it with a table nobody else has.
- **Vs B and C:** better retell, with a renter on screen.
- **Vs the baseline:** same engine, but a claim judges can verify, plus the channel people already use.

## 5. Feature scope

S = Silvan, D = Dimitar. About 9 productive hours each before the 12:00 freeze. Musts take D 8.75 h and S 8.5 h, which leaves 1–2 Should hours each.

| # | Feature (hours) | Acceptance check | Owner |
|---|---|---|---|
| **Must** | | | |
| M1 | Extraction per document and category: schema fields plus a plain summary; links-only docs filtered out (4) | Schema-valid `rules.json`, 50–90 records | D |
| M2 | Span snapper (exact → normalised → fuzzy ≥90), citation canonicaliser, verify-and-retry; failures **kept and flagged**, never dropped (2.5) | ≥95% of spans verbatim; dev ≥7/10 rules by 03:00 | D |
| M3 | Statuses enacted / pending / struck (struck never emitted); "no rule" only where a document bars the rule | T5 empty; MA bills pending | D+S |
| M4 | Census batch geocoding → incorporated place → legal city; cached; postal ≠ legal logged (1.5) | ≥95% of 500 resolved | S |
| M5 | TS engine: predicate AST, Kleene logic, year-only boundaries as intervals, `yields_to` table, date/status (3). The table: AB 1482 yields to local rent control; Civ. 1946.2 yields to local just cause; algorithmic bans coexist; the FAIR Act is a conflict flag | 8 trap tests green, incl. the brief's SF 1962/20-unit example and T1 | S |
| M6 | `lookups.json` (500) at a parametrised as-of date (likely 2026-10-01 [assumed]); tenant-level conditions become card notes, not unknowns (0.5) | Zero missed "applies" on the 20 dev addresses | S |
| M7 | `changes.json` T1–T6 with before/after rule sets and the T3 flag (1) | T1 flips between 12/31/2025 and 1/2/2026; T2 stays within city limits | S |
| M8 | Eval harness: score.py + brief-derived assertion suite (~26 named rules, T1–T5, the SF example) split into repair and gate halves; audit JSONL (1.25) | `make eval` prints one report | D |
| M9 | Hour-16 ingestion as one command, rehearsed on a held-back doc (1) | Record reproduced in <10 min | D |
| M10 | Web page over the 500: stack, cards (status, summary, quote, citation, dates, confidence), "what changes next", Proof page (score.py, T1–T6), "Not legal advice" on every view (2.5) | Deployed URL works on a phone | S |
| **Should** (in priority order) | | | |
| S1 | One question: missing building facts ranked by how many outcomes they settle, each with how to check it (assessor, lease, rent registry); facts tagged *public record* or *you told us*; re-evaluated client-side, never written to lookups (1.5) | One answer settles ≥2 categories on the Berkeley sample | S |
| S2a | Contrast on the judges' script: the crowd architecture (an LLM decides coverage) vs our compiled engine on the dev addresses (1) | score.py numbers for both | D |
| S3 | MCP via `mcp-handler` [verified current, v2 stateless]: `lookup_address`, `rules_as_of`, `whats_changing`, `missing_facts`; every payload carries `not_legal_advice`, `as_of`, `status`, `source_url` (1) | Claude Desktop cites the hour-16 ordinance | S |
| S2b | Trap set: ~25 dated questions graded only against the brief and the dev key; plain model vs model + HomeRule tool; report the plain model's correct answers too (1.5) | One script regenerates the table | D |
| S5 | Clinic sheet: print CSS of the result (0.75) | One page per address | S |
| **Could** | | | |
| C1 | Overnight AVO-style prompt search: label-free fitness + repair half; promote only on the gate half with no regressions; a lint keeps rule facts out of prompts. Only if 03:00 is green; tech video only | Promoted variant ≥ baseline | D |
| C2–C4 | Spanish · provider wording (no "compliant" badge, no "exempt buildings" filter) · live geocoding of typed addresses | — | S/D |

**Cut order:** C4 → C3 → C2 → C1 → S5 → S2b → S3 → S2a → S1 (fallback: a static reason per unknown).

**Never cut:** M1–M10, score.py on screen, the hour-16 run, "not legal advice", the live link.

## 6. Tech stack

- **Offline pipeline (D):**
  - Python 3.12 and the `anthropic` SDK.
  - `claude-opus-5-5` (effort high) for extraction, verification and hour 16. It runs with structured outputs (`output_config.format`) against the provided schema, with the document placed first so reruns read from cache.
  - `claude-haiku-4-5` for summary checks and Spanish.
  - `rapidfuzz` and `jsonschema`. Snapping runs in code because the Citations API is incompatible with structured outputs.
- **Rules:**
  - `rules.json` stays exactly in the provided schema.
  - Predicates sit in a sidecar `rules.compiled.json` with these node types: `all/any/not`, `{fact, op, value}`, `{age_years, op, n}`, and `{ref: atom}` for cross-rule facts such as "covered by local rent control".
  - Building facts only: year_built, units, use_code, legal_city, county, state, owner_type, owner_occupied, condo/SFR.
  - Its JSON Schema is frozen at 22:00 and validated on both sides.
- **Engine (S):** one TypeScript module serves the Node build, the browser (instant one-question re-evaluation) and MCP, so the scored output and the UI cannot diverge. Dimitar's loop shells out to `node build-lookups` (<1 s).
- **Rest:**
  - Census Geocoder batch: no key, results committed.
  - JSON in git plus append-only `audit/*.jsonl` (doc, model, prompt hash, raw output, verdicts, score). No database.
  - Next.js + Tailwind on Vercel, with the MCP route in the same app.

## 7. Demo (2:30) and pitch

1. **0:00** "A model has a training cutoff. A law has an effective date." A real recording of a plain chatbot mishandling the struck MA ballot question or the 11:00 ordinance.
2. **0:15** Ana, Berkeley, rent-increase notice.
   - Stack: CA › Alameda › Berkeley. The deposit cap applies, quoted.
   - Rent increase: *unknown; one fact decides it: first occupied before 1980?* [threshold assumed] *Check the rent registry or your lease.*
   - She answers. The local ordinance applies and AB 1482 is superseded, both quoted. She prints the clinic sheet.
3. **0:50** Jersey City: the FAIR Act applies from 7/1/2027, with a conflict flag against §218-12. Boston: no rent cap; the ballot question was struck. "Proposed is not law."
4. **1:10** Hour 16, clock visible. One command; N rules with verified quotes; M Cambridge addresses now *not yet effective, applies from <date>*; X minutes.
5. **1:40** The same question in Claude through the HomeRule MCP cites this morning's ordinance, with the as-of date and "not legal advice".
6. **2:05** Proof: score.py report, contrast table, audit log.

Algorithmic pricing stays one category of six. It is not the hook in front of RealPage.

**Pitch:** "Housing law changes faster than any model retrains; HomeRule compiles it into checkable rules, so every address, and every assistant, gets today's law with the quote."

**Quote** (best-quote prize; also the LinkedIn hook with the hour-16 clip): "A model has a training cutoff. A law has an effective date. We built the bridge."

**Hour-16 staging:**
- Watch the Drive folder from 09:30; hour 16 may land at 10:00.
- Rehearse at 09:00 by re-ingesting one held-back ordinance.
- No prompt edits after the release.
- Commit the input, outputs and audit lines with timestamps.

## 8. Risks and kill criteria

| Risk | Mitigation |
|---|---|
| score.py conventions [unknown]: as-of date, granularity, unknown credit, "no rule" format | Read the guide first; calibrate on the dev key; ask the mentor |
| Overfitting the 10 dev rules | Assertion suite + gate; prompt lint (also protects "not hand-coded") |
| Legal-advice line | Never compare a user's number to a cap or say "illegal"; CPI caps shown as a formula |
| An assistant drops the MCP disclaimer | Disclaimer in every payload and tool description; README names the residual risk |
| Both of us over budget | Cut order; no Should before M10 is live |

**22:00 go/no-go:**
- score.py prints on our files.
- ≥4/10 dev rules match.
- ≥90% of spans are verbatim.
- Geocoding has run.
- The AST schema is frozen.

If fewer than 3/10 rules match, cut S2b, S3 and C, and both of us work on extraction. If fewer than 70% of conditions parse, switch to fixed fields (year cutoff, minimum units, owner type, exemption flags).

**03:00 checkpoint:**
- One command builds all three files in under 15 min.
- The 8 trap tests are green.
- Dev scores ≥7/10 rules with zero missed "applies".
- The URL is live.

If anything is red: no overnight loop, and the morning goes to Musts only.

## 9. Changes versus decision.md

1. **Headline:** "training cutoff vs effective date", proven by S2 and hour 16. The self-repair loop becomes C1.
2. **Eval set:** widened with the brief's named rules, T1–T5 and the SF example, split into repair and gate halves.
3. **MCP:** moves from cut-first to S3. It is the second front door and S2b's tool arm.
4. **Demo hero:** the Berkeley one-question flow replaces Hoboken's algorithm ban.
5. **One question:** adds "how to check" and fact provenance, and covers building facts only.
6. **Engine:** a shared TypeScript engine replaces Python re-evaluation.
7. **Scoring policy, now explicit:** granularity, canonical citations, verbatim spans, keep-and-flag, unknown over omission, sidecar AST.
8. **Models:** `claude-opus-5-5` and `claude-haiku-4-5`.
