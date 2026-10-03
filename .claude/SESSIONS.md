## 2026-10-03T20:00Z — Hack-Nation 7 kickoff: challenge pick, HomeRule concept, spec, workspace

**Decisions:**
- c2 RealPage over c3 Databricks / c1 ElevenLabs — *why:* both runs yes, team fit, script-scored track; Memory Quarantine folded into c2 as gated self-repair (Could).
- Headline "A model has a training cutoff; a law has an effective date" (deep-work concept), renter-empowerment alternative proposed.
- Filtered rule data instead of RAG; conflicts flagged; renter as primary user (meeting 20:47).
- Two repos: snp (frozen planning) and homerule-workspace (private) with filtered public export to ilPicc0ne/homerule.

**Surprises:**
- No score.py/dev key in the participant pack; address-data traps; no mentor for c2; rubric reweighted after official criteria (technical depth, communication, innovation).

**Next:**
- M0 calibration, 22:00 spike, Discord questions, D1–D7, publish Sun ~14:00.

## 2026-10-03T22:06Z — PRD as master, contracts, domain + email, landing page, issues

**Decisions:**
- PRD (docs/) master with feature status; ARCHITECTURE for the how; spec/concept/decision archived — *why:* one source, readable.
- Contracts jurisdictions.json (hierarchy, aliases, schema_name, Census GEOIDs) and facts.json — *why:* the two joins between extraction and addresses.
- Address dashboard + rule page + jurisdiction search instead of own chatbot; email alerts per address; files as data store — *why:* scoring, guardrails, reproducibility.
- yourhomerule.com, Resend (EU), Upstash for subscriptions; tagline "Your rights as a renter, for your exact address." — *why:* renter angle without casting the sponsor's customers as opponents.
- Issues per task with proposed owners; AGENTS.md workflow (branches, PRs, status in PRD).

**Surprises:**
- Census geocoder: 485/500 raw, 493 after normalisation, jurisdiction 500/500.
- First mail in spam; `!` commands can't do interactive purchases/logins; GitHub 504 dropped one issue.
- Crowd simulation 5.6 → 6.4 after fixes; problem-critic found the jurisdiction-format risk (schema strings).

**Next:**
- Review and ship the demo site (s/demo-site); Dimitar on #27; address lookup #7.

## 2026-10-03T22:20Z — Address iteration planned, worktrees tidied

**Decisions:**
- Iteration goal widened from batch #7 to live search with jurisdiction tree (#7 + #10) — *why:* visible on the site, proves scalability.
- TypeScript resolver shared by /api/resolve and make resolve; contracts synced into web/ with a drift test — *why:* one implementation; Vercel uploads only web/.
- Tree with federal level, township and unincorporated handling; use-code units as known facts behind a switch.
- Worktrees in .worktrees/ (address moved, landing removed; demo to move later).

**Surprises:**
- Live Census probe: East LA unincorporated despite postal LA; Brookline town without a Census place; place-only input gets no match.

**Next:**
- Fresh session in .worktrees/address with the kickoff prompt; review demo site; Dimitar on #27.
