# HomeRule demo video: story script

Private and not committed. Written Sun 04.10.2026, 08:05–08:45 CEST. This is the script only; the render format is being tested separately (`/Users/silvan/claude/code/tools/demo-video/examples/homerule-clip/`).

**Verified against:**
- **Production** https://yourhomerule.com, fetched read-only 08:05–08:25. RESUME says production is `f8c33fd`; the J2 fix and the NJ rule pages are live. Pages checked: `/`, `/a/A0016`, `/a/A0050`, `/a/A0107`, `/a/A0258`, `/a/A0012`, `/a/A0011`, `/changes/A0016`, `/changes/A0012`, `/r/CA-RENT-1947.12`, `/r/MA-ALG-2983`, `/r/NJ-ALG-56%3A9-23`, `/where?q=Austin, TX`, `/a/at?q=4801 E 3rd St…`, and the example-alert overlay on `/a/A0011`. No form was submitted and nothing was sent.
- **Verdict data**, from branch `s/verdict-preview` (PR #89, `web/data/changes.full.json` and `web/lib/changes/impact.ts`).
- **Repo files:** `notes/demo/DEMO.md`, `outputs/changes.json` and `docs/PRD.md` (J5 "Before I sign" is uncommitted on `s/j5-before-i-sign`).

**Narration speed:** 150 wpm, which is 2.5 words a second. Every time below is calculated from the word count plus 0.6 s between beats.

**Rules for every frame:**
- Keep the corner badge "Prototype · not legal advice".
- Speak the name as "Home Rule" and write it as "HomeRule" (storyboard decision 6).
- Personas are illustrative and the buildings are real sample addresses. Caption each persona's first frame "Illustrative renter · real sample address".
- Never compare a renter's increase to a cap, never write "legal" or "illegal", never use "compare" or a side-by-side view, never show a ranking or a protection map, and never show a rent price (PRD Never, J5).

## 0. Demo video, 60 s (submission)

**Music: v3 track a** (driving electronic, 125 bpm, chosen by Silvan 04.10.). **Voice: ElevenLabs Matilda** (`XrExE9yKIg1WjnnlVkGX`, chosen by Silvan 04.10.). Final render only after Silvan has tested the verdicts on production.

Added 04.10.2026 after the organizers' clarification (3 videos, max 1 min each; see `docs/VIDEO.md`). This is the version to render for the Demo slot. Sections 2b/2c below are the long cut, kept for the live demo and Q&A.

**Budget:** 103 spoken words (F) / 104 (C), ≈ 41 s of speech at 150 wpm, plus 0.6 s between beats and holds = **≈ 48 s**. That leaves ~10 s of slack for a slower ElevenLabs read; the hard cap stays 58 s.
**Opening:** the teaser v2 as built (`experiments/homerule-teaser/`), unchanged for D1–D4.
**Every frame:** corner badge "Prototype · not legal advice", captions on, persona captions "Illustrative renter · real sample address".

| # | Time | Address / URL | On screen | Narration (words) | Brief item |
|---|---|---|---|---|---|
| D1 | 0:00.5–0:06.9 | — (illustration) | Desk: two "for rent" slips (3515 Fillmore St, 36 Hoff St, no prices), unsigned lease, label "Illustration" | "Lena is about to sign a lease in San Francisco. Which rules come with each apartment?" (16) | The brief's question: which rules apply here today |
| D2 | 0:07.5–0:10.7 | `/a/A0016` 3515 Fillmore St | Recording: hero "Built 1926 · 21 units", scroll to the rent tile (city's yearly limit) | "Fillmore Street, built 1926: city rent control applies." (8) | Module B: jurisdiction stack, coverage from building facts |
| D3 | 0:11.3–0:14.5 | `/a/A0050` 36 Hoff St | Recording: hero "Built 1986 · 49 units", state-cap tile | "Hoff Street, built 1986: the state cap instead." (8) | Per-building answer, state vs city precedence |
| D4F | 0:15.1–0:17.9 | `/a/A0050` → Show the law | Verbatim § 1947.12 quote, "In effect since Apr 1, 2024 · Checked Oct 1, 2026" | "Quoted from the law, with its dates." (7) | Quoted span, citation, effective and as-of date |
| **D4C** (swap for D4F) | 0:15.1–0:18.3 | `/a/A0050` history | Timeline card "Jan 1, 2030 · Ends · ↓ Narrows renter protection" (`--variant C`) | "And the law ends that cap in 2030." (8) | Change tracking, renter impact. CONDITIONAL: only if the verdicts pass the 12:00 gate (§ 2) |
| D5 | 0:18.5–0:24.1 | `/a/A0107` 10635 Sherman Grove Ave | Rent tile "We're missing one fact", box naming the certificate-of-occupancy date and the Los Angeles Housing Department | "In Los Angeles, one fact is missing: HomeRule says unknown and names who knows." (14) | Unknown when a fact is missing; human contact (J2, J7) |
| D6 | 0:24.7–0:30.7 | `/a/A0258` 471 Columbia Rd (Dorchester → Boston) | Rent tile: "Massachusetts doesn't allow rent control… One bill is proposed; a bill is not law." plus chips "1 bill proposed, not law" and "1 measure failed or struck, not law". **Needs #96 on production** (merged to main, live after Silvan's next push); without it, cut "one measure failed" | "Boston: state law bars rent control. One bill pending, one measure failed: neither is law." (15) | Barred, pending and failed kept apart in one frame; T4, T5 |
| D7 | 0:31.3–0:37.3 | `/a/A0012` 1064 Summit Ave., Jersey City | Hero "Next change: Jul 1, 2027 — software that sets rents", software tile with "Possible overlap between state and city, flagged" | "Jersey City: a state rule starts July 2027. Overlap with the city rule: flagged, not decided." (15) | Not yet effective vs applies (T3); conflict flagged for human review |
| D8 | 0:37.9–0:41.5 | `/a/A0011` → "See an example alert" | Overlay "Preview — simulated, nothing is sent", cropped to the dialog | "An alert email tells renters when a rule changes." (9) | Change tracking for the renter (J4) |
| D9 | 0:42.1–0:48.0 | End card | Drawn logo on navy, "The law, for your exact address.", "yourhomerule.com · Prototype · not legal advice" | "Home Rule. The law, for your exact address. Not legal advice." (11) | Labelled not legal advice |

**Product intro and brand moments (Silvan, 04.10.; replaces the title sting after D1):**
- **D4b · Product intro, right after Lena's case (≈6 s):** navy, the roof logo draws in with the wordmark "HomeRule", then the site's hero line as a title. Narration: "HomeRule reads housing law and answers for one exact address: quoted, dated, honest when it doesn't know." (17 words). The viewer has just seen it work, now learns what it is.
- **Wipes D4b→D5, D5→D6, D6→D7 (≈0.5 s each):** navy wipe carrying the roof icon, the next city name riding in ("Los Angeles", "Boston", "Jersey City"): chapters of one product.
- **D9 end card = product + tagline:** the logo resolves from the last wipe, wordmark "HomeRule", tagline **"Your rights as a renter, for your exact address."** (the site hero and the PRD's line, so video and site say the same thing), "yourhomerule.com · Prototype · not legal advice". Narration: "HomeRule. Your rights as a renter, for your exact address. Not legal advice." (13, replaces D9's 11).
- Corner badge "Prototype · not legal advice" on app scenes only; hidden during the intro, wipes and end card.
- Totals: 103 + 17 + 2 = **122 words ≈ 49 s of speech, ≈ 56 s with pauses and wipes**, under the 58 s cap. No room left for a proof card; if the voice reads slow, cut D8 (alert) first.

### Final narration v3 (render source) — Silvan 04.10., supersedes the narration below

Order: problem hook → Lena (Fillmore, Hoff St) → product intro → Los Angeles (unknown) → Boston (barred, pending, failed) → **verdict scene** (↑ Newark 2027, ↓ Hoff St 2030, alert) → chatbot (spoken) → end card. **Cut vs. v2:** D4F ("Quoted from the law, with its dates.") and Jersey City D7. Voice **Matilda** (ElevenLabs), measured pace 165 wpm overall. Timings below with music **a** (driving electronic, hit on the cut after the hook); total **57.7 s** (b: 56.5 s, c: 57.5 s), 131 words, cap 58 s.

| # | Time (s) | Shot | Spoken (caption) | Words |
|---|---|---|---|---|
| 1 | 0.2–3.7 | Hook card on navy: STATE, CITY, BUILDING strata stack up on their words | "Housing law comes in layers: state, city, building." | 8 |
| 2 | 4.0–5.2 | …the roof mark lands on top, "Which ones protect you?" as type; cut on the music's hit | "Which ones protect you?" | 4 |
| 3 | 5.7–9.7 | Lena's desk (illustration): two "for rent" slips, unsigned lease | "Lena is about to sign a lease. Which rules come with each apartment?" | 13 |
| 4 | 10.0–14.3 | `/a/A0016` 3515 Fillmore St: hero "Built 1926 · 21 units" → rent tile | "Fillmore Street, built 1926: city rent control applies." | 8 |
| 5 | 14.8–18.8 | `/a/A0050` 36 Hoff St: hero "Built 1986" → state-cap tile | "Hoff Street, built 1986: the state cap instead." | 8 |
| 6 | 19.1–22.8 | Product intro on navy: logo draws in, "HomeRule", hero line | "HomeRule reads housing law, and answers for one exact address." | 11 |
| 7 | 23.7–28.9 | Wipe "Los Angeles" → `/a/A0107` rent tile → "What we don't know yet" | "In Los Angeles, one fact is missing: HomeRule says unknown and names who knows." | 15 |
| 8 | 30.0–37.1 | Wipe "Boston" → `/a/A0258` rent tile with "1 bill proposed, not law" + "1 measure failed or struck, not law" | "Boston: state law bars rent control. One bill pending, one measure failed: neither is law." | 15 |
| 9 | 37.9–42.4 | `/a/A0011` Newark history: Jul 1, 2027 FAIR Act, ↑ "This change adds renter protection" | "When the law changes, HomeRule says which way: this one adds protection," | 13 |
| 10 | 42.6–43.6 | `/a/A0050` Hoff St history: Jan 1, 2030 Ends, ↓ "This change narrows renter protection" | "this one narrows it." | 4 |
| 11 | 44.9–46.0 | `/changes/A0011` alert email preview with badge (topic line once #118 is live) | "And the alert tells you." | 5 |
| 12 | 47.4–51.8 | `/connect`: "Make your chatbot rent-law aware", connector URL | "Connect your favourite chatbot, so it answers from HomeRule's quoted, dated law." | 13 |
| 13 | 52.1–57.0 | End card: logo, "HomeRule", tagline, "yourhomerule.com · Prototype · not legal advice" | "HomeRule. Your rights as a renter, for your exact address. Not legal advice." | 14 |

Brief alignment v3: the T3 conflict flag ("overlap flagged, not decided", Jersey City) is no longer in the Demo video; it moves to the Teach video and the live demo. "What's coming" is carried by the verdict scene (Newark FAIR Act, Jul 1, 2027). Unknown (D5), barred/pending/failed (D6, T4/T5), quotes and dates (product intro + rule pages), change tracking with renter impact (verdict scene) and not-legal-advice (badge, end card) stay.

Render: `cd /Users/silvan/claude/code/tools/demo-video/experiments/homerule-demo60 && python3 render.py --variant v3 --voice audio/eleven_matilda --music <a|b|c> --out ../../out/homerule-demo60/demo_v3.mp4` — only after #117/#118 are live, the takes re-recorded (`node capture.mjs vup vdown vmail`) and Silvan has tested.

#### Superseded: Final narration (render source) v2
### Final narration (render source)

Rendered from `~/claude/code/tools/demo-video/experiments/homerule-demo60/` (`lines.json` = these lines, `render.py` = the timing). Times are from the Gemini placeholder cut (Achird); an ElevenLabs read shifts them, `render.py` re-plans from each take and refuses anything over 60 s. Spoken "Home Rule", captioned "HomeRule".

**Variant F** (live today; D6 fallback until #96 is on production) · 127 words · 57.4 s · `out/homerule-demo60/demo.mp4`

| # | Scene (start s) | Shot | Spoken |
|---|---|---|---|
| 1 | D1 · 0.0 | Desk illustration, two listings, unsigned lease | "Lena is about to sign a lease in San Francisco." |
| 2 | D1 | same | "Which rules come with each apartment?" |
| 3 | D2 · 5.7 | `/a/A0016` hero → rent tile | "Fillmore Street, built 1926: city rent control applies." |
| 4 | D3 · 11.0 | `/a/A0050` hero → rent tile | "Hoff Street, built 1986: the state cap instead." |
| 5 | D4F · 15.3 | `/a/A0050` Show the law, § 1947.12 quote + dates | "Quoted from the law, with its dates." |
| 6 | D4b · 17.6 | Navy: roof logo draws, "HomeRule", hero line | "Home Rule reads housing law and answers for one exact address: quoted, dated, honest when it doesn't know." |
| — | wipe · 25.3 | navy wipe, roof icon, "Los Angeles" | — |
| 7 | D5 · 25.3 | `/a/A0107` rent tile → "What we don't know yet" | "In Los Angeles, one fact is missing: Home Rule says unknown and names who knows." |
| — | wipe · 32.0 | "Boston" | — |
| 8 | D6 · 32.0 | `/a/A0258` hero (Dorchester → Boston) → rent tile | fallback: "Boston: state law bars rent control. One bill is pending, and a bill is not law." · after #96 is live (`--d6 full`, re-record `bos`): "Boston: state law bars rent control. One bill pending, one measure failed: neither is law." |
| — | wipe · 38.2 | "Jersey City" | — |
| 9 | D7 · 38.2 | `/a/A0012` hero "Next change: Jul 1, 2027" → software tile, overlap flag | "Jersey City: a state rule starts July 2027. Overlap with the city rule: flagged, not decided." |
| 10 | D8 · 45.8 | `/a/A0011` "See an example alert" overlay (simulated preview) | "An alert email tells renters when a rule changes." |
| — | D8b · 50.1 | `/connect`: "Make your chatbot rent-law aware", connector URL, Claude/ChatGPT/Developers tabs, 2.2 s, no interaction | silent, under the music (see note) |
| 11 | D9 · 52.3 | End card: logo, "HomeRule", tagline, yourhomerule.com · Prototype · not legal advice | "Home Rule. Your rights as a renter, for your exact address. Not legal advice." |

**Variant C** (the "good or bad for renters" story; D8C replaces D4C and D8, per Silvan 04.10.) · 130 words · 58.0 s (58.5 s with the full D6; over the 58 s aim, under the 60 s cap) · `out/homerule-demo60/demo_C.mp4`. To fit 58 s it uses the short D1 and D4b lines; the verdict beat is never shortened.

| # | Scene (start s) | Shot | Spoken |
|---|---|---|---|
| 1 | D1 · 0.0 | Desk illustration | "Lena is about to sign a lease. Which rules come with each apartment?" |
| 2–4 | D2, D3, D4F · 4.3–16.2 | as F | as F lines 3–5 |
| 5 | D4b · 16.2 | Navy product intro | "Home Rule reads housing law, and answers for one exact address." |
| 6–8 | D5, D6, D7 with wipes · 20.5–41.0 | as F | as F lines 7–9 |
| 9 | D8C · 41.0 | Newark `/a/A0011` history: Jul 1, 2027, FAIR Act, green ↑ "This change adds renter protection" | "When the law changes, Home Rule says which way: this one adds protection," |
| 10 | D8C · 45.8 | Hoff St `/a/A0050` history: "Jan 1, 2030 · Ends", red ↓ "This change narrows renter protection" | "this one narrows it." |
| 11 | D8C · 48.1 | The alert email with its ↑ badge | "And the alert tells you." |
| — | D8b · 50.7 | `/connect`, 2.2 s | silent |
| 12 | D9 · 52.9 | End card | as F line 11 |

**D8b, chatbot connector (Silvan 04.10.):** the line "Or ask your chatbot." (4 words) is built (`--connect voice`) but off: with it, variant C runs 58.3 s, over the 58 s aim (F: 57.7 s). Per the rule it stays silent in both variants. `/connect` is not on production yet (PR #98 on main): the shot was recorded from main locally. **Re-record after the production push** (`node capture.mjs connect`).

D8C shots are **placeholder cards** (labelled PLACEHOLDER in the render) until the verdict UI (#59/#71/#72/#77 + `PAGE_BADGES`) is on production; then record them from the site and re-render.

If the read runs long, drop D8 first (−4.2 s), then shorten D1 to "Lena is about to sign a lease. Which rules come with each apartment?" (−0.8 s).
Checked against the Never list: no legal/illegal, no rent-vs-cap comparison (D2 names the city rule, not a number against the renter's rent), no ranking, no rent price, no "compare". Numbers spoken: years only (1926, 1986, 2027, 2030), all on the pages.

## 1. Story spine

Ana has a rent-increase letter in her hand. Lena has two listings and a lease she hasn't signed yet. Both need the brief's one question answered: which rules apply to this building, today and next?

The turn is that housing law is layered and dated. The answer changes from building to building in the same city: city rent control covers Ana's 1926 building on Fillmore St, and only the state cap covers 36 Hoff St, built 1986. The answer also changes over time: the state cap's own text ends it on January 1, 2030.

The payoff: HomeRule reads the law once and lets code decide for each building. It quotes and dates every line, and it says what it doesn't know and who can tell you. A renter, a Boston organizer and a Jersey City landlord each get the rules for their building with a source they can check. **CONDITIONAL:** they also get a plain mark showing whether a change adds or narrows renter protection. The decision always stays theirs.

## 2. Variants

### Decision gate for the CONDITIONAL beats (at the 12:00 freeze, on the frozen production deploy)

Render version **C** only if every check below passes on production. Otherwise render **F**. The swap touches four lines and nothing else moves: B4C is dropped, B5 becomes B5F, B9C becomes B9F, and T3C becomes T3F.

1. The verdict data is merged: #59, plus #53 or #59 rebased without it. Then #71, #72 and #77 are merged, `make build` has run, `PAGE_BADGES = true`, and production has been updated. Today #53 is on hold and #59 is stacked on it (issue #87, RESUME).
2. `/a/A0050` (36 Hoff St) shows "Ends:" on Jan 1, 2030 with ↓ "Narrows renter protection". `/a/A0016` (3515 Fillmore St) shows **no** "Ends:" entry.
3. The example alert on `/a/A0011` shows ↑ "This change adds renter protection". If it doesn't, drop only the B9C line and use B9F.
4. The 15-badge hand check from PR #72 is done with at most one wrong badge.
5. `make eval` after the final build still shows T1–T5 exact. Re-read the proof-card numbers.

### 2a. Teaser (15–20 s, social or opening)

A single renter at a real moment: Lena, before she signs. The two buildings are cut one after the other, full frame. Never use a split screen, because that would visually claim a compare view.

| # | Time | Renter | Address · URL | On screen | Narration (words) | Proves |
|---|---|---|---|---|---|---|
| T0 | 0:00–0:04 | Lena, moving to SF (illustrative) | — | Illustration, not a montage: two listing slips reading "3515 Fillmore St" and "36 Hoff St", **no prices**, next to a lease with an empty signature line. Small label "Illustration". | "Lena is about to sign a lease in San Francisco." (10) | Renters are the audience; this is a real moment |
| T1 | 0:04–0:08 | Lena | `/a/A0016` | Hero "Built 1926 · 21 units", then the rent tile "There's a rule · The city's yearly limit for rent-controlled units is 1.6% (Mar 2026–Feb 2027)…" | "Fillmore Street, built 1926: city rent control applies." (8) | Module B: coverage per building |
| T2 | 0:08–0:12 | Lena | `/a/A0050` | Hard cut. Hero "Built 1986 · 49 units", then the rent tile "California limits yearly rent increases to 5% plus inflation, never more than 10%." | "Hoff Street, built 1986: the state cap instead." (8) | Same city, different answer |
| **T3C** CONDITIONAL | 0:12–0:15 | Lena | `/a/A0050` Coming up | Timeline marker on Jan 1, 2030: ↓ red, "Narrows renter protection · Ends: California limits yearly rent increases…" [assumed: built from code in `s/verdict-preview`; the preview is behind Vercel SSO, so not seen rendered] | "And the law ends that cap in 2030." (8) | Change tracking extended to end dates; renter impact |
| T3F fallback | 0:12–0:15 | Lena | `/a/A0050` → Show the law | The verbatim § 1947.12 quote, plus "In effect since Apr 1, 2024 · Checked Oct 1, 2026" | "Quoted from the law, with its dates." (7) | Citation, quoted span, dates |
| T4 | 0:15–0:20 | — | End card | "Your rights as a renter, for your exact address." · "yourhomerule.com · Not legal advice" | "Home Rule. The law, for your exact address." (8) | Labelled not legal advice |

Totals: C is 42 words, about 19.7 s. F is 41 words, about 19.3 s.

### 2b. Full film, version C (CONDITIONAL beats in bold, ~119 s, 259 words)

| # | Time | Renter / audience | Address · URL | On screen (verified unless tagged) | Narration (words) | Proves |
|---|---|---|---|---|---|---|
| B0 | 0:00–0:06 | Ana, renter (illustrative) | 3515 Fillmore St, SF | Illustration, not a montage: a rent-increase letter on a kitchen table with the address line legible. **No amount and no landlord name.** Then her thumb over a search box. | "Ana's rent is going up. Her first question: which rules apply to her building?" (14) | The brief's question: "which rules apply here today" |
| B1 | 0:06–0:09 | — | — | Title card "HomeRule · Housing law, quoted and dated, for your exact address." | — | — |
| B2 | 0:09–0:24 | Ana | `/` → type "3515 Fill" → suggestion → `/a/A0016` → **Rent increases** → **Show the law** | Hero: "California › San Francisco County › San Francisco · Inside San Francisco city limits — city and state rules apply · Built 1926 · 21 units · Building facts from DataSF wv5m-vpq2 (2025 roll)". Tile: "The city's yearly limit for rent-controlled units is 1.6% (Mar 2026–Feb 2027)… The Rent Board can check your notice." Open: "Your unit may differ." · "Talk to someone first: San Francisco Rent Board … Number not yet checked by us". Show the law: "State of California's rule (Cal. Civ. Code § 1947.12) is replaced here by the city rule", both verbatim quotes, "In effect since Mar 1, 2026 · Checked Oct 1, 2026". Header "Law as of Oct 1, 2026". | "San Francisco, built 1926, 21 units. The city rule applies: 1.6 percent a year for rent-controlled units. The state cap steps back: the building predates 1979. The Rent Board can check her notice." (33) | Module B (state/county/city stack; precedence, the state rule superseded); quote, citation, retrieval date and as-of date; plain English; public data; J1 and J7 (a person first) |
| B3 | 0:24–0:38 | Lena, about to sign (illustrative) | `/a/A0016` (hero, 2 s) → `/a/A0050` 36 Hoff St | 1 s caption card "Lena · two listings · before she signs". Fillmore hero "Built 1926", then a hard cut to the Hoff hero "Built 1986 · 49 units". Rent tile "There's a rule · California limits yearly rent increases to 5% plus inflation, never more than 10%. Some buildings are exempt." Open: "The state cap covers many apartments built more than 15 years ago… Your unit may differ." | "Lena is about to sign a lease. She checks two listings. Fillmore Street: city rent control. Hoff Street, built 1986: the state cap, 5 percent plus inflation, at most 10." (30) | Module B coverage from building facts; J5 step 1, one address at a time |
| **B4C** | 0:38–0:50 | Lena | `/a/A0050` → Coming up | [assumed, from `s/verdict-preview` code and data] Timeline with a legend. **Jan 1, 2030:** red ↓ marker and card edge, "Narrows renter protection · Rent increases · Ends: California limits yearly rent increases to 5% plus inflation…". **Jan 1, 2026** (recently changed): green ↑ "Adds renter protection · Application fees". Optional 1 s cut to `/a/A0016` Coming up, which has no "Ends:" entry. | "Hoff Street's timeline marks changes: green adds renter protection, red narrows it. The state cap ends January 1, 2030: red. Fillmore has no end date. Lena decides." (27) | Beyond the brief: renter impact per change, and Module C extended to repeal dates (§ 1947.12(o) is in the corpus); J5 step 2 |
| B5 | 0:50–0:59 | Judges, advocates | `/r/CA-RENT-1947.12?from=A0050` → Audit trail | "The model reads the law; code decides who it covers. The line between them stays visible." On the left, "Extracted by the model": Category · Key value "5% plus the percentage change in the cost of living, capped at 10%" · "Quote found in source: yes" · "Confidence 90%". In the middle, the **reasoning boundary**. On the right, "Decided by code": "Deterministic: same rules, facts and date give the same answer" · "Dates: in force from 2024-04-01 until 2030-01-01" · "a missing fact gives 'unknown', never a guess". Also "Document D024, retrieved Oct 1, 2026". | "Behind both answers is one rule, read once. The model extracted it. Code decided, building by building: same facts, same answer." (21) | Module A (structured record, quoted span, confidence); the audit-view stretch goal (source, retrieval date, as-of date, reasoning boundary); a log another person can reproduce |
| B6 | 0:59–1:10 | Marco, renter (illustrative) | `/a/A0107` 10635 Sherman Grove Ave, Los Angeles | "Built 1978 · 20 units · LA County eGIS parcels". At a glance: "For 1 topic, we're missing one fact". The rent tile reads "We're missing one fact". Box: "When the city first approved the building for living in. Built in 1978. The rule depends on whether the city first approved it on or before October 1, 1978, and the year alone can't tell. Los Angeles Housing Department or your landlord can tell you: ask for the certificate-of-occupancy date." Then "Talk to someone first: Los Angeles Housing Department". **Frame the first fact only.** | "Marco's building in Los Angeles is from 1978, right at the rent control cutoff. HomeRule doesn't guess. It names the missing fact, and who can tell him." (27) | Unknown when a fact is missing (Module B); J2 and J7 |
| B7 | 1:10–1:25 | Tenant organizer, Boston (advocate) | `/a/A0258` 471 Columbia Rd → rent tile → Coming up → `/r/MA-ALG-2983?from=A0258` | Hero: "The mailing address says Dorchester, but the building is inside the City of Boston. Boston law applies." Tile: "Massachusetts doesn't allow rent control, so there's no city limit on increases… a bill is not law." Quote from ch. 40P § 4: "No city or town may enact, maintain or enforce rent control of any kind…". Coming up: "Proposed, not law · They change nothing unless they pass" with S.2983 and H.5222. Rule page: "Proposed, not law · All 110 sample addresses in Massachusetts · 110 pending, not law" with the dot map. Audit: "a bill, not law, so it never covers an address yet". | "A tenant organizer in Boston: the mail says Dorchester, the law says Boston, where rent control is barred. Two pending bills would reach all 110 Massachusetts sample buildings, each marked proposed, not law." (33) | Mailing city vs legal city; T4 (pending, 110); T5 (no cap); enacted and pending kept apart; J6; advocates and agencies |
| B8 | 1:25–1:41 | Small landlord, Jersey City (housing provider, illustrative) | `/a/A0012` 1064 Summit Ave. → Recently changed → Software tile → Show the law → `/r/NJ-ALG-56%3A9-23` (2 s) | Hero: "Next change: Jul 1, 2027 — software that sets rents" · "Built 1900 · 6 units". History: "Oct 15, 2025 · In Jersey City, a rent increase must come with a sworn statement that no rent-setting software was used · Jersey City Code § 218-12.3(a)". Tile: "Jersey City bans landlords from paying for rent-setting services · New state rule from Jul 1, 2027 · Possible overlap between state and city, flagged". Box: "Possible overlap, not decided … HomeRule shows both sources and flags it for review; it doesn't decide which one governs." Rule page: "Enacted, not yet in force · 140 not yet in force · 90 with a conflict flag · Jersey City, Hoboken and Newark". Footer: "…is not a compliance certification." **Do not open the Rent tile.** | "A small landlord in Jersey City, before a renewal: an increase here needs a sworn statement that no rent-setting software was used. A state law from July 2027 may overlap. HomeRule flags it, and doesn't decide." (36) | Housing providers ("understand obligations before acting"); T3 (not yet effective, conflict flagged, 140 and 90); T2 (90 flags fall only on Jersey City and Hoboken); conflicts sent to a human |
| **B9C** | 1:41–1:49 | Newark renter (alerts) | `/a/A0011` 834-836 Raymond Blvd → "See an example alert" | Overlay (verified today): "Example alert for this address · Preview — simulated, nothing is sent · Subject: Something changes for your rent rules at 834-836 Raymond Blvd". With the verdicts [assumed in the overlay; data verified]: ↑ "This change adds renter protection", why "A ban on rent-setting software now covers this home (N.J. Stat. Ann. § 56:9-23(e))". **Crop to the dialog.** | "In Newark, with no city rule found, the alert marks that state law green: it adds protection." (17) | T2 seen from the renter's side (Jersey City has its own ban, so no mark; Newark has none, so ↑); J4; Module C reaches the renter |
| B10 | 1:49–1:54 | Judges | Proof card (local HTML clip, like `proof.html`) | "500/500 sample addresses resolved · 38 mailing cities ≠ legal city · T1 250 · T2 90 · T3 140 + 90 conflict flags · T4 110 pending · T5 0 · all equal to the expected sets (`make eval`) · 26/27 named rules". Source line: "make eval, 04.10.2026". | "All 500 sample addresses resolved. Every supplied change test matches." (10) | T1–T5; Module C; Module B coverage |
| B11 | 1:54–2:00 | All three audiences | End card | "Your rights as a renter, for your exact address." · "yourhomerule.com · Hack-Nation 7 · RealPage challenge · Not legal advice" | "Home Rule. Your rights as a renter, for your exact address." (11) | Labelled not legal advice |

If the TTS runs long, cut B10's spoken line first (the card can be read) and B9C second.

### 2c. Full film, version F (fallback: verdicts not live, ~110 s, 237 words)

Same as C with three changes. B4C is removed. B5 becomes B5F. B9C becomes B9F. After B5F, every time shifts 12 s earlier.

| # | Time | Address · URL | On screen | Narration (words) | Proves |
|---|---|---|---|---|---|
| B5F | 0:38–0:50 | `/r/CA-RENT-1947.12?from=A0050` → Audit trail | As B5, but hold 2 s on "Dates: in force from 2024-04-01 until 2030-01-01" | "Behind both answers is one rule, read once, end date included: January 1, 2030. The model extracted it. Code decided, building by building: same facts, same answer." (27) | Module A; audit view; end date as a fact, with no verdict |
| B9F | 1:32–1:40 | `/a/A0012` → "See an example alert" | Overlay "Preview — simulated, nothing is sent", item "Software that sets rents — From Jul 1, 2027…". Crop the footer. | "When a rule at an address changes, the alert email says what changes, and from when." (16) | J4; Module C reaches the renter |

In F, never show Hoff St's **Coming up** while 2030 is being spoken. Production says "No change is scheduled for this address as of Oct 1, 2026" there.

## 3. Vignettes (real sample addresses; personas illustrative)

### 3.1 Ana: the letter (J1, J7) · 3515 Fillmore St, San Francisco · `/a/A0016`
- **Moment:** a rent-increase letter. Her question is which rules apply to her building, not whether the increase is allowed.
- **What HomeRule shows (verified):**
  - "Built 1926 · 21 units" (DataSF).
  - The city rule applies: "The city's yearly limit for rent-controlled units is 1.6% (Mar 2026–Feb 2027)". The state cap (§ 1947.12) is "replaced here by the city rule".
  - The reason: "built 1926 … before the June 13, 1979 cutoff".
- **Why it matters to her:** she learns which body of law governs her unit and who checks a notice, before she answers her landlord.
- **Next step on screen:** "Talk to someone first: San Francisco Rent Board", plus "Before you call, have ready: notice, lease, move-in date".
- **Guardrail:** no verdict on her notice. "The Rent Board can check your notice" and "Your unit may differ".
- **Backup:** `/a/A0215` 2295 California St (DEMO.md, same tiles).

### 3.2 Lena: before I sign (J5 as it exists today) · 3515 Fillmore St `/a/A0016` and 36 Hoff St `/a/A0050`
- **Moment:** moving to San Francisco, with two listings and no lease signed yet.
- **What HomeRule shows (verified):**
  - She looks up one address at a time.
  - Fillmore, built 1926: the city rule applies.
  - Hoff St, built 1986, 49 units: "California limits yearly rent increases to 5% plus inflation, never more than 10%."
  - The rule page for § 1947.12 shows "in force from 2024-04-01 until 2030-01-01".
- **CONDITIONAL:**
  - Hoff St's timeline shows "Ends" on Jan 1, 2030 with ↓ "Narrows renter protection". The data has verdict `worse` with the why "A 10% yearly rent increase cap no longer covers this home (Cal. Civ. Code § 1947.12)".
  - At Fillmore the same end is `unchanged` ("San Francisco Rent Ordinance § 37.3 already gives this protection"), so there is no mark.
  - Backup listing with the same ↓: 145 Taylor St `/a/A0081` (2005, 69 units, a home-page chip).
- **Why it matters to her:** the protections come with the building, not the city. She sees them before signing, while she can still choose.
- **Guardrail:**
  - No "compare", no side-by-side, no "safer" or "better" apartment, no rent prices, no neighbourhood view (PRD Never: a landlord could find the least-protected buildings).
  - She draws her own conclusion.
- **Optional, for the live demo or Q&A only (not in the film):** a listing outside the 500. `/a/at?q=4801 E 3rd St, Los Angeles, CA` was verified today (Census answered in 0.6 s):
  - "The postal address says Los Angeles, but this spot is outside the City of Los Angeles: it is unincorporated Los Angeles County. City of Los Angeles rules don't apply here. Los Angeles County's own rent and eviction rules apply here; they aren't in HomeRule."
  - "Typed address: we have no property record for it, so building facts are unknown."
  - It is in LA, not SF, so it is not Lena's third listing. I didn't put an arbitrary private SF address on camera.
  - Stay on the hero there: its rent tile says "We're missing one fact" while listing four facts.

### 3.3 Marco: the honest unknown (J2, J7) · 10635 Sherman Grove Ave, Los Angeles · `/a/A0107`
- **Moment:** a rent increase in a building from 1978.
- **What HomeRule shows (verified):**
  - "We're missing one fact".
  - "LA rent control generally covers buildings first built on or before Oct 1, 1978".
  - The box names the fact: "ask for the certificate-of-occupancy date", and who knows it: "Los Angeles Housing Department or your landlord".
- **Why it matters to him:** one document settles it, and he knows whom to ask. A guess either way could mislead him.
- **Guardrail:** unknown is shown as an answer, never hidden.
- **Don't show:** the second line "Whether the owner lives in the building" or the "Ask your landlord: whether the owner lives here" helper (issue #81).
- **Backup:** `/a/A0432` 14605 Rayen St (DEMO.md).

### 3.4 Tenant organizer in Boston: which buildings does this bill reach? (J6, advocates and agencies) · 471 Columbia Rd `/a/A0258` → `/r/MA-ALG-2983`
- **Moment:** planning a campaign on rent-setting software.
- **What HomeRule shows (verified):**
  - "The mailing address says Dorchester, but the building is inside the City of Boston."
  - Massachusetts bars rent control (ch. 40P § 4, quoted), so no cap appears.
  - S.2983 and H.5222 are listed as "Proposed, not law".
  - The S.2983 rule page reads "110 pending, not law", with a dot map and an audit line: "a bill, not law, so it never covers an address yet".
- **Agency extension (verified):** `/r/NJ-ALG-56%3A9-23` (NJ FAIR Act) shows "Enacted, not yet in force · 140 not yet in force · 90 with a conflict flag · Jersey City, Hoboken and Newark". This is a state housing agency's view of where an enacted law will land and where it may collide with city bans.
- **Why it matters:** an exact list of affected buildings, with pending bills never counted as law.
- **Guardrail:** it is a per-rule list, with no ranking of buildings by protection.
- **Backup:** `/a/A0048` 1619 Commonwealth Av ("Brighton").

### 3.5 Small landlord in Jersey City: obligations before acting (housing provider) · a six-unit building like 1064 Summit Ave. · `/a/A0012`
- **Moment:** before sending a renewal or rent increase, with no legal staff.
- **What HomeRule shows (verified):**
  - Since Oct 15, 2025: "a rent increase must come with a sworn statement that no rent-setting software was used" (Jersey City Code § 218-12.3(a)).
  - Since Jun 10, 2025: the city ban on paying for rent-setting services (§ 218-12(2)(a)).
  - The NJ application-fee cap of $50 since May 1, 2026, and the deposit limit of 1.5 months' rent.
  - The state law from Jul 1, 2027, with "Possible overlap, not decided".
- **Why it matters:** the same page renters use lists the duties, quoted and dated, before the landlord acts.
- **Guardrail:** on screen, "It does not tell anyone what to do and is not a compliance certification". The persona is not the building's owner; caption it as illustrative.
- **Don't open:** the Rent tile, whose line reads "You can file a petition if you think your rent is illegal" (see Risks).

The film also uses a Newark renter for the alert beat (`/a/A0011`). It is a single shot, not a vignette.

## 4. Brief alignment

C is the full film with verdicts, F is the fallback, and T is the teaser.

| Brief item | Where shown | Status |
|---|---|---|
| 60 s Demo cut (section 0) vs the full film | Drops: the audit trail and reasoning boundary (B5), the bill's reach over 110 Massachusetts buildings (B7, J6), the Jersey City landlord as housing-provider audience and the 140 / 90 counts (B8), the proof card with T1–T5 counts (B10) | Moved, not lost: extraction, audit trail and `make eval` T1–T5 → Teach video (#95); provider angle and J6 reach → method note and Q&A. The Demo video names renters only, so the provider audience must be visible in the Teach video or the method note |
| Module A: one structured record per rule (category, requirement, coverage, exemptions, effective date, status, citation, quoted span) | B5 / B5F audit trail; B2 Show the law | Shown. **Penalty is not shown**: the field isn't on the rule page |
| Module A: extraction automated, not hand-coded | B5 ("Extracted by the model", "Quote found in source: yes") | Partly. The real proof (hour-16 ingest, live `make rerun`) belongs to the tech video and has not run end to end on production (GAPS #6) |
| Module B: address → legal jurisdiction stack | B2 (State › County › City), B7 (Dorchester → Boston) | Shown |
| Module B: every applicable rule | B2 (six tiles, "There's a rule for each of the 6 topics") | Shown at a glance; only rent and software are opened |
| Module B: unknown when a fact is missing | B6 | Shown |
| Module C: supplied change cases and affected addresses | B7 (T4, 110), B8 (T3, 140/90), B10 (all five) | Shown |
| Module C: as-of-date query | Header "Law as of Oct 1, 2026"; change log "Between October 1, 2026 and July 2, 2027"; C: B4C end date | **Gap.** There is no date control and one published date (GAPS #14). Only the change log stands in |
| Stretch: plain-language view in English | Every app beat | Shown |
| Stretch: plain-language view in Spanish | — | **Not built, not shown, never claimed** |
| Stretch: confidence indicator | B2 ("Confidence: low/medium" on the rows), B5 ("Confidence 90%") | Shown |
| Stretch: conflict flag | B8 ("Possible overlap, not decided", "90 with a conflict flag") | Shown |
| Stretch: extend to a new jurisdiction | — | **Not shown.** Santa Ana is in the original scope, and hour 16 is a new document for Cambridge, not a new jurisdiction |
| Stretch: audit view (source, retrieval date, as-of date, reasoning boundary) | B5 / B5F | Shown |
| Strong submission: source document, quoted span, retrieval date, as-of date for every answer | B2, B5 ("D024, retrieved Oct 1, 2026"; "Checked Oct 1, 2026"; "Law as of Oct 1, 2026") | Shown |
| Strong submission: enacted, pending, not yet effective, failed | Enacted (B2), pending (B7), not yet effective (B8) | **Partly. "Failed" is not visible:** the struck MA ballot question shows only as the absence of a cap. It appears on screen only as "T5 0" on the proof card |
| Strong submission: unknown when a fact is missing | B6 | Shown |
| Strong submission: conflicts flagged for human review | B8 | Shown |
| Strong submission: audit log someone can reproduce | B5 ("Deterministic: same rules, facts and date give the same answer") | Shown as a claim on screen. The log itself (`audit/calls.jsonl`, byte-identical rebuild) is for the tech video |
| T1: CA AB 325 / SB 763, not yet effective on 2025-12-31, applies on 2026-01-02 | B10 (T1 250) | Card only. Optional 3 s insert: `/changes/A0016` "Between December 31, 2025 and January 2, 2026 · California AB 325 / SB 763 takes effect · Before: Enacted, not yet in effect → now: Applies" (verified) |
| T2: Hoboken and Jersey City bans apply only inside those cities, not Newark | B8 (Jersey City ban; 90 flags), C: B9C (Newark ↑, Jersey City no mark), B10 | Shown indirectly. In F, only the card and the 90 flags carry it |
| T3: NJ FAIR Act not yet effective on 2026-10-01, applies 2027-07-02, conflicts flagged | B8 | Shown |
| T4: MA S.2983 and H.5222 pending, with affected addresses | B7 | Shown |
| T5: no rent cap in Boston or Cambridge, empty set | B7 (no cap), B10 (0) | Shown as an absence |
| Must not: legal advice or compliance certification | Banner on every frame, corner badge, B8 footer, B11 | Shown; narration checked line by line (section 5) |
| Must not: invent rules or citations | B5 ("the quote must appear word for word"), B7 (no cap is invented) | Shown |
| Must not: non-public data | B2, B3, B6 show the data sources (DataSF, LA County eGIS, NJOGIS) | Shown |
| Must not: scraping against site terms | — | Not shown (method note) |
| Label every interface "not legal advice" | Banner, header and footer on every page | Shown |
| Audience: renters | Ana, Lena, Marco, the Newark renter | Shown |
| Audience: advocates and agencies | B7 (organizer); the FAIR Act map in B8 (agency) | Shown |
| Audience: housing providers | B8 | Shown |
| "Address precision: a mailing city is not always the legal city" | B7 | Shown |
| "Changing law: effective-date changes, pending bills, failed ballot question" | B8, B7, B10; C: B4C (end date) | The failed ballot question shows only as an absence |
| Six rule categories | B2 "At a glance" (six tiles) | Only rent and software are opened. Deposits, fees, screening and just cause are not narrated |
| Hour 16 (T6) and the live rerun | — | Not in this film. Tech video (PRODUCT-REVIEW §4) |

## 5. Risks

Each risk is a claim or screen that production doesn't fully support today, with the safe wording.

| # | Claim or screen | Problem | Safe wording or action |
|---|---|---|---|
| 1 | "The state cap ends January 1, 2030" | True per § 1947.12(o) in the corpus. On production it shows only on the rule page ("in force from 2024-04-01 until 2030-01-01"). Hoff St's Coming up says "No change is scheduled" | In F, say it only over the rule page (B5F). Never over Hoff St's Coming up. No predictions ("unless extended") |
| 2 | "red, narrows renter protection" (B4C, T3C) | **CONDITIONAL.** It is blocked on #53/#59 (#53 on hold), and the 15-badge hand check is not done. Verdicts are per topic, and the CA just-cause end never gets ↓ (PR #89) | Use only after the decision gate. Never say "HomeRule flags every protection that ends" and never mention just cause. Don't read the why aloud: "A 10% yearly rent increase cap…" simplifies "5% plus inflation, max 10%" |
| 3 | "Fillmore has no end date" | [assumed] from #77's rule (no "Ends" where the state rule is replaced) and the preview data (`unchanged`). Not seen rendered | Check `/a/A0016` on the frozen deploy. If an "Ends" entry shows, cut the sentence |
| 4 | Newark alert "marked green" (B9C) | The verdict data is verified (`better`). That the example overlay renders the badge is [assumed] | If there is no badge in the overlay, try `/changes/A0011` "Alert email preview"; otherwise use B9F |
| 5 | Lena's two listings | J5 compare isn't built; Never forbids ranking and protection maps | Sequential full-frame cuts only. Never "compare", "better", "safer" or "more protected". Listing cards carry **no rent prices**. End on "Lena decides" |
| 6 | "All 500 sample addresses resolved" | Fine as worded. "All 500 in their legal city" (the earlier film) overstates it: 8 were placed from the postal city without Census confirmation (ARCHITECTURE B) | Keep "resolved" |
| 7 | "Every supplied change test matches" | Verified on main (`make eval` 06:30; I checked `outputs/changes.json` counts 250/90/140+90/110/0). Merging #53/#59 changes the scored lookups (RESUME: applies 4240→4004) | Re-run `make eval` after the final build. If any test differs, say "the five change tests, with their counts" and drop "matches" |
| 8 | Jersey City Rent tile | Production line: "You can file a petition if you think your rent is illegal." This uses "illegal", which is on the PRD Never list | Don't open or zoom it. Finding for Silvan: a one-line PLAIN wording fix, outside this task |
| 9 | FAIR Act plain line "landlords can't use software that sets rents in New Jersey" | The quoted text is narrower ("any person to perform a coordinating function"). The sponsor (RealPage) sells rent-setting software | Narration says only "a state law from July 2027 may overlap". Don't read the plain line aloud; keep the tone neutral |
| 10 | `/r/MA-ALG-2983` header | The chip reads "State law" above "Proposed, not law" | Frame from "Proposed, not law" downward; the narration says "bills" |
| 11 | A0258 Show the law | The H.3744 title is cut off ("…tenant eviction pro", GAPS #16); the Eviction tile label is wrong (GAPS #11) | Crop below the ch. 40P quote. Don't open Eviction |
| 12 | A0107 box | The second fact, "Whether the owner lives in the building", and the "Ask your landlord" helper come from issue #81 | Frame the first fact; don't click the helper |
| 13 | SF city row "Confidence: low" | A judge may ask | Q&A: "The source is the Rent Board's annual notice, not the ordinance text, so we mark it low." |
| 14 | Email frames | The footer shows "[PLACEHOLDER: HomeRule postal address — owner to fill in]" (GAPS #7) | Crop it out, or fix it first |
| 15 | Newark overlay background | The Newark rent tile behind the dialog reads "must not grant an increase exceeding 25%" (GAPS #10) | Scroll first and crop to the dialog |
| 16 | Alerts | The signup is a closed test: only allowed inboxes get mail | Never "anyone can sign up" or "sign up today". Say what the email contains, over the "Preview — simulated, nothing is sent" overlay |
| 17 | Personas at real buildings | Viewers may think Ana, Lena, Marco or the landlord are real tenants or owners | Caption "Illustrative renter · real sample address". No owner names. The landlord is "a small landlord", not this building's owner |
| 18 | Ana's letter | Inviting a cap comparison breaks a PRD Never rule | No amount on the letter, no "Is that legal?", no "too high". The narration states the city limit as a fact and names who checks the notice |
| 19 | Chatbot lines | DEMO's "A chatbot answers per city. The law answers per building." is a comparative claim. The scoreboard has search-enabled chat at 20/20 | Dropped. Lena's two buildings make the per-building point without a comparison. Never "9/20" |
| 20 | T5 "struck ballot question" | Nothing on screen says it | Keep it to the proof card ("T5 0"). Narration: "rent control is barred" (ch. 40P is quoted on screen) |
| 21 | "1.6 percent a year" | The period is Mar 2026–Feb 2027 and it applies to rent-controlled units | The narration says "for rent-controlled units". "Your unit may differ" stays in frame |
| 22 | Production drift before 12:00 | The verdict stack and the redesigned history column (#89) change selectors and the layout | Re-walk every URL on the frozen deploy before capture. Check the `script.json` selectors (`#t-rent`, `p.nxt`, the history markup) |
| 23 | Off-sample address (`/a/at?q=…`) | It depends on Census live (8 s timeout, one retry), and its tile says "one fact" while listing four | Live demo or Q&A only. Pre-load it and stay on the hero |
| 24 | Spanish, new jurisdiction, hour 16 | Not built, or not in this film | Never say "in Spanish", "any city" or "works anywhere". Scalability belongs to the tech video |

**Note for the render agent:** `examples/homerule-clip/script.json` still opens with the copy-paste `hook.montage`, which was rejected. Replace it with T0 (Lena's illustrated card, through `hook.clip` from a local HTML page) or B0 (Ana's letter), and drop `montage`.
