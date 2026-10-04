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

## 2026-10-04T00:08Z — Renter page redesign loop, PRD J7, real map

**Decisions:**
- Full demo site judged too heavy → one-view renter page; mockups v1 (lean), v2 (deep-work, UX patterns), v3 (renter-critique fixes) in lab/ui-proposal on s/demo-site — *why:* renter-friendly, actionable.
- Labels, plain words, "Show the law" second level, no cap comparisons, facts not conclusions — *why:* critique found legal-advice risk.
- PRD: J7 Take action, contacts (P0, Dimitar data), action helpers (P1), legal-aid finder (P2), map = MapLibre + OpenFreeMap + TIGER (P1); PRs #37, #38.
- Contacts data → Dimitar (#32); I8 findings into engine (#8) and page (#9).

**Surprises:**
- Dimitar ahead: #2, #3, #6, #21, #27 closed; rules.json 58 records + findings.json committed.
- deep-work v2 took ~45 min; iterative loops better for design.

**Next:**
- Review v3 → rebuild address page locally; address session results; engine with I2 + I8.

## 2026-10-04T00:16Z — Subscription store

**Decisions:**
- Upstash Redis `homerule-subscriptions` (free) for email alerts, env vars only in Vercel; no Neon — *why:* law/address data stay files in git, Dimitar pushes, we deploy.

**Surprises:**
- Vercel CLI marketplace install added two Upstash agent skills without asking; vetted after the fact (Markdown only), PR #42.

**Next:**
- Unchanged: review v3 → rebuild address page locally; address session; engine with I2 + I8.

## 2026-10-04T01:15Z — Address resolver, engine, change log (#7, #10, #8, #11)

**Decisions:**
- Resolver in TypeScript (`web/lib/resolve/`) for batch and web; Census cache committed; `/where` + `/api/resolve`; autocomplete over own data — *why:* one implementation, offline determinism.
- Three level states + `county_law` in I1; federal note "applies everywhere" — *why:* honest "no rules" vs "not covered".
- I3 aligned with the extraction's APT5 guard (subsidised false / Boston A 7+, tagged) — *why:* 0 → 468 rows decidable.
- Engine = adapter + CLI around Dimitar's evaluator (#36); change log + email from one diff (#45); `out/` intermediates published, `data/` not (licence TBD).
- No feature without asking first.

**Surprises:**
- Census silently matches other cities; range normalisation alone fixed A0009.
- Pressure test found the subsidy blocker before the engine was built.
- Parallel subagents in isolated worktrees merged fast-forward without conflicts.

**Next:**
- Merge #30 → #29 → #36 → #45, build outputs on main, `make eval`, demo-site on real data.

## 2026-10-04T06:00Z — Night: integration, production, alerts, demo package

**Decisions:**
- Vercel production only via branch `production`; previews per PR and `main` — *why:* nothing goes live by accident.
- No Neon: law data stay files in git; only subscriptions in Upstash — *why:* deterministic builds.
- Alerts middle way (double opt-in, closed test, manual trigger), recipients as subscriber flags, per-subscription unsubscribe token — *why:* no automatic legal claims in strangers' inboxes; fewer secrets.
- Option A navy UI, green/clay/grey only as status colours; roof-scales icon; plain alert email — *why:* green is the renter signal; the legal-style mail was unreadable.
- `outputs/rules.json` as placeholder copy (#74) until Dimitar's final build — *why:* the brief requires three files.
- Alert lifecycle engine built for the prototype despite the critic's "don't build yet"; Step 0 (partners, renters with a letter in hand) before a real launch — *why:* owner decision.

**Surprises:**
- Auto mode blocks secret writes, production branch creation and unreviewed merges; Silvan ran the env script himself.
- `vercel env add … preview` silently skipped when piped (#66).
- Subagents died on ECONNREFUSED; resumed, now push each deliverable early.
- Dimitar's #53 keeps eval green but worsens scored lookups (owner_occupied 245→301, rules dropped).
- `/goal` stop hook looped while waiting for the user's approval.

**Next:**
- Alert engine PR (deep-work), Dimitar's PR decisions + #81, style clip → full film, postal address, final scored build after hour 16.
