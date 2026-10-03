# Schema experiment: does code-decides beat model-decides?

Issue #3 (Jev test) and the evidence behind decision 0002. Run: `python3 -m lab.schema_experiment.experiment` (model calls are cached under `build/cache`, so a rerun is free).

## Setup

- **24 address questions** (`tests/fixtures/address_questions.yaml`): real sample addresses, expected answers from the brief, the participant guide, `change_tests.json` and the PRD demo table. They cover SF / LA rent control vs the state cap, cutoff years, Boston and Cambridge (no rent cap), T1, T3, T4, the 2030 sunset of Civ. Code §1947.12 and conditional deposit amounts.
- **Arm A ("plain approach")**: rule records with the starter-schema fields only; Luna (`openai/gpt-6-luna`) decides each address on each date from that text plus the building facts. Three runs.
- **Arm B (rules as code)**: the same records with checkable conditions, dated events and conditional amounts; `evaluate.py` decides.
- **Part a**: hand-written reference records for the 9 slice laws (`gold_slice.yaml`). Can the schema carry the answers?
- **Part b**: what the extraction pipeline produced from 13 corpus documents (`out/extracted/`). Can we fill it today?

## Results (04.10.2026, 00:10 CEST)

| | Arm B: code decides | Arm A: Luna decides (3 runs) |
|---|---|---|
| a · reference records | **24/24**, amounts 3/3, identical every run | 23 / 18 / 23 of 24, amounts 2 / 1 / 2 of 3, 18/24 answers identical across runs |
| b · extracted records | **11/24**, amounts 3/3 | 19 / 18 / 20 of 24, amounts 2/3, 21/24 identical across runs |

- **Part a**: the schema can hold every answer and code gives the same answer every time. The plain approach is mostly right but drifts between runs (one run called a 1926 SF building "unknown") and never gets a conditional deposit amount. Caveat: the reference records were written knowing the questions, so 24/24 is a ceiling.
- **Part b**: all 13 of B's errors come from three extraction defects, each detectable by code:
  1. local coverage left `unparsed` (SF, LA): 8 answers;
  2. an exemption extracted as `always` (FAIR Act): 3 answers;
  3. pending MA bills extracted with no obligations: 2 answers (both arms).
- Where extraction was right, B wins exactly what the starter schema can't express: the 2030 sunset (A wrong in 3/3 runs) and the conditional deposit (A wrong in 3/3 runs).

**Conclusion:** keep rules as code; the work is in filling the conditions reliably. Extraction gets code checks plus one targeted Luna repair call, and `parse_status: failed` rules need an engine fallback (decision for the engine owner).

## Jev (issue #3)

One `/api/alpha/decisions` call per document with every question (document type and status, per-section content type and category, per-date meaning) beats one call per section: D025, 160 questions in 1.8 s for $0.0023 vs 76 calls; category labels are better with the whole document as context (per-section calls labelled the small-landlord conditions "rent increase limits"). Content-type labels (rule vs procedure) are fuzzy either way, so they are hints only.

Caveats: 24 questions over 9 laws; arm A got the resolved legal city and computed effective dates (generous); amounts are scored by keywords.
