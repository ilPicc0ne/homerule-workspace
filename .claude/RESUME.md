# Resume

**Updated:** 2026-10-03T20:00Z
**Branch:** main
**Last commit:** c427b24 — No mentor for the challenge: questions go to Discord, D8 dropped
**Working tree:** clean

## Pick up next

1. Dimitar accepts the invite (github.com/ilPicc0ne/homerule-workspace), clones, copies the starter pack into `data/realpage-starter/` (git-ignored).
2. M0: calibrate output formats against `schema/` and `submission_templates/` (the participant pack has no score.py, no dev key).
3. 22:00 spike: extraction baseline, geocoding, freeze the predicate AST schema (see `notes/plan/prd.md` Technical requirements and `docs/ARCHITECTURE.md`).
4. Ask in the Discord challenge channel: score.py release, hour-16 time and format, how "unknown" counts, starter-pack licensing for a public repo.
5. Share the review page https://claude.ai/artifact/ARbRPgGyA4ndhd7LvbztSu with Dimitar as Editor; settle D1–D7 (D7 = renter, tentative).
6. Sun ~14:00: `scripts/publish.sh`, read the leak check, `--push`, flip `ilPicc0ne/homerule` to public.

## Open questions

- D1 self-repair loop tier, D2 TypeScript vs Python engine, D3 headline (proposal: "Your landlord has a lawyer. Now you have the law."), D4 demo hero, D5 MCP, D6 measured contrast.
- Exact time of the hour-16 ordinance (somewhere 07:00–11:00 CEST?).

## Recent decisions

- c2 RealPage, product HomeRule — *why:* both funnel runs said yes; fits retrieval/evals + prop-tech; 75% scored by script.
- Rules as filtered data, not RAG; conflicts flagged, never decided by a model — *why:* deterministic, auditable, avoids legal-advice drift (docs/decisions/0002, 0003).
- Private workspace + filtered public export (`.publish-paths`, git filter-repo) — *why:* public repo with build history, notes never leak.

## Surprises / gotchas

- Participant pack lacks score.py and the dev key — *avoid:* rely on the brief-derived assertion suite.
- Address traps: Boston neighbourhood names as city, ~83 NJ ZIPs are owner mailing ZIPs, San Ysidro = San Diego — *avoid:* neighbourhood table, never geocode NJ ZIPs.
- No mentor or judge assigned to this challenge — questions go to Discord.
- Chrome extension timed out twice — *avoid:* do browser tasks by hand.

## Long-form

See `.claude/SESSIONS.md`, `docs/decisions/`, `notes/plan/`, `notes/meetings/`.
