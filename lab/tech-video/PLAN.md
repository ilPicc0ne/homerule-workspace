# HomeRule tech video: plan

Private (lab/ is not in `.publish-paths`, so it never reaches the public repo). Draft 1, 04.10.2026 ~08:20 CEST, written against `origin/main` e3009dd and the open PRs at that time. Owner: Silvan (the PRD's submission checklist still lists the technical video under Dimitar; update the PRD row when this is agreed). Words: [SCRIPT.md](SCRIPT.md). Picture: [architecture.html](architecture.html).

**Update rule:** when a PR lands or a number changes, edit SCRIPT.md first, then the `STEPS` captions / on-screen numbers in architecture.html, then re-render (about 10 min, see "Production"). The table "What changes when PRs land" lists the exact edits.

## What the video must do

From the brief (`data/brief/c2-realpage-rental-law-navigator.txt`, "Additional submission details") [verified]:

- "Technical video: walk through how your system works."
- "Report your test score results in your videos": "Run score.py on the dev set and show the full score report on screen" · "Show your results for change tests T1–T6" · "Show your system processing the hour-16 ordinance test dataset".
- Rules: "Automated extraction only. The hour-16 ordinance and a live rerun in the demo check this."

`score.py` and the dev key are not in our starter pack (`data/realpage-starter/README.md`: "excludes the scoring script, dev answer key and hour-16 ordinance") [verified: repo README "Setup"; the pack folder has no `score.py`]. So the score report on screen is `make eval`, labelled as such. Our own limit: ≤ 2:00. The judges score Responsible design (10) and Scalability (5) partly from this video.

## The story in one sentence

> We bet on extracting the law once into dated, quoted rule records and deciding coverage in code, not by a model: every answer is reproducible, says "unknown" when a fact is missing, and one run of the engine at two dates (or before and after a new document) produces the per-address diff behind the change log and the alert email, with `changes.json` held to the same sets by a test.

The brief's version said "one diff feeds changes.json, change log and email". On main that is two computations kept equal by a test (`engine/diff.py` vs `extract/changes.py`, `tests/test_diff.py`; ARCHITECTURE D: "Sharing one function was left out"). The script says the accurate version.

## Inventory

Owner D = Dimitar, S = Silvan. Status: built (on main) · PR (open PR) · WIP · planned · idea. Evidence = file path read on 04.10.2026 [verified] unless tagged [assumed].

### A · Extraction (corpus → rule records)

| ID | Module | Does | Input → output | Owner | External | Status · evidence |
|---|---|---|---|---|---|---|
| A1 | `extract/corpus.py`, `sections.py`, `parts.py` | Pins each text by hash, header, evidence tier, section tree, date candidates; splits documents > 30,000 chars | `data/realpage-starter/corpus/text/*.txt`, `corpus_manifest.csv`, cleared `data/supplemental-legal/` → `out/index/`, `out/inventory.json` | D | — | built · `extract/README.md` |
| A2 | `extract/jev_pass.py` (Jev J1–J4) | Bounded choices with confidence: document type and status, section content type, category, what each date marks | index → labels in `out/extracted/` (not committed) | D | OpenRouter → `typesafe/jev-1.13` (`/alpha/decisions`) | built · `extract/config.py` |
| A3 | `extract/luna_pass.py` (Luna L1, L2, Jev J9) | Structured extraction (obligations, I7 conditions, exemptions, amounts, dates, interactions, verbatim quotes); code checks; one repair call; triage of `unparsed` conditions | index + labels → `out/extracted/<doc>.json` | D | OpenRouter → `openai/gpt-6-luna`; fallback `openai/gpt-5.6-luna` on a content-filter refusal | built · `extract/llm.py` |
| A4 | `extract/jev_check.py` (Jev J5–J8) | Cross-checks Luna's closed fields; a confident disagreement overrides | extracted → overrides | D | Jev | built |
| A5 | `extract/gate.py` (G1–G5) | Verification gate: claim supported by quote, start date, other topics, status, enacting level | extracted → `gate` answers with confidence (e.g. SF § 37.3: supported 1.00, 2026-03-01 1.00, adopted 0.97, city 0.80 in `out/audit.json`) | D | Jev (+ one targeted Luna call per uncovered topic) | built (README says G1–G4; code has G5) |
| A6 | `extract/links.py` | One Jev call over link-only manifest rows | manifest → `out/link_findings.json` | D | Jev | built |
| A7 | `extract/open_questions.py` | The guide's four open legal questions as findings with both sources | → `out/findings.json` kind `open_question` | D | Jev | built |
| A8 | `extract/compile.py` | Effective dates (statutory defaults, relative rules), status, coverage predicates, I2 + I8 files | extracted → `out/rules.json` (58 rules, scored), `out/rules.compiled.json` (64), `out/findings.json` (20) | D | — | built · counts read from the files |
| A9 | `extract/status.py` | Corroborates a "draft" reading against code-publisher links | manifest → status evidence | D | — | built |
| A10 | `extract/llm.py`, `config.py` | OpenRouter client; cache by request hash; one audit line per call | requests → `build/cache/` (git-ignored), `audit/calls.jsonl` (git-ignored) | D | OpenRouter (`OPENROUTER_API_KEY` in `.env.local`) | built |
| A11 | `extract/audit.py` | Per rule: what the model extracted, what checked it, what code decided, the calls | → `out/audit.json`, `audit/builds.jsonl` | D | — | built |
| A12 | `extract/prompts.py`, `extract/PROMPTS.lock` | Prompt lint (no test-suite value in a prompt) + freeze digest | prompts → lint report, lock | D | — | partial: digest ≠ lock (PRD known gap 6) |
| A13 | `extract/ingest.py`; `make ingest`, `make rehearse`, `make rerun` | One new text file → rules, findings, affected addresses, no code or prompt change; live re-extraction of one document | file + jurisdiction → I2 records + T6 | D | OpenRouter | built; hour-16 file not yet ingested (`outputs/changes.json` has T1–T5 only) |
| A14 | `extract/changes.py` | `changes.json` in the guide's shape from the same evaluator | I2 + I3 → `outputs/changes.json` (T1 250 · T2 90 · T3 140 + 90 flags · T4 110 · T5 0) | D | — | built · counts read from the file |

### B · Address resolution

| ID | Module | Does | Input → output | Owner | External | Status · evidence |
|---|---|---|---|---|---|---|
| B1 | `contracts/jurisdictions.json` (I1), `contracts/facts.json` (I7) | The 13 rule-bearing IDs (+ display-only counties) with aliases and Census codes; the building-fact vocabulary | hand-kept list | S | — | built |
| B2 | `web/lib/resolve/` (`normalise.ts`, `census.ts`, `tree.ts`, `match.ts`) | Normalise street, one Census geographies call, reject contradictions, neighbourhood fallback, Federal › State › County › City tree | address → legal city + tree | S | US Census geocoder (`geocoding.geo.census.gov/geocoder/geographies`), no key | built |
| B3 | `web/lib/resolve/facts.ts`, `web/scripts/resolve-batch.ts`; `make resolve` | Building facts as ranges with source and named assumptions; offline from the committed cache | `sample_addresses.csv` + `engine/cache/census/` (495 files) → `out/addresses.resolved.json` (I3, 500/500, 38 postal ≠ legal) | S | Census (cache; `make resolve-live` fills gaps) | built |
| B4 | `/api/resolve`, `/where`, `web/lib/demo-search.ts` | Search for any address, place or alias; Census only for street addresses outside the 500 | text → address / place / ambiguous / not_found / unavailable | S | Census | built |

### C · Engine, D · Change

| ID | Module | Does | Input → output | Owner | External | Status · evidence |
|---|---|---|---|---|---|---|
| C1 | `engine/evaluate.py` | The one three-valued evaluator: status by date, coverage, precedence, conflicts | rules + facts + as-of → results | D (written), S (adapted) | — | built |
| C2 | `engine/rules.py`, `facts.py`, `explain.py`, `build.py`; `make build` | Adapter + plain explanations; deterministic outputs | I2, I3, I8 → `outputs/lookups.json` (500 addresses: 4,240 applies · 315 unknown · 280 pending · 140 not yet effective · 118 superseded), `out/lookups.full.json`, `out/build_summary.json` | S | — | built · counts read from the file |
| D1 | `engine/diff.py` (I6) | Two evaluations per address compared by rule id: added / removed / changed | → `out/changes.full.json` (2 as-of sources, 390 addresses) | S | — | built |
| D2 | `engine/demo_change.py`; `make demo-change` | Fictional X001 ingest → before/after → diff → web sync, labelled "Demo: fictional ordinance" | X001 → `out/changes.full.json` | S | OpenRouter (or warm cache) | partial: never run (PRD) |
| D3 | Sunsets in the diff, change verdict, "Ends" history | End dates as change sources; ↑/↓ badges from #59's verdict | | S | — | PR #71, #72, #77 |

### Web, email, subscriptions

| ID | Module | Does | Input → output | Owner | External | Status · evidence |
|---|---|---|---|---|---|---|
| W1 | `web/scripts/sync-contracts.ts`, `build-live.ts`; `npm run sync` | Copies contracts + `out/` into `web/`; builds `web/data/live/` (quotes ±320 chars only) | `out/*.json` → `web/data/live/*.json` | S | — | built |
| W2 | `web/app/` pages: `/`, `/a/[id]`, `/a/at`, `/r/[id]`, `/j/[id]`, `/where`, `/changes/[id]` | Address page (six questions), rule page with audit trail, jurisdiction pages, change log | `web/data/live/` at build time | S | Vercel (Next.js 16, project `homerule`, root `web/`, production branch `production`) | built |
| W3 | `/api/address/[id]` (I5), `/api/resolve` | JSON with `not_legal_advice`, `as_of`, results | live data → JSON | S | Vercel | built |
| W4 | `web/components/address-map-gl.tsx`, `web/scripts/build-city-outlines.sh` | Map with pin and legal city outline | Census cartographic boundary 2024 → `web/data/city-outlines.geojson` | S | MapLibre GL 6.12.0 + OpenFreeMap tiles (`tiles.openfreemap.org/styles/positron`) | built |
| W5 | `web/components/address-map-3d.tsx`, `web/scripts/build-building-footprints.ts` | Google 3D view behind a Map · 3D switch; building outline only for sure matches (21 of 500) | Overpass → `web/data/building-footprints.json` | S | Google Maps JS `Map3DElement` (`@googlemaps/js-api-loader` 2.1.3); OpenStreetMap via Overpass (ODbL) | PR #82 |
| W6 | `web/lib/changes/email.ts`, `web/lib/alerts/layout.ts` | One alert template; preview on `/changes/[id]` | diff entry → {subject, html, text, List-Unsubscribe} | S | — | built |
| W7 | `web/lib/alerts/store.ts`, `/api/subscribe`, `/api/confirm`, `/api/unsubscribe` | Double opt-in (pending 48 h → confirm by POST), RFC 8058 one-click unsubscribe, rate limit, closed test | email → `alerts:*` keys | S | Upstash Redis (REST, Vercel Marketplace, free plan) | built |
| W8 | `web/lib/alerts/dispatch.ts`, `mail.ts`, `/api/alerts/dispatch`, `web/scripts/alerts.ts`; `make alert`, `make notify` | Sends one alert per subscriber per change source, idempotent; demo hook with a bearer token | change source → emails | S | Resend (`api.resend.com`, EU region per ARCHITECTURE [assumed]) | built; closed test still on (postal-address placeholder) |
| W9 | Alert lifecycle engine (cron, digests) | Lifecycle triggers per address | | S | Vercel Cron | idea (issue #83); a local branch `s/alert-engine` is being built, not pushed [assumed from RESUME] |
| W10 | `/api/mcp` | MCP route for assistants | | D | — | planned, no code |

### Evaluation, audit, extra work

| ID | Module | Does | Owner | External | Status · evidence |
|---|---|---|---|---|---|
| E1 | `tests/eval_suite.py`; `make eval` | Assertions (26/27 per `extract/README.md`), grid, T1–T6, trap addresses, quote check, prompt lint, "not legal advice" crawl → `out/eval/report_supplemental.md` | D | — | built; numbers depend on the pinned sources in `build/` (only on Dimitar's machine) |
| E2 | `tests/test_engine.py`, `tests/test_diff.py`; `make test` | Determinism, guards, journeys, diff = `changes.json` sets | S | — | built |
| E3 | `scoreboard/` | 20 dated questions, three arms (plain, plain + web search, HomeRule), blind grader | D | `openai/gpt-6-luna` (`:online` for web search), Jev as grader | built: plain 16/20, web search 20/20, HomeRule 18/20 with 0 wrong |
| E4 | Stable extraction, `make check` | Three samples + majority vote | D | OpenRouter | PR #53 (on hold per RESUME) |
| E5 | Card answers `out/cards.json` | Per-question card values | D | — | PR #55 |
| E6 | Renter-protection score | Impact per rule, one score | D | Jev | PR #59 (stacked on #53) |
| E7 | Source monitor | Polls official sources (Newark Legistar API), queues extraction | D | Legistar API | PR #75 |
| E8 | Extra building data | Next useful fact + public evidence | D | NJ MOD-IV etc. | PR #68 (draft) |
| E9 | `contracts/contacts.json` | 36 contact routes with source and date | D | — | built on main; PR #48 still open |
| I1 | Hosting, repos | Vercel (previews per PR, production by branch); GitHub private workspace + filtered public export (`scripts/publish.sh`, `.publish-paths`) | S | Vercel, GitHub | built |

## Existing video tooling (searched /Users/silvan/claude, excluding `strict_eu/`)

- **`/Users/silvan/claude/code/tools/demo-video`**: one command from a `script.json` to an MP4: Gemini TTS narration (voice Iapetus), one Lyria music track, Playwright capture, Remotion edit (4.0.532), ffprobe/OCR QA, an `--animatic` fast loop and `takes.py` for voice takes [verified, README]. It supports scene `clip = {url, css, seconds}`: any URL (also `file://`) recorded full-bleed. That is exactly how `architecture.html` plugs in.
- **It already made the HomeRule demo film today:** `examples/homerule/script.json`, 116.3 s, rendered 07:14 to `/Users/silvan/claude/code/tools/demo-video/out/homerule/demo.mp4` (storyboard and decisions in `notes/demo/video/storyboard.md`). Voice Iapetus, light theme, the cached music track, a proof card as a `clip`.
- Also found: `docs/VIDEO_CHECKLIST.md` (rules from earlier productions: problem first, one voice, sped-up runs carry a badge, a human listens once), vetted skill records `setup/config/vetted/skill-remotion*.md`, macOS `ffmpeg` 8.1.2. No other pipeline (no "hyperframes").

## Format

| Option | How | Change cost when a PR lands | Look | Risk |
|---|---|---|---|---|
| **A. Diagram page as `clip` scenes in the demo-video pipeline** (chosen) | `architecture.html?step=<id>&only=1&captions=0` per scene; the pipeline adds voice, music, captions, title and end card | Edit SCRIPT.md + page text, re-render ~5–10 min, cents | Same voice, music and light look as the demo film; site tokens and fonts | TTS quota (100 requests/day/model on the key); Playwright clip video is VP8 |
| B. Same page, screen recorder + own voice | Page auto-plays with its own captions and per-step durations; record with Cmd-Shift-5, voice live or dubbed, music laid under with ffmpeg | Re-record the whole take (~15 min) | Crisp (Retina capture) | Timing by hand; no QA |
| C. Remotion composition from scratch | Diagram as React components | Code change + render | Frame-exact, crisp | 3–5 h build: not affordable today |
| D. HTML slides + recorded voice | Static slides | Re-record | Flat; no data flow | Weakest at "how it works" |

**Why A:** the pipeline exists, produced the demo film this morning, and keeps the three submission videos consistent. The page is one file, so a PR landing means a text edit, not a re-shoot. It reuses the site's v3 tokens (`web/app/a/[id]/v3.css`: navy for UI and time, green/amber/slate only for results) and fonts (Atkinson Hyperlegible Next, Source Serif 4 for the law's words). **B is the fallback with zero extra work:** the same page auto-plays with captions (`?auto=1`), so if the TTS quota or the pipeline fails, a screen recording plus Silvan's voice is a 20-minute path.

Crispness: set `viewport: {width: 1920, height: 1080}` in the tech video's `script.json` so clips are recorded at native 1080p instead of 1280×720 scaled up (`pipeline/capture.mjs` records clips at `script.viewport` and scales to 1920 wide) [assumed: not yet run at 1920]. If text still looks soft in the stills, render frames with `window.HR.seek(step, t)` + screenshots + ffmpeg instead of live recording.

## Production

| # | Step | Who | Time | Output |
|---|---|---|---|---|
| 1 | Read SCRIPT.md and mark changes; decide the two open questions below | Silvan | 15 min | script v2 |
| 2 | `make eval` on Dimitar's machine (pinned sources present), save the report; screen-record it scrolling (~6 s used) | Dimitar | 15 min | `report_supplemental.md`, `eval.mov` |
| 3 | Finish `architecture.html`: polish steps 6–9, put the eval numbers and (later) hour-16 numbers in | agent | 30–45 min | page v2 |
| 4 | Pipeline script `examples/homerule-tech/script.json`: `hook.clip` = step `hook`; one `clip` scene per step (`?step=<id>&only=1&captions=0`); viewport 1920×1080; same `voice` and `music` as `examples/homerule`; `badge` "Prototype · not legal advice"; terminal recordings wrapped in a tiny `file://` page with an autoplaying `<video>` [assumed: a clip URL may play a video] | agent | 20 min | script.json |
| 5 | Terminal captures: the hour-16 `make ingest` run with a clock on screen (sped up, badge "real run · N× speed"); optionally `make rerun DOC=<short doc>` with its field diff | Dimitar (+ Silvan) | 15 min, when hour 16 happens | `ingest.mov` |
| 6 | Animatic `./make.sh --animatic examples/homerule-tech/script.json` (~1 min) → Silvan approves pacing | agent → Silvan | 10 min | `animatic.mp4` |
| 7 | Voice takes `python3 pipeline/takes.py … 2`, pick the best per passage | agent → Silvan | 10 min, ~$0.03 | locked takes |
| 8 | Full render `./make.sh examples/homerule-tech/script.json`; check the contact sheet; one human listen | agent → Silvan | 10–15 min | `out/homerule-tech/demo.mp4` |
| 9 | Swap scene 7 to the hour-16 version and re-render (audio of other scenes cached) | agent | 10 min | final MP4 |
| 10 | Upload with the submission | Silvan | 5 min | — |

About 2.5 h elapsed, of which ~1 h needs Silvan. Order against the day: steps 1–4 and 6–8 before the 12:00 freeze with the rehearsal line; step 5 and 9 as soon as the hour-16 file is in; upload by 14:30.

### Voice

| Option | Notes |
|---|---|
| **Gemini TTS, voice Iapetus, through the pipeline** (default) | Same narrator as the demo film; 146 wpm measured; transcript check per take; quota 100 requests per model per day on the key (the demo film used some today) |
| Silvan records | Most personal; record per scene so timing matches; the pipeline has no documented way to take a recorded voice file [unknown], so this pairs with format B |
| Google Chirp 3 HD (EU endpoint, as in read-to-me's work stream) | Steadier voice, no style prompt; not wired into the pipeline |
| macOS `say` (`DEMO_VOICE=say`) | Animatic only |

### Music

- **Default: reuse the demo film's track** (the pipeline's cached `music.track`, generated by Google Lyria), so the films sound like one submission. Licence: the pipeline's own docs disagree (`docs/VIDEO_CHECKLIST.md`: "Google … claims no ownership → fine for public use"; `docs/FEATURES.md`: "Licence for public use … [unknown]") → **[unknown]**, and the same question already applies to the demo film.
- **Fallback with a clear licence:** one track from Pixabay Music under the Pixabay Content License: free for commercial use, no attribution required, no standalone redistribution [verified on pixabay.com/service/license-summary, 04.10.2026]. Needs the pipeline to take a local music file instead of a Lyria prompt [unknown] or a manual ffmpeg mix (format B).

## What changes when PRs land

| Event | Scene · step | Edit |
|---|---|---|
| Hour-16 ingest done | 7 `scale`, 4 `change` | SCRIPT: hour-16 version of scene 7 with the three numbers; page: terminal card lines and the T6 tile; add the real terminal recording; re-render |
| #82 3D map merged + production | 5 `web` | Remove the `PR #82` tag; optional line "The map shows the legal city limits, and the building in 3D."; optional 4-s `clip` of `/a/<id>?map=3d` |
| #71 / #77 sunsets merged | 4 `change` | Optional line about protections ending (Jan 1, 2030 is already on the hook timeline) |
| #72 change verdict merged | 4 `change` | Optional ↑/↓ badge on the diff card (email only; page badges are off) |
| #75 source monitor merged | 7 `scale` | Optional line about watching official sources |
| #53 / #55 / #59 | — | No change unless the eval numbers move: then update the T tiles and the eval report |
| Any change to `out/` counts | 2, 3, 4 | Re-read counts (58 rules, 20 findings, 500 addresses, 38 postal ≠ legal, T1–T5) |

## Using the sample page

`/Users/silvan/claude/code/personal/homerule-workspace/.worktrees/tech-video/lab/tech-video/architecture.html`, opened in Chrome full screen.

- → / Space next step, ← back, A auto-play, R restart step, C captions, H helper.
- `?auto=1` plays all nine steps with the script's durations (115 s). `?step=extract&only=1&captions=0` plays one step and holds: the form a pipeline `clip` needs. `?step=change&t=end` freezes the last frame for stills.
- Built: all nine steps; steps 1–5 are complete with real data, 6–8 have lighter detail, step 8's terminal is a placeholder for the real hour-16 recording.
- Fonts load from Google Fonts (network needed when recording).

## Open risks

- **Eval numbers on screen** come only from Dimitar's machine: in a worktree without `build/`, `make eval` printed "Scored quotes 0/58 verbatim" and "prompts … DOES NOT MATCH the lock" (a run in a sibling worktree at 07:18 today) [verified]. Run it there and keep "prompt" out of claims until the lock is re-frozen.
- **T6 has no expected set** in our pack: never say "T6 matches"; show the affected count.
- **Tech video owner** is D in the PRD checklist, S in this plan: one line in the PRD to fix.
- The SF example rule's audit entry has `parse_status: "failed"` and a code-check flag: fine for the diagram card, risky as a rule-page close-up.
- Lyria music licence [unknown] (see Music).
