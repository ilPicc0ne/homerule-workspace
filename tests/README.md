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

`python3 -m tests.hour16_question <DOC> [address_id]` (also in `make rehearse`): hour 16 asked as a question. Every sample address without vs with the new document the day after it takes effect, then one address answered as the address page answers it (each change, the engine's explanation, the renter verdict and its why) and by the HomeRule chatbot.

## Fresh-run stability (2026-10-04, 05:00-07:15)

`make check` replays cached model calls, so it shows the shipped extraction is reproducible, not that a new
extraction lands in the same place. Fresh extractions (new cache keys, every Luna and Jev call live), each a
3-sample vote over all documents:

| Run | A1 | Tuning | Held-out | T1-T5 |
|---|---|---|---|---|
| Shipped (s0-s2) | 26/27 | 24/24 | 16/16 | pass |
| Fresh f0-f2 (Jev with full document context inside extraction) | 26/27 | 20/24 | 14/16 | pass |
| Fresh g0-g2 (Jev context as shipped) | 25/27 | 24/24 | 15/16 | pass |
| Vote over all nine samples | 26/27 | 24/24 | 16/16 | pass, but Newark § 19:2-3.1 dropped (4/9 samples mark it as the main rule) |

Recurring weak spots in fresh samples: which provision is marked the main rule when a law states several rent caps
(Newark's 4% CPI cap vs the 25% ceiling for special increases), San Francisco's pre-1979 coverage (lost in most fresh
samples), an "unless" clause encoded with the wrong polarity (Cal. Civ. Code § 1947.12, 15-year exemption). A
code rule promoting a law's lowest cap fixed Newark but promoted a Berkeley regulation without coverage (H01), so it
was not shipped. Full document context for Jev is kept where it helped and changed nothing else (renter impact,
exemption checks, after the vote); inside extraction it stays as shipped.

