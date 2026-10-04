# Resume

**Updated:** 2026-10-04T01:15Z
**Branch:** main
**Last commit:** Wrap-up: address, engine, change-log PRs
**Working tree:** clean (`.claude/worktrees/` = subagent worktrees, git-ignored)

## Pick up next

State 04.10. ~03:15. Freeze 12:00, submission 15:00. Open PRs, merge in this order:
**#30** extraction (Dimitar; approved, must merge main in first) → **#29** address resolver + /where (`s/address-lookup`, worktree `.worktrees/address`) → **#36** engine `make build` (`s/engine`, stacked on #29+#30) → **#45** change log + email preview (`s/changes`, stacked on #36).

1. Merge chain above; after each merge, merge main into the next branch. Then on `main`: `make resolve && make build AS_OF=2026-10-01`, commit `outputs/lookups.json` + `changes.json`. (35 scored points)
2. `make eval` on main → fix list. Known: H01 Berkeley state cap (superseded vs expected unknown), state-cap counts differ from Dimitar's README — both with Dimitar (#36).
3. `make demo-change` (J4) needs OPENROUTER_API_KEY or Dimitar's warm build/cache.
4. #41 data into web/; address page reads `out/lookups.full.json` + I3, not its own demo data (135 rows of facts disagree). Link `/changes/[id]`.
5. Merging s/demo-site breaks `/where` (icons moved to `components/`): fix the import.
6. Hour-16 watch (~07:00–11:00), sleep split with Dimitar. 12:00–15:00 submission (#13).
7. Housekeeping: after merges `git worktree remove` the 4 `.claude/worktrees/agent-*`; `pkill -f "disable-field-trial-config"`; move `../homerule-demo` to `.worktrees/demo`.

## Open questions

- Hour-16 drop time; score.py / dev key; how unknowns score — context: Discord.
- Phone numbers in contacts are unverified.
- Starter-pack licence "TBD by organizers" — context: public repo publishes `out/` intermediates, not `data/`.

## Recent decisions

- No feature without asking first (PRD rule) — *why:* scope creep before the freeze.
- One engine: I3 adapter + CLI around Dimitar's evaluator; dates from compiled `effective.from/until`; month precision → unknown inside the window — *why:* agreed on #30.
- I3 assumes `subsidised: false` without an affordability code and Boston A/ = 7+ units, tagged per record — *why:* otherwise the APT5 guard is never true (0 → 468 rows).
- Tree levels: rules in HomeRule · not covered · no rules at this level; `county_law` in I1 (MA counties none, LA County unincorporated only) — *why:* "not covered" mixed missing law with absent law.
- Autocomplete over own data (500 + places); Google Places = idea (PRD) — *why:* no key/terms/cost for the demo.
- Subscription store Upstash Redis; one-view renter page (v3); real map MapLibre + TIGER (other session).

## Surprises / gotchas

- Census fuzzy-matches another city silently ("1 Main St, Los Angeles" → La Selva Beach) — *avoid:* typed-city warning.
- `npm run resolve` synced contracts after the batch → stale output — *avoid:* sync before and after (fixed).
- Dimitar's `out/extracted/` + `build/cache` exist only on his machine — *avoid:* engine reads committed `out/rules.compiled.json`.
- Parallel sessions share one Playwright browser — *avoid:* don't run browser checks in two sessions at once.
- `vercel install` adds agent skills silently — *avoid:* /vet after marketplace installs.
- Dimitar pushes to main often — *avoid:* merge main into branches before pushing.

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/decisions/`.
