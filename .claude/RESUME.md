# Resume

**Updated:** 2026-10-03T22:20Z
**Branch:** main
**Last commit:** 172c2f0 — Ignore .worktrees/
**Working tree:** clean (before this wrap-up commit)

## Pick up next

1. Address resolver (#7, #10): fresh session in `.worktrees/address` (branch `s/address-lookup`), paste the kickoff prompt (goal, decisions, tests-first). Edge cases: `lab/resolve-edge-cases/README.md` on that branch.
2. Demo site: agent was building on `s/demo-site` in `/Users/silvan/claude/code/personal/homerule-demo`; no commits pushed at wrap-up time. Check if it finished; review (light only, "Demo data | Live" toggle, quote check), PR, merge, `vercel deploy --prod` from `web/`; then `git worktree move ../homerule-demo .worktrees/demo`.
3. Dimitar: issue #27 (task split), then #2 grid triage, #3 Jev test, #4 extraction.
4. Discord answers → PRD open questions. Email warm-up: mark `alerts@yourhomerule.com` not-spam.

## Open questions

- Hour-16 drop time and format; score.py / dev key release — context: posted to Discord.
- Do use-code unit ranges count as known in the key? — context: we treat them as known behind a switch.

## Recent decisions

- Address iteration goal: live search on the site → jurisdiction tree; one TypeScript resolver for site and batch — *why:* visible, scalability proof, no drift.
- Tree Federal › State › County › City / Township / unincorporated; legislative districts P2 — *why:* NJ/MA municipalities are county subdivisions; unincorporated areas fall to county law.
- Use-code units ("5+", NJ class 4C) as known facts behind a switch — *why:* settles small-building exemptions for nearly all 500.
- Worktrees under git-ignored `.worktrees/` — *why:* keep `code/personal/` free of repo-lookalike folders.
- PRD master in docs/, contracts I1/I7, files as data store, no own chatbot, yourhomerule.com + Resend — see SESSIONS.

## Surprises / gotchas

- East LA: postal "Los Angeles" but unincorporated — *avoid:* never trust postal city; use Census place.
- Brookline: town with no Census place — *avoid:* county subdivision as municipality in NJ/MA.
- Census one-line returns no match for place-only input ("Boston, MA", ZIPs) — *avoid:* resolve via jurisdiction list/aliases.
- Vercel deploy uploads only `web/` — *avoid:* sync contracts into web/ with a drift test.
- `!` commands are non-interactive; first test mail went to spam.

## Long-form

See `.claude/SESSIONS.md`, `docs/decisions/`, `docs/PRD.md`, `docs/ARCHITECTURE.md`.
