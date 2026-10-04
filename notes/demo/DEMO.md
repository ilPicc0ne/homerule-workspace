# HomeRule demo script (live run and demo video)

Private, never published. Written Sun 04.10.2026, 05:00–07:00 CEST, against **production https://yourhomerule.com = `production` @ 8e7c326**. Every screen below was opened on production with a headless browser (read-only: no form submitted, no send triggered). Screenshots: `notes/demo/shots/` (1440×900, file names = beat ids). Where production does not show what the script needs, the beat says so in **Screen ≠ script**.

Companion files: `GAPS.md` (what to fix this morning), `PRODUCT-REVIEW.md` (cold walk-through, tech and team video outlines), `video/` (the narrated demo film for the submission).

## 0. What changed against the PRD demo table, and why

| PRD beat | Decision | Reason (verified) |
|---|---|---|
| 1 Chatbot scoreboard as opener ("ChatGPT 9/20 · HomeRule 19/20") | **Cut as opener. Never say those numbers.** One honest line in beat 8 instead | `scoreboard/results/SCOREBOARD.md` (run 3): plain chatbot 16/20 (4 wrong), **plain + web search 20/20**, HomeRule 18/20 (2 partly, 0 wrong). A judge who asks "and with search?" ends the beat. The honest edge is per-building answers, quotes, determinism and law not on the web yet (beats 2 and 7) |
| 5 Date slider on the FAIR Act map, dots flip | **Replaced** by Coming up + the change log (old → new) | The published data has one as-of date (`web/data/live/meta.json`: `as_of_dates` = [2026-10-01]); the timeline on rule pages has one stop; the address page ignores `?as_of=`. The flip exists only as the change log `asof:2026-10-01..2027-07-02` |
| 3 Two buildings: LA unknown + Dorchester | Kept, split into beats 3 and 4, plus a new beat 2 (same city, two buildings) | Beat 2 is the strongest answer to "why not ask a chatbot" and costs 15 s |
| 6 Hour-16 live with the alert on a phone | Kept, with a rehearsed fallback path that already works today (real NJ change, demo inbox) | The hour-16 document is not ingested yet; `make demo-change` needs `OPENROUTER_API_KEY` |
| 7 Proof frame "T1–T6 pass" | Kept, numbers corrected to what the repo proves | T1–T5 exact in `make eval`; T6 only after the hour-16 ingest; quote count must be re-run on a clean checkout (GAPS #4) |
| J5 compare | **Not shown** | Not built. Beat 2 opens two buildings one after the other and says nothing about "compare" |

## 1. Run of show (live, 2:45)

| # | Time | Beat | Where (production) | Who drives |
|---|---|---|---|---|
| 0 | 0:00–0:12 | Hook: a law has a date | `/` | Silvan speaks, Silvan drives |
| 1 | 0:12–0:52 | Ana's rent question (J1) + audit trail | `/a/A0016` → `/r/CA-RENT-1947.12?from=A0016` | Silvan |
| 2 | 0:52–1:05 | Same city, other building | `/a/A0050` | Silvan |
| 3 | 1:05–1:25 | Honest unknown + who to ask (J2, J7) | `/a/A0107` | Silvan |
| 4 | 1:25–1:45 | Mail says Dorchester, law says Boston; a bill is not law (J6) | `/a/A0258` → `/r/MA-ALG-2983` | Silvan |
| 5 | 1:45–2:05 | What's coming, conflict flagged not decided (J3) | `/a/A0012` → `/changes/A0012` | Silvan |
| 6 | 2:05–2:35 | Hour 16: new law in, alert out (J4) | terminal + `/changes/<id>` + phone | Dimitar terminal, Silvan phone |
| 7 | 2:35–2:45 | Proof frame and close | slide / `make eval` report | Dimitar speaks |

Spoken words per beat are written to fit the time at ~150 words per minute. Read them once aloud with a stopwatch before recording.

## 2. Beats

### Beat 0 · Hook (0:00–0:12)
- **URL:** https://yourhomerule.com/ (shot `b0-home.png`)
- **Clicks:** none. Mouse rests on the search box.
- **Screen (verified):** navy banner "Prototype built at a hackathon — not production-ready. Results may be wrong or out of date. Not legal advice."; header "Not legal advice · As of Oct 1, 2026"; hero "Your rights as a renter, for your exact address."; eight example chips; footer line "A model has a training cutoff. A law has an effective date."
- **Talk:** "A chatbot has a training cutoff. A law has an effective date. HomeRule reads housing law once, turns it into dated rules, and answers for one exact address. Quoted, dated, and honest when it doesn't know."
- **Proof point:** the not-production-ready banner and "Not legal advice" are on screen before anything else (Responsible design).
- **Fallback:** if the site is down, play the recorded film (`video/`) from 0:00 and narrate live.

### Beat 1 · Ana, 3515 Fillmore St, San Francisco (J1) (0:12–0:52)
- **URL / ID:** `/a/A0016` (built 1926, 21 units, DataSF). Backup: `/a/A0215` 2295 California St (1924, 21 units, same six green tiles, verified).
- **Clicks:**
  1. Type `3515 Fill` slowly in the home search → one suggestion "3515 Fillmore St · San Francisco, CA · Address" → click it (shot `b1a`).
  2. Page `/a/A0016` (shot `b1b`). Pause 2 s on the hero.
  3. Click the **Rent increases** tile (opens; shot `b1c`).
  4. Click **Show the law** inside it (shot `b1d`).
  5. Click **See the full rule and every building it reaches** under the *State of California* row → `/r/CA-RENT-1947.12?from=A0016`. Scroll to **Audit trail** (shot `b1f`), then to **Decided by code for the example addresses** (shot `b1g`); impact map shot `b1h`.
- **Screen (verified):** "California › San Francisco County › San Francisco · Inside San Francisco city limits — city and state rules apply · Built 1926 · 21 units · Building facts from DataSF wv5m-vpq2 (2025 roll)". At a glance: "There's a rule for each of the 6 topics". Rent tile: "The city's yearly limit for rent-controlled units is 1.6% (Mar 2026–Feb 2027)… The Rent Board can check your notice." Open: "San Francisco rent control covers buildings first approved for living before June 13, 1979. Your unit may differ." → **Talk to someone first: San Francisco Rent Board 415-252-4600 (Number not yet checked by us, confirm before calling)** → checklist "Your rent increase notice / Your lease / Your move-in date". Show the law: "State of California's rule (Cal. Civ. Code § 1947.12) is replaced here by the city rule", city row "Applies · Confidence: low", state row "Replaced here by the city rule" with the verbatim §1947.12(a)(1) quote and "built 1926 … before the June 13, 1979 cutoff". Rule page audit: "Extracted by the model" (requirement, key value "5% plus the percentage change in the cost of living, capped at 10%", Quote found in source: yes, Confidence 90%) │ **reasoning boundary** │ "Decided by code" (jurisdiction, dates "in force from 2024-04-01 until 2030-01-01", coverage, precedence "replaced where a stricter local rule covers the building"). Impact: "27 applies · 100 unknown · 118 replaced by a stricter rule · 5 not covered" of 250 CA addresses.
- **Talk:** "Ana got a rent increase. She types her address. San Francisco, built 1926, 21 units, from the city's own records. Rent: the city's limit is 1.6 percent this year. Open the law: the state cap still exists, but here it is replaced by the city rule, because the building is older than June 1979. Every line is a verbatim quote with its date. And this is the line we care most about: the model read the law; code decided whether it covers Ana's building. Same facts, same date, same answer, every time."
- **Proof point:** Plain language (one sentence per tile) · Module B precedence (superseded) · citations · audit trail with the reasoning boundary (stretch goal) · confidence shown.
- **If a judge asks about "Confidence: low" on the city row:** "The source is the Rent Board's annual notice, not the ordinance text, so we mark it low. We show that rather than hide it."
- **Fallback:** if the search suggestion doesn't appear, click the chip "3515 Fillmore St" under the search box. If the rule page fails, stay on Show the law: the replaced-by note and the engine explanation say the same thing.

### Beat 2 · Same city, another building (0:52–1:05)
- **URL / ID:** `/a/A0050` 36 Hoff St, San Francisco (built 1986, 49 units). Backup: `/a/A0081` 145 Taylor St (2005, 69 units; a featured chip on the home page).
- **Clicks:** type `36 Hoff` in the sticky address bar → pick the suggestion "36 Hoff St · San Francisco, CA" (verified) → click **Rent increases** (shot `b2-a0050-state-cap`).
- **Screen (verified):** Rent tile "There's a rule · California limits yearly rent increases to 5% plus inflation, never more than 10%. Some buildings are exempt. · California law". Open: "The state cap covers many apartments built more than 15 years ago… Your unit may differ."
- **Talk:** "Same city, same question, a building from 1986. Now the answer is the state cap, 5 percent plus inflation, at most 10. A chatbot answers per city. The law answers per building."
- **Proof point:** the honest difference to "just ask ChatGPT": per-building coverage from public building facts. A chatbot with web search scored 20/20 on our city-level questions (`scoreboard/`), so we do not claim to beat it there.
- **Fallback:** chip "145 Taylor St" on the home page.

### Beat 3 · Marco, 10635 Sherman Grove Ave, Los Angeles (J2, J7) (1:05–1:25)
- **URL / ID:** `/a/A0107` (built 1978, 20 units). Backup: `/a/A0432` 14605 Rayen St (1978, 23 units, same unknown, verified).
- **Clicks:** chip or address bar → `/a/A0107` → At a glance shows "For 1 topic, we're missing one fact" → click **Rent increases** → point at **What we don't know yet** → scroll to **Talk to someone first** and **Before you call, have ready** (shots `b3a`, `b3b`) → click **Show the law** and point at the *City of Los Angeles* row.
- **Screen (verified 06:40):** tile "We're missing one fact · Los Angeles rent control limits yearly increases for covered units (3% for Jul 2025–Jun 2026)". Open: "LA rent control generally covers buildings first built on or before Oct 1, 1978. Your unit may differ." → "Los Angeles Housing Department 866-557-7368 (not yet checked by us)", checklist, "Ask your landlord: whether the owner lives here". Show the law, LA row: "Missing one fact · … depends on built 1978 …, but the cutoff is on or before October 1, 1978 and the year alone can't settle it. Check the certificate-of-occupancy date (city building department or the landlord)."
- **Screen ≠ script:** on production (8e7c326) the box *What we don't know yet* lists "An exception in the law's text" and "Whether the owner lives in the building", **not** the certificate-of-occupancy date (GAPS #2). Fixed on main by #78 (names the missing approval date); live after the production update (GAPS #1). Until then, point at the LA row under Show the law, which states the right fact. The owner-occupied line comes from the unscoped exemption (GAPS #3, issue #81). The "Ask your landlord: whether the owner lives here" helper asks about owner occupancy for a 20-unit building: don't click it on camera.
- **Talk:** "Marco in Los Angeles. Built 1978. LA rent control covers buildings first approved on or before October 1, 1978, and the year alone can't tell us. So we don't guess: we say unknown, name the one fact that settles it, and who can tell him. The housing department, by phone, with what to have ready."
- **Proof point:** "unknown, not a guess" (brief rule; partial credit in scoring) · the next step is a human contact (J7) · no legal advice.
- **Fallback:** Show the law row as above; backup address A0432.

### Beat 4 · 471 Columbia Rd, "Dorchester" (postal ≠ legal city, J6) (1:25–1:45)
- **URL / ID:** `/a/A0258` (Boston, 1930, 7+ units from the use code, subsidised). Backup: `/a/A0048` 1619 Commonwealth Av, "Brighton" (verified: same rent tile, "mailing address says Brighton").
- **Clicks:** chip "471 Columbia Rd Dorchester" → hero → click **Rent increases** → then the **Software that sets rents** tile → **Show the law** → "See the full rule and every building it reaches" on the *Mass. S.2983* row → `/r/MA-ALG-2983` → scroll to **Which buildings it reaches** (shots `b4a`, `b4b`, `b8a`, `b8b`).
- **Screen (verified):** "Inside Boston city limits (mailing address says Dorchester) · The mailing address says Dorchester, but the building is inside the City of Boston. Boston law applies. · Built 1930 · 7 or more units · Listed as subsidised housing · Units are read from the use code (an estimate)". Rent tile: "No local rule — state basics only · Massachusetts doesn't allow rent control, so there's no city limit on increases… One bill is proposed; a bill is not law." Show the law: Mass. Gen. Laws ch. 40P § 4 quote "No city or town may enact, maintain or enforce rent control of any kind…" + Boston H.3744 "Proposed, not law". `/r/MA-ALG-2983`: "Proposed, not law · 110 pending, not law · All 110 sample addresses in Massachusetts", audit "Dates: a bill, not law, so it never covers an address yet."
- **Talk:** "The mail says Dorchester. The law says Boston, and Boston can't cap rents: state law bars it. The struck ballot question never shows up as a rule. Two bills on rent-setting software are pending: for an advocate, here are all 110 Massachusetts buildings they would reach, marked pending, never in force."
- **Proof point:** jurisdiction resolution (38 postal ≠ legal cities fixed) · T5 (no cap in Boston/Cambridge) · T4 (pending, 110 addresses) · enacted vs pending separated.
- **Don't open:** the Eviction tile on Boston/Cambridge addresses ("No local rule" label above a Boston rule; A0258 also shows "An exception in the law's text"). GAPS #11.
- **Fallback:** typed address beat: `/a/at?q=4801 E 3rd St, Los Angeles, CA` shows "Outside any city: unincorporated Los Angeles County … City of Los Angeles rules don't apply here" (shot `b4c`). It calls Census live (one retry, 8 s timeout), so only use it when the network is good.

### Beat 5 · 1064 Summit Ave., Jersey City: what's coming (J3) (1:45–2:05)
- **URL / ID:** `/a/A0012` (built 1900, 6 units). Backup: `/a/A0026` 59 Oak St., Jersey City (verified, same tiles). Second backup `/a/A0256` 327 Jackson St, Hoboken (PRD's J3 address; weaker: its city rule shows "Hoboken ordinance (citation not stated)").
- **Clicks:** address bar `1064 Summit` → hero "Next change" (shot `b5a`) → click **Software that sets rents** → **Show the law** (shot `b5c`) → in Coming up click **What changed, old → new** → `/changes/A0012` (shots `b5d`, `b5e`).
- **Screen (verified):** hero "Next change: Jul 1, 2027 — software that sets rents: From Jul 1, 2027, landlords can't use software that sets rents in New Jersey." Tile "There's a rule · Jersey City bans landlords from paying for rent-setting services. · New state rule from Jul 1, 2027 · Possible overlap between state and city, flagged". Show the law: box "Possible overlap, not decided — A state law may limit city rules on this topic. Whether it does here is a legal question. HomeRule shows both sources and flags it for review; it doesn't decide which one governs." + Jersey City Code § 218-12(2)(a) quote, confidence high. Change log: "Between October 1, 2026 and July 2, 2027 · NJ FAIR Act … · Before: Enacted, not yet in effect → now: Applies · Still flagged: may conflict with another rule, not decided", quote, "In effect from July 1, 2027", then **Alert email preview** (From/Subject/List-Unsubscribe, HTML frame).
- **Talk:** "What's coming: New Jersey's FAIR Act takes effect July 1, 2027. Today it's enacted but not in force. On July 2 it applies, and it may clash with Jersey City's own ban. That's a legal question, so we flag it for a human and show both sources. We don't decide it. The change log shows old to new, and the alert email is built from the same comparison."
- **Proof point:** T3 (not yet effective → applies, conflict flagged; `make eval`: 140 flips, 90 flags, exact) · as-of logic · conflicts flagged, not decided.
- **Screen ≠ script:** there is no date slider (one published date). Say "on July 2", don't touch any date control. The FAIR Act rule page `/r/NJ-ALG-56%3A9-23` is **404 on production**; fixed on main by PR #76, live only after the next production update (GAPS #1). Once live, it is the better advocate view: "140 not yet in force · 90 with a conflict flag".
- **Fallback:** `/changes/A0256` (Hoboken) shows the same entry.

### Beat 6 · Hour 16: a new law arrives, the renter hears about it (J4) (2:05–2:35)
Two versions. Decide at 11:00 which one is recorded (GAPS #6); both are honest.

**6A Live take (the goal): the hour-16 ordinance.**
- **Dimitar, terminal** (font 20 pt, clock visible: `date` before and after):
  1. `date; make ingest DOC=<path to the hour-16 file> JUR="Cambridge, MA" ID=X002; date` → prints `X002: n rule(s), effective [...]`, the new rules (category, citation, key value), then the eval report with T6.
  2. `make build` → `outputs/changes.json` gets T6, `out/changes.full.json` gets `ingest:X002@2026-10-01` → `cd web && npm run sync` → commit, PR, merge, production update (Silvan's go; ~2 min until Ready).
- **Silvan, phone ready:** demo inbox seeded at one Cambridge address the T6 diff affects (`npm run seed-subscriber -- --demo <affected Cambridge id>`; see pre-flight) → `make alert SOURCE='ingest:X002@2026-10-01' URL=https://yourhomerule.com` → mail arrives; open it on the phone; tap through to the address page.
- **Screen:** terminal with timings; `/changes/<Cambridge id>` "New document X002 …" old → new ("Not listed → Enacted, not yet in effect" if the effective date is in the future); phone notification.
- **Talk (Dimitar):** "Hour sixteen: the organisers released a new Cambridge ordinance. Same command as every other law, no code change, prompts frozen before it arrived. It reads the text, finds the rule and its future date, and re-checks all 500 buildings: these Cambridge addresses change. (Silvan:) And this renter, who asked for alerts, gets the email: what changes, from when, quoted, not legal advice."
- **Proof point:** extraction is automated (brief: "the hour-16 ordinance and a live rerun in the demo check this") · Scalability (a new document, no code) · change tracking T6 · the alert loop.
- **Video edit:** the deploy wait is cut; keep the terminal clock on screen and label the cut "deploy: 2 min, cut".

**6B Rehearsed path (works today, real law): the FAIR Act alert.**
- Address `/a/A0011` 834-836 Raymond Blvd, Newark (shot `b6a`; alert form opened, not submitted: `b6b`) (demo inbox seeded there 04.10, allowed + demo; dry run = exactly one recipient, per `.claude/REHEARSAL.md`).
- **Silvan:** `make notify SOURCE='asof:2026-10-01..2027-07-02'` (dry run, must print one `would_send A0011` line) → `make alert SOURCE='asof:2026-10-01..2027-07-02' RESET=1 URL=https://yourhomerule.com` → phone: "Something changes for your rent rules at 834-836 Raymond Blvd" in < 60 s.
- **Talk:** "Alerts run on the same comparison as the change log. Here: the FAIR Act for a Newark tenant who signed up."
- **Don't show:** the Newark rent tile (its line is a hardship ceiling, "must not grant an increase exceeding 25%", which reads like a cap; GAPS #10).

**Fallbacks (both versions):** sending fails → on the address page click **See an example alert** (overlay labelled "Preview — simulated, nothing is sent", shot `b6c`) or show the **Alert email preview** on `/changes/<id>`. Ingest fails live → play the rehearsal recording (`make rehearse` on the fictional X001, ~24 s for 45 addresses per the PRD) and say it is the rehearsal.
- **Screen ≠ script:** the email footer shows "HomeRule · [PLACEHOLDER: HomeRule postal address — owner to fill in]" (overlay, preview and real mail). GAPS #7.

### Beat 7 · Proof frame and close (2:35–2:45)
- **Screen:** one slide (or the `make eval` report scrolled): numbers only with their source.
  - 500/500 sample addresses resolved; 38 mailing cities corrected to the legal city (ARCHITECTURE B, `make resolve`)
  - T1 250 · T2 90 · T3 140 flips + 90 conflict flags · T4 110 pending · T5 0, all equal to the expected sets (`make eval`, verified 06:30 on main)
  - 26 of 27 rules the brief names, right status and date (the miss: Santa Ana's ban, no text in the corpus)
  - quotes verbatim in the pinned source: re-run on a clean checkout before quoting a number (GAPS #4)
  - T6: fill in after the hour-16 run
  - Chatbot check, 20 dated questions: plain chatbot 4 wrong, HomeRule 0 wrong (`scoreboard/`)
- **Talk (Dimitar):** "Every number here comes from one command, and the same input gives the same bytes. Not legal advice: the law, quoted and dated, for your exact address."
- **Fallback:** none needed; it's a slide.

## 3. Coverage matrix

Judging criteria (brief p.6): the 75 automatic points are scored from the files, so the demo shows evidence for them; the 25 judge points are won here.

| Criterion | B0 | B1 | B2 | B3 | B4 | B5 | B6 | B7 |
|---|---|---|---|---|---|---|---|---|
| Plain language and usability (10, judges) | · | ● | ● | ● | ● | ● | ● | |
| Responsible design: uncertainty (10, judges) | | ● confidence | | ● unknown | ● pending ≠ law | ● conflict not decided | | |
| Responsible design: audit trail | | ● reasoning boundary | | ● engine sentence | ● audit on bill | ● change log | ● eval log | ● |
| Responsible design: guardrails | ● banner, not legal advice | ● "your unit may differ" | | ● human contact first | ● no invented cap | ● | ● "not legal advice" in email | ● |
| Scalability path (5, judges) | | | | | | | ● new doc, no code | ● |
| Extraction (25, auto) | | ● quote + citation | | | ● ch. 40P finding | ● | ● live | ● 26/27 |
| Address coverage (20, auto) | | ● superseded | ● per building | ● unknown | ● legal city | | | ● 500/500 |
| Citations (15, auto) | | ● | ● | ● | ● | ● | ● | ● |
| Change tracking (15, auto) | | | | | ● T4 T5 | ● T3 | ● T6 | ● T1–T6 |
| Brief rule: show the extraction pipeline in the demo | | | | | | | ● | |
| Stretch: confidence + conflict flag | | ● | | | | ● | | |
| Stretch: audit view | | ● | | | ● | | | |
| Stretch: Spanish, new jurisdiction live | not built: not shown, not claimed | | | | | | | |

| Journey | Beat | Status on production | Honest substitute if not live |
|---|---|---|---|
| J1 What applies at my address | B1 | walkable `/a/A0016` | — |
| J2 An honest unknown | B3 | partly: unknown shown, missing-fact box names the wrong facts; "you told us" not built | point at the LA rule row under Show the law; say "you can ask the city", never "enter it here" |
| J3 What's coming | B5 | partly: next change, flag and change log; no date control | change log old → new; never touch a date |
| J4 Tell me when the law changes | B6 | partly: signup closed test; demo dispatch built, not yet rehearsed on stage; hour-16 not ingested | 6B rehearsal path, then the simulated preview |
| J5 Compare before I move | — | not built | B2 shows two buildings in sequence, no "compare" claim |
| J6 Which buildings does this bill reach | B4 (`/r/MA-ALG-2983`), B5 once #76 is live | walkable, one date | — |
| J7 Take action | B1, B3 | mostly: contact first, checklist; landlord email asks the wrong fact | show contact + checklist only |

## 4. Pressure test

Each objection a judge or the RealPage sponsor could raise, tested against the live site and the repo.

| # | Objection | Tested how | Script's answer | Changed in the script |
|---|---|---|---|---|
| 1 | "ChatGPT with search answers this." | `scoreboard/results/SCOREBOARD.md`: + web search 20/20 | We agree on city-level questions. B2 shows what it can't: two buildings, one city, two answers; B6 shows law that isn't on the web; every answer is quoted and reproducible | Opener cut; no "9/20" anywhere |
| 2 | "Your model decides who is covered, so it can hallucinate coverage." | Rule page audit on production | B1: the model extracts, code decides; same facts and date give the same answer (rebuild byte-identical, checked 06:30) | Audit trail moved into B1 |
| 3 | "Is the extraction really automated, or hand-coded?" | Brief p.5 rule | B6 live ingest of a document nobody saw before, prompts frozen | Prompt lock currently "DOES NOT MATCH" in `make eval`: must be re-frozen before hour 16 or the claim is weak (GAPS #4) |
| 4 | "You show 'unknown' a lot: that's a cop-out." | `out/build_summary.json`: San Diego 150 unknown of 400, Berkeley 80 | B3: unknown names the one fact and who can settle it; the brief gives unknown partial credit and penalises a wrong "applies"; San Diego/Berkeley have no year built in the public data (brief) | — |
| 5 | "Isn't this legal advice?" | Banner, tile foot, email footer, API `not_legal_advice: true` | B0 banner; tiles state facts and a human contact; conflicts not decided | Avoid helpers that read like advice on camera |
| 6 | "Could a landlord use this to find unprotected buildings?" | PRD Never list | No ranking, no map of protection levels; the impact map is per rule for advocates | Not said unless asked |
| 7 | "The date slider?" | `meta.json` one date | Not claimed; B5 uses the change log | Slider beat removed |
| 8 | "Does it scale to a new city?" | ARCHITECTURE "Scaling" | Documents + one jurisdiction-list entry + `make all`; hour 16 is the live proof. Santa Ana: rules extracted, no addresses in the data | Don't demo Santa Ana as "new jurisdiction live": it's in the original scope |
| 9 | "These phone numbers: are they right?" | Tile text | Every number says "not yet checked by us, confirm before calling" | — |
| 10 | "Confidence: low on the SF rule?" | Show the law | Source is the Rent Board's notice, not the ordinance; we show it | Line ready for Q&A |
| 11 | "Newark: 25% a year?" | `/a/A0011` rent tile | Not shown; GAPS #10 | Newark used only for the email |
| 12 | "Is the alert real?" | `.claude/REHEARSAL.md` | Real Resend send to a seeded demo inbox in a closed test; the overlay is labelled simulated | 6B before 6A in rehearsal |
| 13 | "What if the address isn't one of the 500?" | `/a/at?q=…` East LA | Census resolves it; building facts unknown, said plainly | B4 fallback only (network risk) |
| 14 | "Outside your three states?" | `/where?q=Austin, TX` | "Not covered: HomeRule has law for 3 states and 10 cities" (shot `b7a`). Home search: "New York" returns no suggestion and Enter does nothing visible (GAPS #12): use `/where` | Optional Q&A screen |

## 5. Pre-flight checklist (T-30 min)

Silvan, laptop:
- [ ] Production deploy Ready and on the commit you expect (Vercel dashboard, project `homerule`, target production). After GAPS #1/#2 merge: `production` updated by Silvan, then re-open `/r/NJ-ALG-56%3A9-23` (must be 200) and `/a/A0107` rent tile.
- [ ] Vercel env (production): `DEMO_TOKEN`, `ALERTS_SITE_URL=https://yourhomerule.com`, `RESEND_API_KEY` (sending-only), `KV_*`. Local `web/.env.local` via `vercel env pull` has `DEMO_TOKEN` matching and `DEMO_INBOX` exported in the shell.
- [ ] Demo inbox seeded: `make notify SOURCE='asof:2026-10-01..2027-07-02'` prints exactly one `would_send A0011` line. For 6A also seed one affected Cambridge id after the T6 diff exists, then dry-run that source: exactly one line.
- [ ] Rehearse 6B once with `RESET=1`; mail arrives < 60 s; then reset again.
- [ ] Browser: Chrome, new profile (no extensions, no autofill), zoom 110% for the live room / 100% for recording at 1280×720, bookmarks bar hidden, notifications off.
- [ ] Tabs in order: 1 `/` · 2 `/a/A0016` · 3 `/a/A0050` · 4 `/a/A0107` · 5 `/a/A0258` · 6 `/a/A0012` · 7 `/changes/A0012` · 8 `/a/A0011` (fallback overlay) · 9 `/where?q=Austin%2C%20TX` · 10 proof slide. Each pre-loaded once (first request of a non-featured address renders on demand).
- [ ] Recording: 1280×720 window, cursor highlight on, system clock visible for B6.
Dimitar, terminal:
- [ ] `git pull` on main, `.venv` active, `OPENROUTER_API_KEY` set, `make freeze` done before the hour-16 file is opened, `make rehearse` green once this morning.
- [ ] Hour-16 file downloaded from the organisers' Drive to a known path; jurisdiction string `"Cambridge, MA"` (check the file).
- [ ] Terminal: 20 pt font, light theme, prompt shortened, window 1280×720.
Phone (Silvan's):
- [ ] Gmail app on the demo inbox, notifications on, earlier takes archived, Do Not Disturb off, screen mirroring or a second camera ready.

## 6. Who does what

| Time (CEST) | Silvan | Dimitar |
|---|---|---|
| 07:00–09:00 | GAPS #1 (production update: #76, #78), #7 footer, #8 fictional label, #11 labels | GAPS #3 (issue #81 owner-occupied scope), #4 (clean `make eval`, re-freeze), hour-16 readiness |
| 09:00–10:00 | Rehearse beats 0–5 twice with a stopwatch; 6B once | Rehearse 6A on X001 with the clock |
| hour 16 (time [unknown], watch Discord) | Phone and alert for 6A | Ingest on camera, `make build`, PR |
| 11:00 | Decide 6A vs 6B for the video | T6 numbers into the proof slide |
| 12:00 freeze | Record demo video (or render `video/`) | Record tech video |
| 12:00–15:00 | Submission package (PRD checklist) | Tech video upload |

## 7. Screen ≠ script (open items found on production, 04.10 ~06:40)

1. `/r/<NJ rule>` 404 for all 22 rule ids with ":" (FAIR Act, NJ fee cap, Hoboken rent) — fixed on main (#76), not on production.
2. J2 missing-fact box names the wrong facts on `/a/A0107` — fixed on main (#78), not on production.
3. Email footer placeholder "[PLACEHOLDER: HomeRule postal address — owner to fill in]".
4. No as-of control anywhere; `?as_of=` links from rule pages to address pages are ignored by the address page.
5. "No local rule — state basics only" label on tiles that describe a city rule (Boston/Cambridge eviction) or no rule at all ("…and no California rule either" on `/a/A0105`).
6. Newark rent tile headline is a hardship-increase ceiling.
7. Home search: "New York" gives no "not covered" answer (only `/where` does).
