# Resume

**Updated:** 2026-10-04T05:50Z (07:50 CEST)
**Branch:** main
**Production:** `8e7c326` on yourhomerule.com (main is ahead: docs, outputs/rules.json, rule-page fix)
**Working tree:** clean apart from git-ignored worktrees and the local `.claude/REHEARSAL.md`

## Pick up next

State 04.10. 07:50 CEST. Production = `f8c33fd` (everything merged through #84, verified: NJ rule pages 200, J2 fix live). Freeze 12:00, submission 15:00.

1. **Email rehearsal:** take 1 sent 07:45:23 via production to the demo inbox (A0011, NJ source `asof:2026-10-01..2027-07-02`), "1 sent". Silvan confirms arrival on the phone, then take 2: `make notify SOURCE='asof:2026-10-01..2027-07-02'` (must say 1 would_send) → `make alert SOURCE='asof:2026-10-01..2027-07-02' RESET=1 URL=https://yourhomerule.com`. Runbook `.claude/REHEARSAL.md` (local). Then the /goal email-journey is done.
2. **Alert lifecycle engine** (owner decision: build for the prototype; critic's Step 0 = "before a real launch, later"): deep-work agent on `s/alert-engine` (worktree `.worktrees/alert-engine`), PR against main, timebox ~10:20. Cron route dry-run by default; `ALERTS_CRON_SEND=1` only on Silvan's go. Review + merge + production on Silvan's go.
3. **Dimitar** (issue #81 + review findings): #53 makes scored results worse (applies 4240→4004, owner_occupied unknowns 245→301, drops LA 165.03, Hoboken 10:54/18:66, Jersey City rent, Cambridge 8.71) → hold until he explains; #59 after #53 (0× "worse" is expected: no window reaches a sunset); #55 after both, needs re-extraction; #75 + #68 merge-ready (independent); #48 close. Vercel previews of his branches are blocked ("Git author must have access") — add him to the Vercel project or ignore. Final `make build` for all three scored files after his hour-16 ingest (`outputs/rules.json` is a placeholder copy, #74). Open decision for Silvan: merge #75/#68, close #48, comment findings on #81.
4. **Demo:** script doc https://claude.ai/code/artifact/a0d324be-07ad-44f7-b862-588cdacc61ed (private; share with Dimitar), full version `notes/demo/` (DEMO, GAPS, PRODUCT-REVIEW, video). Film `/Users/silvan/claude/code/tools/demo-video/out/homerule/demo.mp4` (116 s, Gemini voice; re-render after production changes ~7 min; ElevenLabs key in `/Users/silvan/claude/code/.env` if the voice should change — pipeline support not built yet).
5. Open PRs from the other session: #71/#72/#77 (sunsets + change verdict, wait on #59).

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
