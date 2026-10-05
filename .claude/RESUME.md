# Resume

**Updated:** 2026-10-04T10:35Z (12:35 CEST)
**Branch:** main
**Last commit:** a13588a — Merge pull request #132 (wrap-up)
**Production:** `1b914bd` = main `284a379` (verdicts ↑/↓/= everywhere, failed-measure chip, MCP aliases + contacts, connect pill, sidebar scroll)
**Working tree:** clean apart from untracked `lab/ui-proposal/release/` (another session's)

## Pick up next

Freeze passed (12:00), submission 15:00.

1. **Submission (#13):** three videos, ≤ 60 s each (`docs/VIDEO.md`). Demo = `/Users/silvan/claude/personal/code/tools/demo-video/out/homerule-demo60/demo_v3_matilda.mp4` (57.7 s, Matilda, music a), thumbnail `demo_v3_matilda_thumbnail.png`. Plus README, method note, `outputs/`.
2. Dimitar's OK for his name and photo on the end card (Hack-Nation may publish it).
3. Live demo: run the four MCP prompts once on production and check the wording (`notes/demo/MCP-DEMO.md`).
4. Teach video (Dimitar, #93, extraction beat #95). Docs pass after his architecture script.
5. Merge #90 (alert engine, cron dry run; `CRON_SECRET` set, `ALERTS_CRON_SEND` not). Afterwards its digest adopts #121's badge layout (`badgeFor`, `badgeHtml`, `topicHtml`).

## Open questions

- The 1-minute rule came as "World Bank Challenge Clarification" — does it apply to RealPage? Planned for 60 s anyway.
- Team photo on the end card: blurry people in the window reflection — blur if it bothers.
- Dimitar's #122 (neutral badge) duplicates #121 (live) — close with him; #91 email design, #92/#94 docs, his #48/#55/#68/#123.

## Recent decisions

- Demo video as a free Remotion composition (`demo-video/experiments/homerule-demo60/`), not the template pipeline — *why:* the template recycled the expense demo's hook, music and look.
- Story: problem hook "layers" → Lena (Fillmore vs Hoff St) → product intro → LA unknown → Boston (barred, pending, failed) → ↑/↓ verdict + alert → chatbot → team end card; Jersey City and the quote line cut — *why:* 60 s limit, the verdict story is the key beat.
- Every dated change carries a verdict ↑/↓/=/grey (#119 data, #121 web + email) — *why:* a missing badge read as missing, not as "no change".
- Rent caps set by a formula read "of at most N%" (`engine/score.py`) — *why:* "A 10% cap" was wrong for 5% + CPI.
- MCP answers name the per-topic contact and end with "Not legal advice"; no ranking (#104).
- Production deploys as a commit with main's tree and two parents (main + production) — *why:* fast-forward, no force push.

## Surprises / gotchas

- zsh reads `"$C:r"` as a modifier — *avoid:* `"${C}:refs/heads/production"`.
- Production also gets deploys from others (was `402ac1b`, not ours) — *avoid:* always parent the deploy commit on the current `origin/production`.
- Old tabs keep the old JS after a deploy (the "missing ×") — *avoid:* hard-reload before reporting a UI bug.
- Agents may not read `.env`; a script that reads the key itself runs when Silvan asks directly.
- Merging #90 is blocked for Claude (cron = production deploy); Silvan merges.

## Long-form

See `.claude/SESSIONS.md`, `docs/decisions/`, `docs/VIDEO.md`, `notes/demo/video/STORY.md`.
