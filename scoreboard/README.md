# Chatbot scoreboard (issue #20)

The same 20 dated, city-level renter questions asked to a plain chatbot and to HomeRule. Run: `python3 -m scoreboard.run` (model calls are cached, so a rerun is free). Ask HomeRule one question: `python3 -m scoreboard.chat "Boston, MA" 2026-10-01 "How much can my rent go up?"`.

## Method (what goes on screen with the number)

- **Questions:** `questions.yaml`, 20 questions: the six card questions of the address page (docs/PRD.md, "The six questions") for a city on a date, across 9 cities and 5 dates, including the struck Boston ballot question and the NJ $50 application-fee cap.
- **Who wrote them, and the key:** written by Claude Code for Dimitar on 04.10.2026, before either chatbot ran. The answer key comes only from the challenge's own material (participant guide §7 and §9, `dev/change_tests.json`, and the brief's rule table as encoded in `tests/fixtures/assertions.yaml`), never from HomeRule's outputs. One key correction after the first run (AB 325 overstated; see `key_correction` in the file), applied to every arm.
- **Arms:** one model in every arm (`openai/gpt-6-luna`), so the only difference is the data.
  - *Plain:* the question alone.
  - *Plain + web search:* the question alone, with the provider's web search (`:online`).
  - *HomeRule:* the question plus HomeRule's records for that city, topic and date: the rules from `out/rules.compiled.json` with their status on that date, a source excerpt around each verbatim quote, and the findings (barred by state law, failed measure, open question). Retrieval is code (`chat.py`), not a model.
- **Grading:** `typesafe/jev-1.13` (a different model), blind to the arm, graded in shuffled order against the key: correct / partly / wrong.
- **Changes to HomeRule between runs:** the chatbot prompt got a glossary of the record types after one smoke question (Boston rent), before the first full run. After the first run, two data fixes, neither touching the prompt: provisions that share a citation are now kept as `details` of the rule instead of being dropped, and retrieval adds the source text after each quote. The first run is kept in `results/run1.json`.

## Results (04.10.2026)

| Arm | Run 1 | Run 2 (current) |
|---|---|---|
| Plain chatbot | 16/20 | 16/20 |
| Plain chatbot + web search | 19/20 | **20/20** |
| HomeRule | 15/20 | **18/20** (1 partly) |

Per question: `results/SCOREBOARD.md`; every answer and grade: `results/results.json`.

**What this shows:**
- The plain chatbot's four misses are all 2026 law: the NJ $50 fee cap, Jersey City's ban, the FAIR Act's start date in Newark, and the pending Massachusetts bills. With web search it gets all of them.
- On city-level questions a current model with web search does as well as HomeRule. HomeRule's advantages are elsewhere: an answer per building (built year, units, use), a verbatim quote and official link behind every answer, the same answer every run, and law that isn't on the web yet (the hour-16 ordinance).
- HomeRule's remaining miss is a data gap: the FAIR Act rule says "may not perform a coordinating function" without the definition, so the answer hedges.

Not legal advice.
