# Resume

**Updated:** 2026-10-04T00:08Z
**Branch:** main
**Last commit:** 511b4b6 — Merge pull request #38 from ilPicc0ne/s/prd-dedupe-map
**Working tree:** clean except `.claude/worktrees/` (untracked, likely from the address session; not touched)

## Pick up next

1. Review mockup v3 (`/Users/silvan/claude/code/personal/homerule-demo/lab/ui-proposal/v3/index.html#sf`, compare v2). Then rebuild the demo site's address page to the v3 design on `s/demo-site`, **locally first** (`cd web && npm run dev`), deploy only when ready. Iterate: medium agent, ~15 min, two variants, then renter critique.
2. Address session in `.worktrees/address` (branch `s/address-lookup`, issues #7 #10): check its PR/progress; the real map (MapLibre + OpenFreeMap Positron + TIGER outline) comes after it.
3. Engine (#8) reads I2 `out/rules.json` + I8 `out/findings.json` (Dimitar's outputs on main); grey/amber tiles take text from findings.
4. Dimitar: #4 extraction, #5 eval, #32 contacts data (`contracts/contacts.json`).
5. Housekeeping: `pkill -f "disable-field-trial-config"` once the address session is done; stop dev servers (3100 demo, 3210 address); move `../homerule-demo` to `.worktrees/demo` when no one works in it.

## Open questions

- Hour-16 drop time; score.py / dev key; how unknowns score — context: Discord.
- Phone numbers in contacts are unverified (mockups say "demo number").

## Recent decisions

- One-view renter page: sticky address bar with "Get alerts" bell, "Next change" line, map, six accordion tiles with three levels (plain → next step → "Show the law"), labels "There's a rule" / "We're missing one fact" / "No local rule — state basics only" — *why:* renter critique (5–6/10 on v2), not for lawyers.
- Never invite comparing the renter's number to a cap; state facts, let the reader conclude; grade 6–8 words — *why:* legal-advice risk found by the critique ("1.6%").
- J7 "Take action": contact on every tile (P0, data Dimitar #32), action helpers (P1), legal-aid finder (P2).
- Real map: MapLibre + OpenFreeMap Positron + Census TIGER city outline (P1).
- I8 findings (Dimitar) feed the "why no rule" tiles.
- Design work iterative, not one deep pass — *why:* the owner's eye is the test; deep-work took ~45 min for v2.

## Surprises / gotchas

- Agents can stay "running" in the panel via leftover background children — *avoid:* TaskStop when the report is in.
- Dimitar pushes to main often — *avoid:* pull/rebase before pushing; docs changes via small PRs.
- See SESSIONS for earlier gotchas (East LA, Brookline, Vercel uploads only web/, spam).

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/decisions/`.
