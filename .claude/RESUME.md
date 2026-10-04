# Resume

**Updated:** 2026-10-04T04:50Z (06:50 CEST)
**Branch:** main
**Production:** `8e7c326` on yourhomerule.com (main is ahead: docs, outputs/rules.json, rule-page fix)
**Working tree:** clean apart from git-ignored worktrees and the local `.claude/REHEARSAL.md`

## Pick up next

Freeze 12:00, submission 15:00.

1. **Dimitar, first thing:** paste him the note (session log 04.10. night): `outputs/rules.json` is a placeholder copy (#74) → after his hour-16 ingest, one final `make build` on main and commit all three scored files together. Also: `NJ-NEWARK-RENT-19:2-18.3` is an exemption tagged `protection_or_duty` (page works around it, #63); prompt lock mismatch; `renter_impact` field for the email badge (`more_protection` / `less_protection` / `neutral`).
2. **Email rehearsal (Silvan's phone):** runbook `.claude/REHEARSAL.md` (local, not in git). Demo inbox seeded for A0011, real NJ source `asof:2026-10-01..2027-07-02`, dry run = exactly 1 recipient. Re-run the dry run before each take; send = `make alert SOURCE=… URL=https://yourhomerule.com`; reset between takes. Live take = Dimitar's hour-16 change.
3. **Demo package** (deep-work agent, restarted 06:45 after a connection drop): `notes/demo/DEMO.md`, `GAPS.md`, `PRODUCT-REVIEW.md`, `video/script.json` + storyboard on branch `s/demo-script` (PR "Demo script, product review script, gaps"). English video rendered with `/Users/silvan/claude/code/tools/demo-video` (MP4 stays in the tool's `out/`). Then publish DEMO.md as a private claude.ai page for Silvan + Dimitar.
4. **Production push** of current main after a look at the main preview (`git push origin <main sha>:refs/heads/production`).
5. Open PRs from other sessions (not reviewed here): #77/#72/#71 sunsets + change verdict (stacked), #75, #68, #59, #55, #53, #48 (contacts already on main via #56 → close).

## Open questions

- Hour-16 drop time; score.py / dev key; how unknowns score — context: Discord.
- Postal address for the email footer: placeholder in `web/lib/alerts/disclaimer.ts` (US mail law before mailing strangers).
- Starter-pack licence "TBD by organizers"; `web/` holds short source excerpts — check before the public repo goes public.
- Phone numbers in contacts are unverified (shown as "not yet checked by us").

## Recent decisions

- Vercel: root `web`, previews per PR and `main` (stable alias `homerule-git-main-…`), production only by pushing to branch `production` — *why:* nothing goes live by accident.
- Law data stay files in git; only subscriptions are mutable (Upstash). No Neon — *why:* deterministic builds, one source of truth.
- Alerts: who may get mail is data on the subscriber (`allowed`, `demo`), unsubscribe = random token per subscription; env only `RESEND_API_KEY`, `DEMO_TOKEN`, `ALERTS_SITE_URL` — *why:* Silvan's proposal, fewer secrets.
- Alerts middle way: double opt-in, closed test, change alerts only by manual trigger; prototype banner on every page and mail — *why:* no automatic legal claims in strangers' inboxes.
- UI option A "Quiet": navy `#2B3B4E` for UI, green/clay/grey only as status colours; icon = roof scales — *why:* green is the renter signal.
- Plain alert email: one sentence per change, button to the address page — *why:* the legal-style mail was unreadable.
- I3 assumptions, tree levels, one engine, autocomplete over own data — see earlier entries in SESSIONS.

## Surprises / gotchas

- Auto mode blocks: secret-store writes (Vercel env), creating the `production` branch, merges without a first-hand review — *avoid:* Silvan runs `scripts/alerts-env.sh`; review diffs before `gh pr merge`.
- `vercel env add … preview` piped from a script silently did nothing (branch prompt) — *avoid:* `--yes --force` + verify (fixed in #66).
- Subagents die on connection drops (ECONNREFUSED) mid-task — *avoid:* commit and push each deliverable as soon as it exists.
- Census fuzzy-matches another city silently — *avoid:* typed-city warning.
- Dimitar's `out/extracted/` + `build/cache` exist only on his machine; `make demo-change` needs OPENROUTER_API_KEY.
- Parallel sessions share one Playwright browser; Dimitar pushes to main often — merge main into branches before pushing.

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md` (CUJ table "CUJ → live URL → status → gap"), `docs/ARCHITECTURE.md`, `docs/decisions/`.
