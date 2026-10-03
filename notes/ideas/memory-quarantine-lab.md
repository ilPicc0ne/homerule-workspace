# Deep dive: Memory Quarantine Lab (c3 Databricks)

Status: basis for comparison only. The team's recorded focus is still c2 RealPage. Written Sat 03.10.2026, 20:30.

## 1. Fit verdict for Databricks: fits on the letter, weak on the spirit

Credible only under the brief's "AI research" sub-area. Judges will read memory hygiene for agents as AI engineering unless the agent under test does science and the bottleneck is measured as speed. Even with both fixes, breakthrough stays mid-range; a team with a molecule on screen beats us there.

| Requirement / criterion | Status | Fix |
|---|---|---|
| Omnigent orchestrates the live workflow | fits, unproven [unknown] | 22:00 spike (§6) |
| Specialist agents exchange outputs, use tools, adapt the plan | fits | Planner narrows or drops a lesson after a failed counterexample |
| ≥2 tests, choose by learning/feasibility/cost | fits | A: 60 random held-out claims (cheap per call, little information). B: ~15 claims matched to the lesson's trigger (most information per call). C: re-run only the claims that failed. Planner logs a score per test and picks one |
| Full loop Q→E→H→Exp→Result→Decision | fits | Each lesson is a labelled hypothesis; the result decides promote, narrow or reject |
| Bottleneck + measured improvement | **gap** | See metric below |
| Citations, run records, labelled hypotheses, approval gates | fits | Promoting a lesson is the consequential action; Omnigent policy enforces it |
| **Omnigent orchestration 30%** | strong | The approval gate is the product, not an add-on. A contextual policy ("after a regression, promotion needs a human") is exactly what Databricks markets |
| **Breakthrough potential 25%** | **weak** | Run it on SciFact so the agent under test verifies biomedical claims. Frame it as "autonomous labs (AVO ran 7 days unattended) compound wrong lessons; a falsification gate is what lets them run longer". Still meta, so cap expectations |
| **Acceleration & learning 20%** | **weak** | The original idea measures negative transfer, not speed. Fix below |
| **Scientific rigor 15%** | fits, with fixes | Paired evaluation on identical claims, temperature 0, no-memory control, frozen splits, bootstrap CI, small-n caveat stated |
| **Creativity & responsibility 10%** | fits | Memory-version rollback, human sign-off, lessons labelled agent-generated |

**Acceleration metric (the fix).** Bottleneck: trusting what a self-improving research agent has learned. Today that means a human reads every lesson and its traces, or trusts it blind.
- Primary: **LLM calls to reach a target held-out accuracy** (e.g. baseline +5 pts on SciFact dev), compared across three arms: no memory, immediate adoption, quarantine-gated. Gate calls count against the quarantine arm. Multiplier = calls(ungated) / calls(gated). If ungated never reaches the target, report that directly and claim no multiplier.
- Secondary: **human review minutes per correctly promoted lesson**. Arm 1: review everything by hand from the traces. Arm 2: review only lessons that passed the gate, with the evidence grid attached. Timed on ≥10 lessons. n is small and the reviewer is one of us, so say both.
- Report the observed ratio with CI, even below 1×.

## 2. One-liner
Before a research agent may remember a lesson, the lesson has to survive counterexamples it has never seen, and a human signs off on the promotion.

## 3. User and job
User: an AI-research engineer running a self-improving literature agent (here a claim verifier) unattended over days. [assumed: no interview] Legal-aid niche dropped (problem_niche 0).
Job: "When my agent comes back from an overnight run with 40 new lessons in memory, I want to know which to keep without reading 40 traces, so I can let it run longer without it quietly getting worse." [assumed]

## 4. Public evidence
- Memory built from stored trajectories mixes successes with hallucinations and errors, so errors accumulate. [verified] https://arxiv.org/pdf/2605.06716
- Governing evolving agent memory is an open problem (SSGM framework). [verified] https://arxiv.org/pdf/2603.11768
- Agent-memory evaluations hide confounds and need controlled baselines, which justifies our no-memory arm. [verified] https://arxiv.org/pdf/2606.29914
- Mem0, Letta and Zep store and retrieve memory; write-gating exists as salience scoring or a guardian model, not as held-out counterexample tests. [verified] https://dataaspirant.com/blog/mem0-vs-letta-vs-zep/ . That no product does held-out gating is [assumed].

## 5. Scope
In: one user, one workflow. A SciFact claim verifier (BM25 + Haiku) fails, then lessons are proposed, quarantined, tested against counterexamples, then promoted or rejected with human approval. Three-arm experiment. Deployed lab notebook.
Out: training, legal data, open literature APIs, second domain, auto-promotion.

## 6. Riskiest spike (check by 22:00)
1. **Omnigent (Dimitar):** one session with ≥2 agents, one custom tool (`run_eval`), and a policy that blocks `promote_lesson` until a human approves. Pass = the block fires in the UI and the approval goes through. Policy YAML syntax is [unknown]; the docs only show the UI route.
2. **Signal (Silvan):** baseline verifier on 60 SciFact dev claims, paired run with one hand-written good lesson and one deliberately misleading one. Pass = baseline 45–85% and the misleading lesson costs ≥5 claims. Without a measurable negative-transfer signal there is no experiment.

