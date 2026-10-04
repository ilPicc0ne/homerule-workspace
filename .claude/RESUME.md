# Resume

**Updated:** 2026-10-04T06:00Z (08:00 CEST)
**Branch:** main
**Last commit:** 0f3c8fb — Merge pull request #86 (rehearsal done)
**Production:** `f8c33fd` on yourhomerule.com (verified: NJ rule pages 200, J2 fix live)
**Working tree:** clean apart from untracked `lab/ui-proposal/release/` (screenshot) and local `.claude/REHEARSAL.md`

## Pick up next

Freeze 12:00, submission 15:00.

1. **Alert lifecycle engine** (deep-work agent, branch `s/alert-engine`, worktree `.worktrees/alert-engine`, timebox ~10:20): triggers found / takes effect / ends (30 days ahead + on the day), approval per rule, daily digest, corrections, cron route dry-run by default. Review → merge → production on Silvan's go; `ALERTS_CRON_SEND=1` only on his go.
2. **Dimitar** (issue #81): #53 hold (scored results worse: applies 4240→4004, owner_occupied unknowns 245→301, drops LA 165.03, Hoboken 10:54/18:66, Jersey City rent, Cambridge 8.71); #59 then #55 after #53; #75 + #68 merge-ready; #48 close. Final `make build` of all three scored files after his hour-16 ingest (`outputs/rules.json` = placeholder copy, #74). Silvan decides: merge #75/#68, close #48, post findings on #81. His Vercel previews are blocked (author not a project member).
3. **Video:** 15–20 s style clip, Gemini voice Iapetus, `/Users/silvan/claude/code/tools/demo-video/out/homerule/clip.mp4` (agent running); full film only after the remaining features. First film kept as `demo-0714.mp4`.
4. **Demo:** script doc https://claude.ai/code/artifact/a0d324be-07ad-44f7-b862-588cdacc61ed (private; share with Dimitar); full version `notes/demo/`. Live take of the email beat = Dimitar's hour-16 source; rehearsed path done (2/2 on production 04.10. 07:45/07:50).
5. Postal address for the email footer (placeholder in `web/lib/alerts/disclaimer.ts`).

## Open questions

- Hour-16 drop time — context: Discord.
- Starter-pack licence "TBD by organizers"; `web/` holds short source excerpts — before the public repo goes public.
- Contact phone numbers unverified (shown as "not yet checked by us").

## Recent decisions

- Vercel: root `web`, previews per PR and `main`, production only by pushing to branch `production` — *why:* nothing goes live by accident.
- Law data stay files in git, only subscriptions are mutable (Upstash); no Neon — *why:* deterministic builds, one source of truth.
- Alert recipients are flags on the subscriber (`allowed`, `demo`), unsubscribe = random token per subscription — *why:* Silvan's proposal, fewer secrets, no redeploy.
- UI option A: navy for UI, green/clay/grey only as status colours; icon roof scales — *why:* green is the renter signal.
- Plain alert email, one sentence per change, button to the address page — *why:* the legal-style mail was unreadable.
- Build the alert engine for the prototype; critic's Step 0 (partners, 10 renters) = before a real launch, later — *why:* owner decision 04.10.

## Surprises / gotchas

- Auto mode blocks secret-store writes, creating/pushing `production` without an explicit go, and merges without a first-hand review — *avoid:* Silvan runs `scripts/alerts-env.sh`; read the diff before `gh pr merge`.
- Subagents die on connection drops (ECONNREFUSED) — *avoid:* commit and push each deliverable as soon as it exists.
- A `/goal` whose last step needs the user's approval makes the Stop hook loop — *avoid:* goals only for steps the agent can finish alone.
- Dimitar's #53 passes eval (assertions, T1–T5, holdout) yet worsens scored lookups — *avoid:* check `out/build_summary.json` deltas, not only eval.

## Long-form

See `.claude/SESSIONS.md`, `docs/PRD.md` (CUJ table), `docs/ARCHITECTURE.md`, `docs/decisions/`, `notes/demo/`, `notes/plan/alert-engine.md`.
