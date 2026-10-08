# HomeRule tech video: voice-over script

Private (lab/). Draft 1, 04.10.2026 ~08:15 CEST. Plan, inventory and format: [PLAN.md](PLAN.md). Picture: [architecture.html](architecture.html) (one step per scene, same ids).

**This file is the master text.** `architecture.html` copies the captions and step durations from here (the `STEPS` array at the top of its script); change both together. Numbers are checked against the repo on 04.10.2026 (sources in the last column and in PLAN.md).

## Budget

- **Length:** ≤ 2:00 including the title and end cards.
- **Pace:** the demo film's narrator (Gemini TTS, voice Iapetus) speaks **146 wpm** on average (234 words in 96.0 s of scene audio, `public/homerule/audio.json` in the demo-video tool) [verified].
- **Words:** 253 spoken (pre-hour-16 version) → about 104 s of speech + 0.6 s pause per scene + hook pad + ~3 s title + end card ≈ **1:56**. The post-hour-16 version is 258 words ≈ 1:58.
- **Why not 260–300 words:** at 146 wpm plus the cards, 300 words run to ~2:20. Above ~255 words, cut from the "cut first" list below.

## Rules for the words

- Plain and confident, no hype. Never "compliant", "illegal", "guarantee"; "not legal advice" is spoken once and on screen throughout.
- Only what is built on `main`. Lines that depend on an open PR or on the hour-16 run are marked **[PR #n]** or **[after hour 16]** and are not in the default take.
- Spoken spellings differ from captions in three places (the demo-video pipeline supports `captions` next to `narration`): "Home Rule" (the TTS said "Homerun" for "HomeRule" in the demo film), "changes dot JSON" (caption `changes.json`), "hour sixteen" (caption "hour 16").
- **Jev:** the model is `typesafe/jev-1.13` (`extract/config.py`); the team says "Jeff". Captions say "Jev". If the TTS take says something odd, spell it "Jeff" in the narration only.

## Scenes

Times assume 146 wpm; the animatic gives the real ones. "Step" = the step id in `architecture.html` (`?step=<id>`). Inventory IDs refer to the table in PLAN.md.

| # | Time | Step | Narration (spoken) | Words | On screen | Shows (inventory) | Status |
|---|---|---|---|---|---|---|---|
| 0 | 0:00–0:06 | `hook` | A model has a training cutoff. A law has an effective date. | 12 | The two lines big; a 2025–2030 timeline with real effective dates from the rules: Jan 1, 2026 Cal. Bus. & Prof. Code § 16729 · Mar 1, 2026 SF Rent Ord. § 37.3 (1.6%) · Jul 1, 2027 N.J. Stat. § 56:9-23(e) · Jan 1, 2030 Cal. Civ. Code § 1947.12 repealed; a dashed "training cutoff" marker (no model, no date: illustration) and the blue "as of Oct 1, 2026" marker | A8 (dates), C2 | built |
| — | 0:06–0:09 | (title card) | — | — | Pipeline title card "HomeRule · how it works" (standalone page: the hook holds instead) | — | — |
| 1 | 0:09–0:15 | `bet` | So Home Rule reads the law once into rule records, and code decides coverage. | 14 | Whole diagram fades in (A extraction, B addresses, C engine, D change, web). Band: "The model reads each law once, into rule records. Code decides coverage, for every address, on any date." Model box, then code boxes light up | all | built |
| 2 | 0:15–0:31 | `extract` | Jev, a decision model, answers bounded questions with a confidence: start date, status, level of government. Luna extracts the fields and a verbatim quote. Code checks every quote against the source and compiles a dated rule record. | 37 | Token "D080 · sf.gov rent notice" travels corpus → models → checks → records. Jev card with the **real gate answers** for this rule (`out/audit.json`): quote supports value → supported 1.00 · start date → 2026-03-01 1.00 · status → adopted 0.97 · level → city 0.80. Then the rule record builds up: citation, key value 1.6%, the verbatim quote in the law's serif, "✓ found verbatim in source D080", in force from 2026-03-01, applies_if built ≤ 1979-06-13, id `CA-SAN-FRANCISCO-RENT-37.3` | A1–A5, A8, A10 | built |
| 3 | 0:31–0:48 | `engine` | The Census geocoder puts each address in its legal city, not its mailing city. The engine tests every rule against the building's facts on an as-of date: applies, doesn't, or unknown, naming the missing fact. Same input, same bytes. | 39 | Tokens on lane B: "3515 Fillmore St → Census → San Francisco → built 1926 · 21 units" and "471 Columbia Rd, Dorchester → Boston → built 1930 · 7+ units". Address card (38 of 500 mailing ≠ legal city). Engine lights up at "as of Oct 1, 2026"; result rows: **applies** SF Rent Ord. § 37.3 (built 1926, before the June 13, 1979 cutoff) · **superseded** Cal. Civ. Code § 1947.12 (the stricter city rule governs) · **unknown** LAMC § 151.06 at 10635 Sherman Grove Ave (built 1978, cutoff Oct 1, 1978). "make build twice → identical files" | B1–B3, C1–C2 | built |
| 4 | 0:48–1:07 | `change` | A change is a new date or a new document: the engine runs twice and diffs every address. The change log and the alert email read that diff, and a test holds changes dot JSON to it. T1 to T5 match the expected sets. | 44 | Second date chip Jul 2, 2027; diff card for 327 Jackson St, Hoboken: N.J. Stat. § 56:9-23 not yet effective → applies, conflict with Hoboken's own ban still flagged; footnote "changes.json is computed by extract/changes.py; tests/test_diff.py checks it gives the same sets". The three outputs light up. Tile row: T1 250 · T2 90 · T3 140 + 90 conflict flags · T4 110 · T5 0 · T6 *after hour 16* | D1, A14, E2, W6 | built (T6 [after hour 16]) |
| 5 | 1:07–1:21 | `web` | The website on Vercel reads the same files; there is no database for the law. Each address page answers six questions with quote, date and source. Alerts use double opt-in, Upstash Redis and Resend. | 34 | Web box; card: `/a/[id]` six questions · `/r/[id]` rule page with audit trail · `/api/address/[id]` JSON · Census for typed addresses · MapLibre + OpenFreeMap + Census city outline · Google 3D + OSM building outline **[PR #82]** tag · alerts double opt-in → Upstash Redis · Resend | W1–W8 (W5 in PR) | built; 3D [PR #82] |
| 6 | 1:21–1:36 | `responsible` | Each rule page shows what the model extracted and what code decided. Every model call is logged with its hash and cost. Conflicts are flagged, never decided, and every answer says: not legal advice. | 34 | Dashed zone "Model: reads and quotes" around Jev + Luna; every code box lit. Card: `/r/[id]` model extracted │ code decided · `audit/calls.jsonl` stage · model · hash · cost · `conflict_flag` flagged, never decided · as-of date and "Not legal advice" on every view. A real call line: `{"stage":"luna_extract","ref":"D080","model":"openai/gpt-6-luna","request_hash":"a2c6f827…","cost":0.00104}` | A10–A12, E1, W2 | built |
| 7 | 1:36–1:49 | `scale` | A new city is its law texts and one list entry; there is no per-city code. A new ordinance goes in with one command: our rehearsal ran in twenty-four seconds. | 30 | Token "hour-16 ordinance" runs the same lane A; terminal card `make ingest DOC=<hour-16 file> JUR="Cambridge, MA" ID=X002` with placeholders; "new city = law texts + manifest rows + 1 entry in contracts/jurisdictions.json → make all". **Replace the card with the real terminal recording** (see PLAN, production step 5) | A13, B1 | rehearsal built; hour 16 [after hour 16] |
| 8 | 1:49–1:56 | `end` | Every number on screen is reproducible from the repo. | 9 | First ~4 s: the real `make eval` report scrolling, labelled "score.py and the dev key are not in our starter pack: this is make eval against the brief's expected sets" (brief p.6 asks for the score report on screen). Then the end card: HomeRule · "Housing law, quoted and dated, for your exact address." · yourhomerule.com · Not legal advice | E1 | eval capture to do |

Total: 253 words.

## Hour-16 version of scene 7 (swap in after the real run)

> A new city is its law texts and one list entry; there is no per-city code. At hour sixteen, the new ordinance went in with one command: [n] rules, [n] affected addresses, in [n] seconds.

35 words. Fill the three numbers from the terminal output of `make ingest` (and `make eval` for T6). Scene 4's last sentence stays "T1 to T5 match the expected sets": we have no expected set for T6, so we never say it matches. On screen in scene 4, replace the T6 tile's "after hour 16" with the affected-address count.

## Optional lines when a PR lands (only if merged and live before the render)

| PR | Scene | Add or swap | Words |
|---|---|---|---|
| #82 3D map | 5 | Swap the alerts sentence's position and add: "The map shows the legal city limits, and the building in 3D." Remove the `PR #82` tag in the page | +12 |
| #71 / #77 protections ending | 4 | After "diffs every address": "including when a protection ends, like California's rent cap in 2030." | +12 |
| #75 source monitor | 7 | "A monitor watches official sources, such as Newark's council records, and queues new ordinances for the same pipeline." | +18 |
| #59 renter-protection score | — | Not in this video (stacked on #53, which is on hold) | — |

Every add-on costs ~5–8 s: cut the same amount from the list below first.

## Cut first (≈ 5 s each)

1. Scene 2: "with a confidence" (−3 words; the card still shows the numbers).
2. Scene 3: "Same input, same bytes." (−4; the badge stays on screen).
3. Scene 7: "there is no per-city code" (−5).
4. Scene 5: "there is no database for the law" (−7; the card title keeps it).

## Claims checked while writing

- "One diff feeds changes.json, change log and email" (the brief's story) is **not literally true on main**: `engine/diff.py` feeds the change log and the email; `outputs/changes.json` is computed by `extract/changes.py`, and `tests/test_diff.py` asserts both give the same sets (ARCHITECTURE D, "Sharing one function was left out"). Scene 4 says the accurate version.
- "Code checks every quote" is true of the pipeline (`extract/luna_pass.py` quote location, `make eval` quote check). Whether **all** scored quotes pass depends on the pinned sources in `build/`, which only exist on Dimitar's machine; a `make eval` in a worktree without them prints "Scored quotes 0/58 verbatim". Run the on-screen eval on his machine.
- "No prompt change" for hour 16: `extract/ingest.py` needs none [verified, docstring], but `make eval` currently reports the prompt digest "DOES NOT MATCH the lock" (PRD known gap 6). Re-freeze before the hour-16 file is opened, or keep "prompt" out of the narration (it is out of the default take; the terminal card says "no code or prompt change" and should lose "or prompt" if the lock isn't fixed).
- Rehearsal "twenty-four seconds" = `extract/README.md` ("T6 rehearsal 45/45 in about 24 s"), not re-run for this script.
- The SF rule used on screen (`CA-SAN-FRANCISCO-RENT-37.3`) has `parse_status: "failed"` and one code-check flag in `out/audit.json` ("applies_if: op le contradicts 'after' in its quote"). The card shows only fields that are right; don't open that rule's audit trail on camera without checking what the page shows.
