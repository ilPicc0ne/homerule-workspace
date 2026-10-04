# extract (Dimitar)

A · Extraction: corpus → `out/rules.json` + `out/rules.compiled.json` + `out/findings.json`. See `docs/ARCHITECTURE.md` (A · Extraction, interfaces I2, I7, I8). The model reads each law once; code decides applicability (decision 0002).

## Commands

| Command | Does |
|---|---|
| `make extract` | Index the corpus and the cleared supplemental sources; extract every document three times in parallel (samples `s0`-`s2`, each with the gate), majority vote into `out/extracted`; link findings, open questions, compile |
| `make check` | The full suite, run after any change to `extract/`, `engine/`, `tests/` or the contracts: extract, build, engine tests, eval, parity, hour-16 rehearsal |
| `make eval` | Assertions, coverage matrix, T1-T6, `out/changes.json`, address questions → `out/eval/report_supplemental.md` |
| `make ingest DOC=<path> JUR="Cambridge, MA" [ID=X002]` | Hour 16: one new text file → rules, findings, the affected addresses (no code or prompt change) |
| `make rehearse` | The hour-16 run on the fictional `tests/fixtures/synthetic/X001.txt`; removes it afterwards so it never reaches the outputs |
| `make freeze` | Before the hour-16 drop: lock the prompt digest (`extract/PROMPTS.lock`); `make eval` reports a mismatch |
| `make rerun DOC=D0xx` | Live re-extraction of one document with fresh model calls (cache bypassed via `EXTRACT_RUN`) |

Model calls are cached by request hash (`build/cache/`), so a rerun of `make extract` replays the same samples for free. A single run is not stable (the model words conditions and citations differently each time), which is why the pipeline extracts three samples and votes: a rule found in fewer than half the samples is dropped, and the kept version is the one whose results on the sample addresses agree with the others (`extract/vote.py`, report in `out/vote.json`). Luna's prompt renders the building facts from a pinned snapshot (`extract/facts.prompt.json`), so an edit to `contracts/facts.json` descriptions doesn't silently re-extract; eval fails if the vocabulary drifts. Every call is logged to `audit/calls.jsonl`. Key: `OPENROUTER_API_KEY` in `.env.local`. Models: Luna `openai/gpt-6-luna` (free-form extraction), Jev `typesafe/jev-1.13` (choice questions with calibrated confidence).

## Pipeline per document

1. **Index (code):** pin the text by hash, parse the header, evidence tier, section tree, date and boundary-phrase candidates.
2. **Jev J1-J4 (parallel, full document as state):** document type and status, section content type, section category, what each date marks.
3. **Luna L1:** obligations with I7 coverage conditions, exemptions, amounts, dated events, interactions and verbatim quotes. Same-city agency summaries are bundled; documents over 30,000 characters are split along the section tree with shared context and merged.
4. **Code checks:** quotes found in the source, conditions only over I7 facts, no circular references, every labelled category covered.
5. **Jev J5-J8:** cross-check Luna's closed fields (effect, headline, interaction type, fact/operator); a confident disagreement overrides.
6. **Luna L2:** one targeted repair call for whatever the checks flagged.
7. **Jev J9:** triage of conditions left `unparsed`, asked in two wordings; a guard for 5+ unit apartments is added only when one answer is confident and the other doesn't disagree.
8. **Gate G1-G6 (`gate.py`):** is each claim and key value supported by its quote, which date the rule starts, does the provision also regulate another topic (then one targeted Luna call), what status the text shows, which government made the rule (a city page restating state law, or a federal law, is not a city or state rule), and does the provision regulate the topic it is filed under (p(no) >= 0.9 demotes it from main rule).
9. **Vote (`vote.py`):** the three samples merged as above.
10. **Compile (`compile.py`):** effective dates (provision-scoped events, relative rules such as "first day of the sixth month after adoption"), status, I2 records with `source_span` materialised from the pinned text, I8 findings.

## Modules

| Module | Does |
|---|---|
| `corpus.py` | Index → `out/index/`, `out/inventory.json`; `build_supplemental()` indexes only sources with `use_for_rule_extraction: true` |
| `sections.py` | Legal structure as nested sections with offsets (`1950.5/c/5/A/ii`) |
| `parts.py` | Splits large documents into parts with header, outline, definitions and referenced sections as context |
| `jev_pass.py`, `jev_check.py` | Jev labels (J1-J4) and cross-checks (J5-J8) |
| `luna_pass.py` | Extraction, quote location, checks, repair, triage, pending-bill record |
| `status.py` | Corroborates a "draft" reading against the manifest's code-publisher links |
| `gate.py` | Verification gate G1-G6 |
| `vote.py` | Majority vote over the extraction samples |
| `open_questions.py` | The guide's known open questions (starter README) → `open_question` findings: our rule and source next to each competing claim, the claim's source matched to a manifest row by Jev. A law that two sources give effective dates for counts as adopted (the later date applies) |
| `links.py` | One Jev call over link-only manifest rows → `out/link_findings.json` (failed measures, bans with no corpus text) |
| `compile.py` | `out/rules.compiled.json` (all rules; other headline provisions under the same citation as `details`), `out/rules.json` (the scored file: every rule with a verbatim quote, from the starter corpus, cleared supplemental sources or an ingested document), `out/findings.json`. Effective dates with no date in the text use the statutory default: California statutes January 1 after enactment, New Jersey municipal ordinances 20 days after final passage |
| `changes.py` | `changes.json` in the guide's shape from the same evaluation as the lookups |
| `ingest.py` | Hour-16 ingest |
| `prompts.py` | Prompt lint (no test-suite value in a prompt) and the prompt digest / freeze |
| `audit.py` | `out/audit.json`: per rule, what the model extracted, what checked it, what code decided, and the calls behind it; `audit/builds.jsonl` |
| `llm.py` | OpenRouter client with cache and audit log |

## State (04.10.2026, eval with supplemental sources)

- Quotes: 1731/1745 verbatim in the pinned source (99.2%).
- Assertions over the brief's named rules: 26/27. Miss: Santa Ana (manifest link only). Jersey City Ord. 25-057 and amendments 25-076/25-098 come from supplemental sources S001/S016/S017 (cleared after a targeted browser download); their effective dates are not yet resolved. Berkeley ch. 13.63: the corpus text is the first-reading version with no date; adopted per the two published effective dates, from 2026-03-01 (the later one), flagged as an open question.
- Address questions: 24/24 tuning, 16/16 held out.
- T1 250/250, T2 90/90, T3 140/140 flips and 90/90 conflict flags, T4 110/110, T5 0 with IP 25-21 recorded as failed, T6 rehearsal 45/45 in about 24 s.
- State rent cap at 2026-10-01 over the 245 CA addresses: 118 superseded by local rent control, 27 applies, 100 unknown (98 have no year built, so the 15-year exemption is undecided; 2 were built in 1978, across LA's October 1978 cutoff).
- Known gaps: D058 is refused by the content filter on both models (logged in `out/extracted_failures.json`).
