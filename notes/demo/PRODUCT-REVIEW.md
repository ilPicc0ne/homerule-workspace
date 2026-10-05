# Product review script, tech video, team video

Private, never published. For a reviewer or judge who walks HomeRule cold on https://yourhomerule.com, plus the outlines of the two other submission videos. No evaluator framework exists in `/Users/silvan/claude/personal/code/tools/` (checked 04.10: only `demo-video` with its `VIDEO_CHECKLIST.md`), so the scoring sheet uses the brief's own judge criteria (brief p.6) and a plain task-success scale.

## 1. How to run it (15 minutes per reviewer)

- **Reviewer:** someone outside the team (another hacker, a mentor), on their own phone first, then a laptop. PRD "Done by the 12:00 freeze" asks for J1–J4 "tried by someone outside the team".
- **Facilitator (Silvan or Dimitar):** reads each task aloud exactly as written, then stays silent. No hints, no "try clicking…". Notes time, the first click, every hesitation, and anything said aloud. If the reviewer is stuck for 60 s, mark the task failed and move on.
- **Start state:** a fresh tab on `https://yourhomerule.com/`. Never give an address ID or a URL.
- **Say first:** "This is a prototype that shows which housing rules may apply to an apartment. It is not legal advice. Please think aloud. We are testing the product, not you."
- **Don't:** submit the alert form with a personal email (closed test: it saves the request but sends only to allowed inboxes). Task 4 uses the example-alert preview.

## 2. Tasks per journey

Answers in *italics* are what production showed on 04.10 ~06:40 (`notes/demo/DEMO.md`). Re-check after the next production update.

### Task 1 · J1 What applies at my address
- **Say:** "You rent at 3515 Fillmore Street in San Francisco and just got a rent-increase notice. Find out what limits your increase, and which law says so."
- **Success:** reaches `/a/A0016` via the search, opens the rent tile, names the city limit (*1.6% for Mar 2026–Feb 2027*) and says the state cap is replaced by the city rule (*Show the law*), in under 60 s (PRD J1).
- **Observe:** typed vs chip; did they find "Show the law"; did they read "Your unit may differ"; did they notice the "Not legal advice" banner.
- **Ask after:** "In your words, what can your landlord do?" (must not hear "the app says my increase is illegal") · "How sure is the site, and how do you know?" · "Who would you call?"

### Task 2 · J2 An honest unknown
- **Say:** "Your friend Marco rents at 10635 Sherman Grove Ave in Los Angeles. Is his rent increase limited by LA's rent control?"
- **Success:** says "the site doesn't know" and names what would settle it (the date the city first approved the building for living in; *production before the J2 fix shows "an exception in the law's text" and "whether the owner lives in the building" instead: score that as partial*) and who can tell him (*LA Housing Department*).
- **Observe:** whether "We're missing one fact" reads as an error or as an answer; whether they look for an input field (J2 step 3, "you told us", is not built).
- **Ask after:** "What would you do next?" · "Did the site guess?" · "Was anything confusing in the yellow box?"

### Task 3 · J3 What's coming
- **Say:** "You rent at 1064 Summit Avenue in Jersey City. Is anything about to change in the rules for your building?"
- **Success:** finds *Next change: Jul 1, 2027 — software that sets rents* and explains in their words that a state and a city rule may overlap and the site doesn't decide which wins (*"Possible overlap, not decided"*). Bonus: opens "What changed, old → new" (`/changes/A0012`).
- **Observe:** whether they look for a date control (none exists); whether "flagged" reads as a warning or a verdict.
- **Ask after:** "From when does the new rule apply?" · "Which rule wins in Jersey City?" (right answer: "the site says it's for a human to decide").

