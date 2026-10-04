# Resume

**Updated:** 2026-10-04T00:23Z
**Branch:** main
**Last commit:** c7e6965 — Merge pull request #44 (PRD: renter-protection map)
**Working tree:** clean except `.claude/worktrees/` (untracked, likely from the address session; not touched)

## Pick up next

State 04.10. 02:20: Dimitar closed extraction (#4) and eval (#5). Open PRs: **#29** address resolver + search (`s/address-lookup`, worktree `.worktrees/address`), **#36** engine `make build` → lookups/changes (`s/engine`). Issue **#41** (rules, findings, source texts into web/) unassigned. Freeze 12:00, submission 15:00.

1. Review #29 then #36 (tests green, conflicts), merge; on `main` run `make resolve` + `make build`, commit `outputs/lookups.json` + `changes.json` from main. (35 scored points)
2. `make eval` on main with all three files → fix list before the freeze.
3. #41 (take it): data into web/, flip the demo site's toggle Demo data → Live.
4. Rebuild the address page to mockup v3 (`/Users/silvan/claude/code/personal/homerule-demo/lab/ui-proposal/v3/index.html#sf`) on real data, locally first (#9, #26, #11).
5. Hour-16 watch (~07:00–11:00): `make ingest`. Agree a sleep split with Dimitar so someone fresh catches it.
6. 12:00–15:00 submission (#13).
7. Housekeeping: `pkill -f "disable-field-trial-config"`; stop dev servers 3100/3210; move `../homerule-demo` to `.worktrees/demo`.

## Open questions

- Hour-16 drop time; score.py / dev key; how unknowns score — context: Discord.
- Phone numbers in contacts are unverified (mockups say "demo number").

## Recent decisions

- Subscription store Upstash Redis `homerule-subscriptions` (free) connected to Vercel project `homerule`; no Neon — *why:* Dimitar pushes output files to git, we deploy from here; only subscriptions are mutable.

- One-view renter page: sticky address bar with "Get alerts" bell, "Next change" line, map, six accordion tiles with three levels (plain → next step → "Show the law"), labels "There's a rule" / "We're missing one fact" / "No local rule — state basics only" — *why:* renter critique (5–6/10 on v2), not for lawyers.
- Never invite comparing the renter's number to a cap; state facts, let the reader conclude; grade 6–8 words — *why:* legal-advice risk found by the critique ("1.6%").
- J7 "Take action": contact on every tile (P0, data Dimitar #32), action helpers (P1), legal-aid finder (P2).
- Real map: MapLibre + OpenFreeMap Positron + Census TIGER city outline (P1).
- I8 findings (Dimitar) feed the "why no rule" tiles.
- Design work iterative, not one deep pass — *why:* the owner's eye is the test; deep-work took ~45 min for v2.

## Surprises / gotchas

- `vercel install <integration>` silently adds project-scoped agent skills (web/.agents/skills + .claude/skills symlinks, web/skills-lock.json) — *avoid:* check and /vet after every marketplace install (Upstash ones vetted: docs only).

- Agents can stay "running" in the panel via leftover background children — *avoid:* TaskStop when the report is in.
- Dimitar pushes to main often — *avoid:* pull/rebase before pushing; docs changes via small PRs.
- See SESSIONS for earlier gotchas (East LA, Brookline, Vercel uploads only web/, spam).

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/decisions/`.
