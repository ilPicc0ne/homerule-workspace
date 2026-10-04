# Resume

**Updated:** 2026-10-04T10:30Z (12:30 CEST)
**Branch:** main
**Last commit:** 533f1b6 — Merge pull request #126 (method limits)
**Production:** `1b914bd` = main `284a379` (3D map + building outline, elevation fix, MCP 5 tools + v1 aliases, calmer alert popover, 500-address note)
**Working tree:** clean (worktrees under `.worktrees/` hold merged branches)

## Pick up next

Freeze 12:00 passed, submission 15:00.

1. Hour-16 ingest + final scored files from a main build (Dimitar).
2. Submission (#13). Tech video 60 s is with Dimitar (#93 draft 1 = 2-min cut, #129 his 60 s script).
3. Data before the next sync: `web/data/changes.full.json` is stale on main (contracts-sync test fails); syncing brings a banned "must" in NJ-JERSEY-CITY-ALG-218-12.3 (A0008) into alert emails.
4. Triage open PRs: #130 #128 #123 #122 #94 (docs sync) #92 #91 (email redesign) #90 (alert engine).
5. After the hackathon: Google geocoding for the 3D target (script parked in the session scratchpad as `build-google-geocodes.ts`; key `homerule-geocoding-script` in `web/.env.local`, cap 1000/day; coordinates only in the 3D view, refresh within 30 days).
6. Postal address for the email footer (placeholder in `web/lib/alerts/disclaimer.ts`).

## Open questions

- Hour-16 drop time — context: Discord.
- 15-badge hand check of ↑/↓ verdicts: done or still open? — context: #113 turned badges on.

## Recent decisions

- MCP = few task-shaped tools (`get_place`, `compare_places`, `get_changes`, `get_rule`, `coverage`); presentation rules in descriptions/instructions, never in results; v1 names stay as aliases — *why:* measured 7 → 1 call per question; Claude read result instructions as injection and caches tool lists.
- 3D view is the default on production (`NEXT_PUBLIC_DEFAULT_MAP_VIEW=3d`, Maps key `homerule-maps-browser`, 500 loads/day) — *why:* demo impact; cap protects cost.
- Building highlight only when the geocode lies inside the OSM footprint, else a ~25 m circle "Approximate location" — *why:* nearest-building matches lit the neighbour.
- Verdict wording describes the rule ("adds / narrows renter protection"), green ↑ / red ↓, no badge when data is missing; protection score moved to a separate discussion — *why:* responsible design, no advice.
- Rule end dates (`effective.until`) are change sources — *why:* sunsets are the clearest "narrows" changes.

## Surprises / gotchas

- Vercel blocks production deploys whose head commit is authored by Dimitar — *avoid:* deploy commit by Silvan: `C=$(git commit-tree '<sha>^{tree}' -p origin/production -p <sha> -m "Deploy …") && git push origin "${C}:refs/heads/production"` (zsh: quote `^{tree}`, brace `${C}`).
- Map3DElement camera altitude is above sea level — *avoid:* use stored ground elevation (fixed in #97).
- Auto mode blocks `production` pushes even with Silvan's go — *avoid:* hand him the one command.

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/decisions/`.
