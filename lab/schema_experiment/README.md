# Schema experiment: does code-decides beat model-decides?

Issue #3 (Jev test) and the evidence behind decision 0002. Run: `python3 -m lab.schema_experiment.experiment` (model calls are cached under `build/cache`, so a rerun is free).

## Setup

- **24 address questions** (`tests/fixtures/address_questions.yaml`): real sample addresses, expected answers from the brief, the participant guide, `change_tests.json` and the PRD demo table. They cover SF / LA rent control vs the state cap, cutoff years, Boston and Cambridge (no rent cap), T1, T3, T4, the 2030 sunset of Civ. Code §1947.12 and conditional deposit amounts.
- **Arm A ("plain approach")**: rule records with the starter-schema fields only; Luna (`openai/gpt-6-luna`) decides each address on each date from that text plus the building facts. Three runs.
- **Arm B (rules as code)**: the same records with checkable conditions, dated events and conditional amounts; `evaluate.py` decides.
- **Part a**: hand-written reference records for the 9 slice laws (`gold_slice.yaml`). Can the schema carry the answers?
- **Part b**: what the extraction pipeline produced from 13 corpus documents (`out/extracted/`). Can we fill it today?

## Results (04.10.2026, 01:15 CEST, after code checks, repair and the gate)

| | Arm B: code decides | Arm A: Luna decides (3 runs) |
|---|---|---|
| a · reference records | **24/24**, amounts 3/3, identical every run | 23 / 18 / 23 of 24, amounts 2 / 1 / 2 of 3, 18/24 answers identical across runs |
| b · extracted records | **23/24**, amounts 2/3, identical every run | 19 / 20 / 20 of 24, amounts 1 / 2 / 2 of 3, 17/24 answers identical across runs |

- **Part a**: the schema can hold every answer and code gives the same answer every time. Caveat: the reference records were written knowing the questions, so 24/24 is a ceiling, not a result.
- **Part b**: on what the pipeline extracts today, code decides 23/24 vs 19-20/24 for the plain approach, and gives the same answer every run (A changes 7 of 24 answers between runs). B wins what the starter schema can't express: the 2030 sunset of §1947.12 (Q13, A wrong in 3/3 runs), dated transitions (Q8, Q9) and missing building facts kept as `unknown` (Q4, A guessed in 2/3 runs).
- B's one miss (Q2) is an extraction defect: the state cap's exemptions are nested (the 15-year exemption is an exception to the exemption list), and the extracted predicate returns `unknown` for a 2005 SF building where the statute says it applies. One amount miss (Q11): the tenancy-in-common deposit is extracted as a conditional value the facts can't decide.
- The earlier run (00:10, 11/24) failed on three extraction defects, all now caught by code checks: local coverage left `unparsed`, an exemption extracted as `always`, pending bills with no obligations.

**Conclusion:** keep rules as code (decision 0002). The full-corpus numbers are in `out/eval/report_supplemental.md` (`make eval`).

## Jev (issue #3)

One `/api/alpha/decisions` call per document with every question (document type and status, per-section content type and category, per-date meaning) beats one call per section: D025, 160 questions in 1.8 s for $0.0023 vs 76 calls; category labels are better with the whole document as context (per-section calls labelled the small-landlord conditions "rent increase limits"). Content-type labels (rule vs procedure) are fuzzy either way, so they are hints only.

Caveats: 24 questions over 9 laws; arm A got the resolved legal city and computed effective dates (generous); amounts are scored by keywords.
