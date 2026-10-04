# tests

`make eval` (`python3 -m tests.eval_suite --supplemental`) writes `out/eval/report_supplemental.md` and `.json`; without the flag, only starter-corpus rules count (`report.md`). See `docs/PRD.md` (Done by the 12:00 freeze).

| Section | Checks |
|---|---|
| Integrity | Every quote is found verbatim in the pinned source text |
| Assertions | 27 rules the brief, the guide and `change_tests.json` name: present, right status, key value, effective date (`fixtures/assertions.yaml`) |
| Coverage matrix | 13 jurisdictions × 6 categories: rule / finding ("no rule", backed by text) / gap (sources exist, no rule) / empty |
| Change tests | T1-T5 from `dev/change_tests.json` against the sample addresses; T6 when an ingested document exists |
| `changes.json` | Writes `out/changes.json` in the guide's shape (`affected_address_ids`, `conflict_flag_address_ids`, `notes`) and scores it |
| Questions | 24 tuning (`fixtures/address_questions.yaml`) and 16 held-out (`fixtures/address_questions_holdout.yaml`) address questions, with conditional amounts |

Fixtures are expected answers and are never shown to a prompt. Address results use the engine's inputs, so `make eval` checks what `make build` scores: rules from `out/rules.compiled.json` (`engine/rules.py`), facts from I3 (`engine/facts.py`), the evaluator in `engine/evaluate.py`. `--extracted` reads rules from `out/extracted/` instead; `--lab-facts` uses the old I3 stand-in, for comparison. Engine unit tests and guards: `make test` (`tests/test_engine.py`).