### Task 4 · J4 Tell me when the law changes
- **Say:** "You want an email when the rules for 834-836 Raymond Blvd in Newark change. Show me how you'd set that up, and what such an email would look like. Don't send anything."
- **Success:** finds "Get alerts" (bar or Coming up) and the email field; opens "See an example alert"; recognises the label *"Preview — simulated, nothing is sent"*.
- **Observe:** whether they understand "we ask you to confirm first"; reaction to the footer placeholder (GAPS #7).
- **Ask after:** "What would make you trust this email?" · "Would you sign up? Why not?"

### Task 5 · J5 Compare before I move (not built)
- **Say:** "You are choosing between 3515 Fillmore St and 36 Hoff St, both in San Francisco. Which one protects you more on rent increases?"
- **Success (what the product can do):** opens both and states the difference (*city rent control 1.6% vs state cap 5% + inflation, max 10%*). There is no compare view; record how long the two lookups take.
- **Observe:** whether they search for a compare button; whether they read "Your unit may differ".
- **Ask after:** "Would a side-by-side view help? What would you put in it?" (input for the P1 compare feature; PRD: no ranking, no rent prices).

### Task 6 · J6 Which buildings does this bill reach (advocate)
- **Say:** "You work for a tenant group in Boston. Massachusetts has a bill on rent-setting software, S.2983. Is it law, and which of the sample buildings would it reach?"
- **Success:** reaches `/r/MA-ALG-2983` (via an address in Boston/Cambridge → Software tile → Show the law → "See the full rule…"), says *Proposed, not law* and *110 Massachusetts addresses, all pending*; opens the official source link.
- **Observe:** the path they take (there is no search for bills); whether they find the audit trail and understand "reasoning boundary".
- **Ask after:** "What did the model do, and what did code decide?" · "Would you trust this list for a campaign? What's missing?"

### Task 7 · J7 Take action
- **Say:** "Back to Marco in Los Angeles. He wants to talk to someone before he answers his landlord. What should he have ready, and whom can he call?"
- **Success:** finds *Talk to someone first: Los Angeles Housing Department* with the "not yet checked by us" note and the checklist *Your rent increase notice / Your lease / Your move-in date*.
- **Observe:** whether they open "Ask your landlord" (it asks about owner occupancy, GAPS #13); whether any line reads as advice.
- **Ask after:** "Did the site tell you what to do, or where to ask?" (the right answer is the second).

### Task 8 · Outside the scope (guardrail)
- **Say:** "Your cousin rents in Austin, Texas. What does HomeRule say for her?"
- **Success:** sees "Not covered: HomeRule has law for 3 states and 10 cities". *On the home search, "Austin" or "New York" + Enter shows nothing (GAPS #12); `/where` answers it. Score "found the not-covered answer" or "got no answer".*

## 3. Scoring sheet (one per reviewer)

Task success: **2** done unaided · **1** done with hesitation > 30 s or partly right · **0** failed or wrong conclusion. A wrong legal conclusion ("the site says my increase is illegal") is a **0** and a finding, whatever else happened.

| Task | Success 0–2 | Time (s) | First click | Wrong conclusion? | Quote |
|---|---|---|---|---|---|
| 1 J1 | | | | | |
| 2 J2 | | | | | |
| 3 J3 | | | | | |
| 4 J4 | | | | | |
| 5 J5 | | | | | |
| 6 J6 | | | | | |
| 7 J7 | | | | | |
| 8 Scope | | | | | |
| **Total /16** | | | | | |

Judge criteria, rated by the reviewer after all tasks (1 = no, 5 = yes):

| Brief criterion (points) | Statement | 1–5 |
|---|---|---|
| Plain language and usability (10) | "I understood every answer without a lawyer." | |
| | "I found what I needed on my phone." | |
| Responsible design (10) | "I always knew how sure the site was, and why." | |
| | "I could see where each answer came from (quote, date, link)." | |
| | "The site never told me what to do about my own case." | |
| Scalability (5) | "I believe this would work for my city with its laws added." | |

Three open questions to close: "What would stop you from using this?" · "What did you expect that wasn't there?" · "Who would you send this to?"

Pass bar before the freeze: two reviewers, total ≥ 12/16 each, no wrong legal conclusion, every responsible-design statement ≥ 4.

## 4. Tech video outline (Dimitar, 2–3 min)

The brief (p.6) requires on screen: the `score.py` report on the dev set, the T1–T6 results, and the system processing the hour-16 ordinance; the rules add "a live rerun in the demo". `score.py` and the dev key are not in our pack (`data/realpage-starter` README: "excludes the scoring script, dev answer key and hour-16 ordinance"): say so in one sentence and show `make eval` instead, unless the organisers released them.

| # | Segment | On screen | Source in the repo |
|---|---|---|---|
| 1 | Architecture (20 s) | The A→B→C→D diagram: corpus → extraction → `rules.json`; addresses → Census → `addresses.resolved.json`; engine at an as-of date → `lookups.json`; run twice → diff → `changes.json`, change log, alert | `docs/ARCHITECTURE.md` Overview |
| 2 | The bet (15 s) | "The model reads the law once; code decides coverage every time." Rule page audit trail on `/r/CA-RENT-1947.12` (Extracted by the model │ reasoning boundary │ Decided by code) | `out/audit.json`, `/r/[id]` |
| 3 | Extraction (25 s) | `make extract` stages (Jev classify, Luna extract, gate, quote check, compile); one record in `out/rules.json` with its verbatim quote; prompt lint + `make freeze` digest | `extract/`, `extract/PROMPTS.lock`, `make eval` "Prompts" line |
| 4 | Addresses (15 s) | 500/500 resolved, 492 by Census in the expected city, 38 mailing ≠ legal city, facts as ranges with named assumptions | ARCHITECTURE B "Measured on all 500" |
| 5 | Eval report (30 s) | `make eval` scrolled: assertions 26/27, change tests T1 250 · T2 90 · T3 140 + 90 flags · T4 110 · T5 0 (all equal to expected), questions 24/24 and holdout 16/16, quotes check | `tests/eval_suite.py`, `out/eval/report_supplemental.md`; re-run on a clean checkout first (GAPS #4) |
| 6 | Determinism (10 s) | `make build` twice, `shasum outputs/*.json` identical | ARCHITECTURE I4 (checked 04.10 06:30: rebuild byte-identical) |
| 7 | Hour 16 (40 s) | `date; make ingest DOC=<hour-16 file> JUR="Cambridge, MA" ID=X002; date` → new rules, effective date, T6 affected addresses; `outputs/changes.json` T6 | `extract/ingest.py`, `make ingest` |
| 8 | Live rerun (20 s) | `make rerun DOC=D0xx` (pick a short document, e.g. one with < 10 KB) with the field-level diff | Makefile `rerun` |
| 9 | Chatbot check (15 s) | Table: plain 16/20 (4 wrong, all 2026 law) · plain + web search 20/20 · HomeRule 18/20 (2 partly, 0 wrong); method line (questions written before any run, key from the brief, blind grader) | `scoreboard/README.md`, `scoreboard/results/SCOREBOARD.md` |
| 10 | Audit trail and limits (15 s) | `audit/calls.jsonl` line (stage, model, request hash, cost); `build/cache` keyed by hash; limits: Santa Ana ban not in corpus, San Diego/Berkeley no year built → unknown, Hoboken citation | ARCHITECTURE "Audit and evaluation" |

Close: "Every number on screen comes from one command on a fresh clone. Not legal advice."

## 5. Team video outline (both, 30–60 s)

Facts below come from the kickoff notes (`notes/meetings/2026-10-03-1804-kickoff.md`); each person checks their own lines before recording.

**Silvan Geser**
- Zurich; builds AI products; once worked at a real-estate startup.
- In HomeRule: the address lookup (500/500 to the legal city), the rule engine, the renter page and the alerts.
- Why this challenge: "Rules depend on the exact address and the date. That's a data problem, not a chatbot problem."

**Dimitar Dimitrov**
- Day job: helping lawyers with AI.
- In HomeRule: extraction from the law corpus, the quote check, the eval suite and the hour-16 ingest.
- Why: "A renter should get the law, quoted and dated, not a guess."

Shared close (one line each): what we'd build next (the compare view and a date control) · "Not legal advice: the law, made visible at the level of one address."
