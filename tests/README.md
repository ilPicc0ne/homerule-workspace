# tests

`make eval` (`python3 -m tests.eval_suite --supplemental`) writes `out/eval/report_supplemental.md` and `.json`; without the flag, only starter-corpus rules count (`report.md`). See `docs/PRD.md` (Done by the 12:00 freeze).

| Section | Checks |
|---|---|
| Integrity | Every quote is found verbatim in the pinned source text; every `quoted_span` in the scored `rules.json` too (PRD: 100%) |
| Prompts | Lint: no test-suite citation, date or key value in a prompt; digest vs `extract/PROMPTS.lock` |
| Assertions | 27 rules the brief, the guide and `change_tests.json` name: present, right status, key value, effective date (`fixtures/assertions.yaml`) |
| Coverage matrix | 13 jurisdictions × 6 categories: rule / finding ("no rule", backed by text) / gap (sources exist, no rule) / empty |
| Change tests | T1-T5 from `dev/change_tests.json` against the sample addresses; T6 when an ingested document exists |
| `changes.json` | Writes `out/changes.json` in the guide's shape (`affected_address_ids`, `conflict_flag_address_ids`, `notes`) and scores it |
| Questions | 24 tuning (`fixtures/address_questions.yaml`) and 16 held-out (`fixtures/address_questions_holdout.yaml`) address questions, with conditional amounts |

Fixtures are expected answers and are never shown to a prompt. Address results use the engine's inputs, so `make eval` checks what `make build` scores: rules from `out/rules.compiled.json` (`engine/rules.py`), facts from I3 (`engine/facts.py`), the evaluator in `engine/evaluate.py`. `--extracted` reads rules from `out/extracted/` instead; `--lab-facts` uses the old I3 stand-in, for comparison. Engine unit tests and guards: `make test` (`tests/test_engine.py`).

## Who-to-ask contacts (issue #32)

`python3 tests/check_contacts.py --offline` checks the contact schema and all 78
jurisdiction/topic fallback routes. `python3 tests/check_contacts.py` additionally
reads each distinct source URL once and checks its phone, verbatim quote (whitespace
folded), and contact link. Relative links are resolved against the source URL.
Robots policies, redirects, and request delays are respected; blocked pages or
JavaScript-only content produce failures, not a false pass or deleted contacts.
`python3 -m unittest tests.test_check_contacts` tests the checker without network access.

Lookup is city+topic, city+`*`, state+topic, state+`*`. Follow jurisdiction parents
through display-only counties to find the state. A fallback is a general referral,
not a claim that the contact enforces every rule. Display `phone_display`, including
extensions; `phone` is the E.164 base number. Unknown service fees must not be shown
as free, and legal-aid eligibility does not guarantee representation.

At the 2026-10-04 review, Newark's local entries were omitted pending the existing
CivicPlus terms review; its six topics resolve to New Jersey contacts. Online
verification limitations and conflicting official numbers are recorded in the PR.
