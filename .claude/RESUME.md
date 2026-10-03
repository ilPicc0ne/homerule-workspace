# Resume

**Updated:** 2026-10-03T22:06Z
**Branch:** main
**Last commit:** 88036c8 — Merge pull request #28 from ilPicc0ne/s/landing
**Working tree:** clean (before this wrap-up commit)

## Pick up next

1. Demo site: a high-effort agent was building it on branch `s/demo-site` (worktree `/Users/silvan/claude/code/personal/homerule-demo`) when the session was cleared; its final report was not received. Check `git log s/demo-site`, run `web/scripts` quote check, open the preview, review (light only, clean minimal, "Demo data | Live" toggle), then PR, merge and `vercel deploy --prod` from `web/`.
2. Dimitar: answer on issue #27 (task split, first issue). Remove `split:proposed` from accepted issues.
3. Start #7 address lookup → `out/addresses.resolved.json` (start from `lab/geocode-500`, rules in docs/ARCHITECTURE.md B).
4. Discord answers (score.py, hour-16 time, unknown scoring, no-rule format, T6, corpus licence) → PRD open questions.
5. Email deliverability: mark `alerts@yourhomerule.com` not-spam in Outlook, warm-up; check Authentication-Results.

## Open questions

- Hour-16 drop time and format — context: brief scores T6, pack PDF says no release.
- score.py / dev key release — context: participant pack has neither; `make eval` report is the fallback for the videos.
- Jev quality (#3) — context: vendor claims unverified, frontier model is the fallback.

## Recent decisions

- docs/PRD.md is the master (scope, priorities with status = feature list), docs/ARCHITECTURE.md the how — *why:* one source, no overlap; old plans archived.
- Contracts I1 `contracts/jurisdictions.json` + I7 `contracts/facts.json` — *why:* the only two joins between Dimitar's rules and Silvan's addresses; rules.json writes `schema_name`.
- Files in git as data store, Redis (Upstash) only for subscriptions, redeploy for hour 16 — *why:* tiny static data, reproducible, auditable.
- No own chatbot; address dashboard with six renter questions, rule page (quote, law link, audit trail), search at all jurisdiction levels; MCP P2 — *why:* plain-language score, risk of advice on a public link.
- Domain yourhomerule.com (Vercel project `homerule`), Resend verified — *why:* .com for mail, matches tagline "Your rights as a renter, for your exact address."
- Split: Dimitar up to rules.json + ingest + eval + extra data sources + MCP + scoreboard; Silvan addresses, engine, web, email, score, submission — *why:* balance over time; issues #2–#27 with `split:proposed`.

## Surprises / gotchas

- `!` shell commands are non-interactive — *avoid:* domain buys and logins in a normal terminal.
- First test mail landed in Outlook spam (new domain) — *avoid:* warm-up, HTML + unsubscribe header.
- NJ ZIPs are owner mailing ZIPs; a Cambridge street matched in Boston without ZIP — *avoid:* rules in ARCHITECTURE B.
- GitHub API timeouts can silently drop an issue — *avoid:* list issues after bulk creation.

## Long-form

See `.claude/SESSIONS.md`, `docs/decisions/`, `docs/PRD.md`, `docs/ARCHITECTURE.md`.