## 7. Architecture
```
Scientist ── objective, budget, approvals ──► Omnigent session (open source, laptop; shared session URL)
  ├ Planner        (Claude Code, Sonnet)  owns: which test next (A/B/C) within budget
  ├ Diagnostician  (Claude Code, Sonnet)  failed traces → lesson candidates [HYPOTHESIS, cites claim IDs] → memory/quarantine/
  ├ Challenger     (Codex or a 2nd model)  lesson → counterexample spec (claim IDs likely to break it); different model reduces self-confirmation
  ├ Evaluator      (custom agent = Python tool run_eval) memory vX × claim set → results JSONL
  └ Safety/Curator (Claude Code, Haiku)    flags regressions; calls promote_lesson
        ▼
Verifier under test: BM25 over 5,183 abstracts + Haiku verdict (SUPPORT/REFUTE/NEI), lessons injected
        ▼
runs/*.jsonl + memory/v*.json (git) ──export──► Vercel Next.js "Lab notebook"
```
Policies: P1 session cost budget, soft $2 / hard $10, blocks Opus above the hard limit [verified that the policy exists: https://omnigent.ai/quickstart/policies]. P2 contextual: once a lesson has a regression on record, `promote_lesson` needs human approval [verified concept: https://www.databricks.com/blog/contextual-policies-omnigent-using-session-state-better-govern-ai-agents]. P3 tool permissions: only the Curator writes `memory/approved/`.
Live demo (clickable, not localhost): lesson cards with status, a lesson × claim counterexample grid, the three-arm chart (accuracy vs LLM calls), cited abstracts with DOI links, agent specs and policies, a replay of the recorded session timeline. The live Omnigent run itself appears in the video.

## 8. Data
**SciFact** (recommended): 1,409 expert-written biomedical claims, 5,183 abstracts [verified] https://aclanthology.org/2020.emnlp-main.609/ . Licence: claims CC BY 4.0, corpus ODC-By 1.0, code Apache 2.0 [verified] https://github.com/allenai/scifact/blob/master/LICENSE.md . Download from the allenai repo, not Kaggle. Test labels are hidden, so use train for mining failures and the gate pool, and dev (300) as the final held-out set. [assumed: confirm the split sizes on download]
HotpotQA: CC BY-SA 4.0 [verified] https://hotpotqa.github.io/ . Wikipedia trivia fails the "science" read and share-alike binds derived data; SciFact is safer on both.

## 9. Build plan
| Time | Silvan | Dimitar |
|---|---|---|
| Sat 20:30–22:00 | Spike 2: SciFact, BM25, baseline + paired harness | Spike 1: Omnigent, 2 agents, tool, policy gate |
| 22:00 | **Go / no-go** | |
| 22:00–01:00 | Frozen splits, three-arm runner, run-record schema, Next.js skeleton deployed on Vercel | Agent specs, shared research record, Planner choosing A/B/C under budget |
| 01:00–06:00 | Sleep | 01:00–03:00 first end-to-end loop, start the overnight three-arm run under P1; sleep 03:00–08:00 |
| 06:00–09:00 | Dashboard on real records, cited evidence, README | Sleep until 08:00, then fix the loop |
| 09:00–12:00 | Metric + CI, review-time test, next experiment, agent specs doc | Second loop showing the plan adapting, policies files, re-run with seeds |
| **12:00** | **Feature freeze** | |
| 12:00–14:30 | Demo video script and recording; team video | Tech video; repo public |
| 14:30–15:00 | Submit, check the Vercel link, LinkedIn post | Final run-record export |

## 10. Demo story
Self-improving research agents now run for days, and nobody checks the lessons they write into memory. An AI-research engineer starts our lab on a biomedical claim verifier and approves the objective and budget. Agents turn failures into labelled lesson hypotheses, the Planner picks the targeted counterexample test as best value, and the Evaluator runs it. The aha: a lesson that fixes three claims breaks two unseen ones, quarantine catches it, Omnigent blocks promotion, and the Planner narrows the lesson and retests. Why now: autonomous runs like AVO's 7 days only scale if memory can't silently rot, and we show the cost of that check in measured calls.

## 11. Kill criteria
- **22:00, switch to c2** if: no Omnigent policy gate works, or baseline accuracy is outside 45–85%, or the misleading lesson moves fewer than 5 of 60 claims. 17 h is still enough for c2.
- **03:00, cut scope, no switch:** if no auto-generated lesson has a non-zero paired effect, or the three-arm run cannot finish within budget, use planted labelled misleading lessons as the controlled experiment and report the gate's catch rate and calls cost. A track switch after 03:00 is not credible.

## 12. Compared with c2
- c2 Rights Engine Repair (rank 2, composite 0.64) vs this idea (rank 10, 0.48; problem_niche 0, retell 0.03).
- Both have the same core, AVO-style variants gated by held-out checks. In c2 that loop directly raises a number the judges' own script scores (75%).
- c3 gives a stronger sponsor showcase (policy gate) and novelty, but breakthrough (25%) and acceleration (20%) are capped by being meta.
- It also runs against both profiles: Silvan avoids research-heavy work, Dimitar doubts research is feasible in 24 h.
- Recommendation: stay with c2 and carry the quarantine gate into Rights Engine Repair as its self-repair loop.
