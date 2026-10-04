# HomeRule PRD

**Your rights as a renter, for your exact address.**
Demo headline: *A model has a training cutoff. A law has an effective date.*

The master document for scope, priorities and owners. The brief wins on rules; the how lives in [ARCHITECTURE.md](ARCHITECTURE.md). Updated Sun 04.10.2026 ~08:15 CEST (feature status checked against `origin/main` 66ad2d3, `origin/production` f8c33fd, open PRs and the live site). Submission 15:00 CEST, freeze 12:00.

## In one minute

- **What:** enter an address and see which housing rules apply there today and what is about to change: quoted, dated, with "unknown" where the data can't decide.
- **For whom:** renters first. Advocates get the affected-address lists for free. Small landlords get wording only.
- **How it's scored:** 75 points by script on three files (`rules.json`, `lookups.json`, `changes.json`), 25 by judges on the demo.
- **Our bet:** extract the law once into rule records and decide coverage in code, not by a model. Answers are reproducible, quoted, and stay "unknown" when a fact is missing.
- **Scope:** 3 states, 10 cities, 500 sample addresses; the landing page says so plainly. A new city = its law texts + one list entry.
- **Not:** legal advice, a compliance check, a chatbot, rent prices.

## What we must get right (scoring)

| Score | Pts | Owner | Must hold |
|---|---|---|---|
| Extraction | 25 auto | D | Automated from the corpus. Records join the key on jurisdiction + category + citation. Status (in force / not yet effective / pending / failed) and dates right. Never invent a rule |
| Address coverage | 20 auto | S | All 500 addresses. Legal city, not postal city. **Unknown instead of omitting** (a miss costs 2×). Superseded only when a stricter local rule governs |
| Citations | 15 auto | D | Every "applies" has a verbatim quote from the corpus |
| Change tracking | 15 auto | S (T6 ingest D) | T1–T5 from the pack, T6 = hour-16 ordinance, all through one engine |
| Plain language | 10 judges | S | The address page (below) |
| Responsible design | 10 judges | both | "Not legal advice" everywhere, as-of date on every answer, conflicts flagged not decided, audit log |
| Scalability | 5 judges | S | New city = documents + one list entry; hour 16 is the live proof |

Bonus the guide offers: show its four open legal questions (e.g. Berkeley's ban has two published effective dates) as flags with both sources.

## The product: one address page

**The six questions**, one tile each (= the six scored categories):

| Tile | Category |
|---|---|
| How much can my rent go up? | Rent increase limits |
| When can they end my tenancy? (reasons · notice · relocation money) | Just-cause eviction |
| How much deposit can they ask? | Security deposits |
| What can they charge me to apply? | Application and screening fees |
| What can they check about me? | Screening restrictions |
| Can rent-setting software be used on my rent? | Algorithmic rent-setting |

**Each tile is an accordion** (one open at a time):

| Level | Shows |
|---|---|
| Closed | Big title with icon · one plain answer · status mark + word + colour |
| Open | Plain explanation · **next step**: first a human contact (office, phone, "free") from `contracts/contacts.json`, then action helpers (J7) |
| "Show the law" (second toggle) | Verbatim quote · citation · dates · confidence · rules it replaces · link to the rule page |

**Status labels** (one meaning per colour; colours rate the renter's protection, never the building or landlord):
- **There's a rule** · green
- **We're missing one fact** · amber; names the fact and who can tell you
- **No local rule — state basics only** · grey, neutral mark
- Blue only for actions and dates.

**Words** (judged as Plain language; the legal-advice line):
- Reading level grade 6–8. Tenant facts (length of tenancy, etc.) are notes, never inputs.
- Never phrase a cap so it invites comparing the renter's own number: "The Rent Board can check your notice", not "max 3.4%: is yours higher?".
- State facts, let the reader conclude: "Public records list 21 units. The exception is for 4 units or fewer." Never apply the law to the case.
- Coverage is about the building: always "your unit may differ".
- Plain words instead of jargon: good cause → a reason the law accepts · struck → removed (say by whom) · in force → applies now · certificate of occupancy → the date the city first approved the building for living in · notice to quit → a letter telling you to move out · source of income → how you pay rent (e.g. a voucher) · algorithmic software → rent-setting software.

**Ask at any level: one search box, one hierarchy.** The search accepts an address, a city, a neighbourhood ("Dorchester"), a county or a state, and resolves it through the jurisdiction list (with aliases), so nobody has to know the exact name or ID.
- **Address** → the address page (below).
- **Jurisdiction page** for every level (`/j/<id>`): State › County › City as breadcrumbs, each level browsable. It shows the six questions with the rules for that level and everything above it, and *what they depend on* instead of a building result ("applies to buildings with a certificate of occupancy on or before 13.06.1979"). A state page lists its cities; a county page says it has no rules of its own and lists its cities.
- **Outside the scope** ("New York", "Austin") → "Not covered: HomeRule has law for 3 states and 10 cities", never a guess.

**Click any answer → the rule page** (one page per rule, shared by all addresses):
- **Source:** the verbatim quote highlighted in the source text, citation, **link to the official law** (`source_url`), retrieval date, effective date, status.
- **Audit trail:** what the model extracted (and its confidence), what the code decided (jurisdiction match, coverage test on this building's facts, precedence), with the line between the two shown ("reasoning boundary").
- **Impact map:** every sample address this rule touches, coloured by result (applies / unknown / not yet effective / pending), with the date slider. Moving the date flips the dots (e.g. FAIR Act on 02.07.2027). Built: the map and list for one as-of date; the slider is not built.
- This page is also the advocates' view: "which buildings does this law or bill reach?"

**Page, top to bottom (one view):**

1. **Sticky address bar:** address search (address, city, neighbourhood) + compact **"Get alerts" bell** that opens the email field in place; disabled until an address is found, then named after it ("Alerts for 3515 Fillmore St"). "Not legal advice" · as-of date in the header
2. **"Next change: <date> — <what>"**
3. **Small map** (P1): pin + legal-city outline, "Inside <city> city limits" (+ postal city when it differs); State › County › City; building facts (year, units, source), "unknown" shown plainly
4. **"At a glance":** one plain sentence; status tokens only when the tiles differ
5. **Now:** the six accordion tiles
6. **Coming up:** dated plain lines, change log old → new; undated bills as "Proposed, not law"
7. **Alerts:** signup and email preview
8. How this works · disclaimer

## Priorities and feature status

This is the project's feature list; each build updates its status in the same commit. Statuses: built · partial · experimental · WIP (branch/PR) · planned · idea · not specified.

**No feature without asking first.** Nobody (person or agent) builds a feature that isn't in this table or its issue. A new idea goes into the table as `idea` and gets agreed before any code.

Checked Sun 04.10.2026 ~08:15 CEST against `origin/main` (66ad2d3, #82), `origin/production` (f8c33fd, #84), the open PRs and issues, and the live site. **Production is behind `main`** by the 3D map + building outlines (#82) and docs (#85, #86, #88); everything else on `main` is live. "On main only" = merged, not yet on yourhomerule.com. "Live:" names a URL that shows the feature today.

### Overview: built / in review / next

**Built (live on production f8c33fd unless marked)**
- Pipeline: extraction → `rules.json` (58 rules), address resolution 500/500, engine → `lookups.json` + `changes.json` (T1–T5), per-address diff, hour-16 ingest commands, live data sync
- Scored files: all three in `outputs/` (`rules.json` is a placeholder copy until the final build, #74)
- Site: landing, one search box, `/where` tree, address page v3 (six tiles, at a glance, coming up, contacts, helpers), typed address outside the 500, rule page with audit trail + impact dot map, jurisdiction pages, change log + email preview, JSON per address, 2D map with city outline, banner, palette, brand icon
- Alerts: double opt-in signup, confirm, unsubscribe (one-click), Resend delivery, demo dispatch (`make alert`, rehearsed twice on production 04.10.), `make notify`
- 3D map view (Google) + OSM building outline, default 3D — **on main only** (#82)
- Measurements: chatbot scoreboard (not on the site), open legal questions as flags

**In review (open PRs, not merged)**
- #53 stable extraction → #59 renter impact per rule (merge order: issue #87)
- #71 protections ending → #72 change verdict → #77 "Ends: …" in history + email; #89 verdict design preview (draft), #91 email redesign (draft)
- #90 alert engine (lifecycle triggers, digest, approval gate, dry-run cron)
- #55 card answers + card audit · #75 source monitor (Newark Legistar) · #68 extra building data (draft) · #48 contacts (data already on main)

**Next** (ranked, see [What's next](#whats-next-04102026-ranked))
- MCP route `/api/mcp` (#23) · merge #53→#59 (#87) · merge #71→#72→#77 (+#89, #91) · hand-check 15 badges · production push · hour-16 ingest · submission (#13) · tech video

### What's next (04.10.2026, ranked)

Freeze 12:00 CEST, submission 15:00 CEST. Goal names refer to the scoring table above (75 auto + 25 judges).

| # | Item | Owner | Goal · quadrant · why now |
|---|---|---|---|
| 1 | **MCP route `/api/mcp`** (issue #23): read-only tools over `resolveQuery` + per-jurisdiction rules from `rules.json`, `as_of` + `not_legal_advice` on every result, `mcp-handler` v2 Streamable HTTP; plan in [ARCHITECTURE](ARCHITECTURE.md#mcp-route-apimcp-planned-issue-23) | D (issue), Silvan wants it near the top | Goal: Scalability + Responsible design (judges), a second way in for agents · Q1 · must be on `main` and production before the 12:00 freeze to be shown at all |
| 2 | **Merge #53 → #59** (issue #87): stable extraction, then renter impact per rule | D | Goal: Extraction (25 auto) stability; unblocks #71/#72/#77 verdicts · Q1 · the whole verdict stack waits on it and the freeze is 12:00 |
| 3 | **Merge stack #71 → #72 → #77**, then cherry-pick the #89 design commit and #91 email redesign | S | Goal: Change tracking (15 auto) + Plain language (10 judges): end dates and adds/narrows verdicts in history, change log and email · Q1 · stacked PRs rot fast; must land before the production push |
| 4 | **Hand-check 15 verdict badges** (better/worse/unclear on real changes) against the quoted law | S | Goal: Responsible design (no wrong verdict on screen) · Q1 · a wrong "adds protection" badge is worse than none; check before it goes live |
| 5 | **Production push** (fast-forward `production` to the frozen `main`), then walk J1–J4 on a phone | S | Goal: live demo link (submission) · Q1 · production is behind `main` today (3D map not live); the demo runs on production |
| 6 | **Hour-16 ingest** (T6): `make ingest` → `make build` → sync → commit → `production` → `make alert SOURCE=ingest:…` | D (ingest), S (build, deploy, alert) | Goal: Change tracking (T6) + demo beat 6 · Q1 · fixed time; needs the prompt lock settled first (issue #81) |
| 7 | **Submission package** (issue #13): final scored files from one build on `main`, README, method note, team + demo videos | S | Goal: everything (nothing scores without it) · Q1 · hard deadline 15:00 |
| 8 | **Tech video** (`lab/tech-video`, draft PR in progress): `make eval` report, T1–T6, hour-16 run, live `make rerun DOC=` | D | Goal: submission checklist (technical video) · Q1 · recorded after hour 16, due 15:00 |
| 9 | Merge #55 (card answers), #75 (source monitor), close #48 (data already on `main`) | D | Goal: Plain language (no wrong headline values, e.g. LA 3%) · Q2 · only if `make eval` stays green before 12:00, else after the submission |
| 10 | Alert engine #90 | S | Goal: none of the scored ones (product after the hackathon) · Q2-low · owner decision to prototype; don't merge before the freeze |

### Pipeline and scored files

| Prio | Feature | Owner | Status · evidence |
|---|---|---|---|
| P0 | Extraction → `out/rules.json` + `out/rules.compiled.json` | D | built (#30, #31, #35, #40, #46, #51): 58 rules in `out/rules.json`, quotes verbatim, `make eval`, audit trail `out/audit.json`; Santa Ana has no text in the corpus (a finding). Brief-named rule count and T1–T5 as reported by `make eval`, not re-run for this check |
| P0 | Stable extraction: three samples + majority vote, G6 category check, `make check` | D | WIP (PR #53, open; merge first, issue #87) |
| P0 | Prompt lint + freeze (`make freeze`, `extract/PROMPTS.lock`) | D | partial (#35): lint and lock built, but the current prompt digest (5611c27…) does **not** match the lock (0049f88…), checked 04.10. ~08:15 with `extract.prompts.status()`; issue #81 item 4. Re-freeze or explain before hour 16 |
| P0 | Jurisdiction list + address resolution (Census geocoder, offline cache) | S | built (#29): `make resolve`, 500/500, `out/addresses.resolved.json` |
| P0 | Engine → `outputs/lookups.json`, `outputs/changes.json`, `out/lookups.full.json` | S | built (#36, #40, #47): `make build`, all 500 addresses, T1–T5 in `outputs/changes.json` (T6 needs the hour-16 document), J1–J3 + Dorchester as tests (`tests/test_engine.py`). Known scoring gap: 240 `unknown` from unscoped `owner_occupied` exemptions on 5+ unit buildings (issue #81 item 1) |
| P0 | Per-address diff (I6) → `out/changes.full.json` | S | built (#45): `engine/diff.py`; two as-of sources on `main` (`asof:2025-12-31..2026-01-02`, `asof:2026-10-01..2027-07-02`), 390 addresses with an entry; `tests/test_diff.py` checks agreement with `changes.json` |
| P0 | `outputs/` holds the three scored files | S | partial (#74): `outputs/rules.json`, `lookups.json`, `changes.json` all present; `rules.json` is a copy of `out/rules.json`. Final step: one `make build` on `main` after hour 16 and commit all three together (issue #81 item 3) |
| P0 | Hour-16 ingest in one command | D | built (#30): `make ingest`, `make rehearse`, `make rerun` |
| P0 | Demo change for beat 6: `make demo-change` (fictional X001 ingest → before/after → diff → web sync) | S | partial (#45): built, never run; X001 extraction needs `OPENROUTER_API_KEY` or a warm `build/cache`, so `web/data/changes.full.json` has no `ingest:` source yet [verified 08:15] |
| P0 | Live data sync: `npm run sync` copies contracts + `out/` into `web/` and builds `web/data/live/` (rules, findings, per-address results, quote excerpts ±320 chars), drift test | S | built (#41/#50, #54): `web/scripts/sync-contracts.ts`, `web/scripts/build-live.ts`, `web/tests/contracts-sync.test.ts`; header shows "Live" (one build = one source via `NEXT_PUBLIC_DATA_SOURCE`, the "Demo data" option is shown disabled) |
| P1 | Protections ending: `effective.until` (sunset/repeal) dates as their own as-of change sources in the diff (`asof:2029-12-31..2030-01-02`: CA §1947.12 + §1946.2 end, 246 CA addresses; two Newark version swaps), carried into sync and `/api/address` as `effective_until` | S | WIP (PR #71, issue #69): not on `main`; `web/data/live/rules.json` has no `effective_until` today |
| P1 | Renter impact per rule (`renter_impact`: protects/limits, strength, kind) and better/worse/unclear verdict per change | D | WIP (PR #59, stacked on #53; issue #87). Feeds #72 |
| P1 | Card answers per card question (`out/cards.json`) + card audit | D | WIP (PR #55, open): fixes wrong headline values, e.g. LA rent "3% for Jul 2025–Jun 2026" shown as current |
| P1 | Source monitor: poll official sources (first adapter Newark Legistar), save versions, queue extraction, preview address impacts for review | D | WIP (PR #75, issue #60) |
| P1 | Extra data: next useful building fact + public evidence pilot | D | WIP (draft PR #68, refs #22) |
| P1 | Extra data sources (see [ARCHITECTURE](ARCHITECTURE.md#data-sources-to-extend-coverage-p1-checked-04102026)) | D | partial: Census Cartographic Boundary places (city outline) and OSM building footprints (map, #82) used; the rest planned (#22, #68) |
| P1 | Chatbot scoreboard: ~20 dated questions, plain vs web search vs HomeRule | D | built as a measurement (#39, #43, `scoreboard/`): plain 16/20 (4 wrong), plain + web search 20/20, HomeRule 18/20 (0 wrong); not a headline number, not on the site |
| P1 | Show the guide's four open legal questions as flags with both sources | D (data), S (display) | built (`out/findings.json` kind `open_question`, `extract/open_questions.py`; shown on the tiles) |
| Idea | Renter-protection score: one 0–100 score per address/city with per-topic breakdown (`make score` → `out/scores.json` exists in PR #59) | — | idea: whether and how to show a single score is a separate discussion (moved to idea in #72); no display planned |

### Site (yourhomerule.com)

| Prio | Feature | Owner | Status · evidence |
|---|---|---|---|
| P0 | Landing page: hero, search box, eight example addresses, six questions, scope line "3 states and 10 cities" | S | built (#28). Live: `/` |
| P0 | Search (one box): address, city, neighbourhood, county, state via the jurisdiction list + aliases; "Not covered" for anything outside | S | built (#29). Live: `/where?q=Dorchester` (→ Boston), `/where?q=Austin` (→ "Not covered"); `/api/resolve?q=`; landing search routes sample addresses to `/a/<id>` and places to `/j/<id>` |
| P0 | `/where`: jurisdiction tree Federal › State › County › City with coverage per level, autocomplete over sample addresses and places | S | built (#29). Live: `/where` |
| P0 | Address page v3, one view: sticky bar (search + "Get alerts"), next change, map, at a glance, six accordion tiles (plain answer · details · "Show the law"), coming up, alerts, how it works | S | built (#52, #54, #78) for all 500 sample addresses. Live: `/a/A0016` |
| P0 | "At a glance": one plain sentence + six topic tokens | S | built (#52). Live: `/a/A0258` |
| P0 | Missing fact named on the tile: e.g. "When the city first approved the building for living in … on or before October 1, 1978", who can tell you, one line per fact | S | built (#78). Live: `/a/A0107` |
| P0 | "Next change" line in the header | S | partial (#52): shows the next dated change where the data has one (`/a/A0256`: Jul 1, 2027); "No changes scheduled" for SF/LA/Boston on `main`. End dates ("Ends: Jan 1, 2030") come with #71/#77 (WIP) |
| P0 | Typed address outside the 500 (`/a/at?q=`), resolved via Census, rules evaluated with unknown building facts | S | built (#52). Live: `/a/at?q=4801 E 3rd St, Los Angeles, CA` (unincorporated East LA: state rules only) |
| P0 | JSON per address: `/api/address/[id]` (`not_legal_advice`, `as_of`, results with rule, quote, what next) | S | built (#52). Live: `/api/address/A0016` |
| P1 | Small real map: MapLibre GL + OpenFreeMap, pin, Census city outline, "Inside <city> city limits" / "Outside any city" caption | S | built (#49, #54). Live: `/a/A0016` |
| P2 | 3D map view behind a `Map · 3D` switch on the map card (Google Maps JS `Map3DElement`): fly-in from the legal-city outline to the address, same caption; `?map=` and the visitor's own choice win; falls back to MapLibre on no key, key error, load failure (5 s) or no WebGL. Default view from `NEXT_PUBLIC_DEFAULT_MAP_VIEW` (decided `3d` for production + preview 04.10.2026; Vercel lists the variable for both since ~08:00, value not read in this check). Every 3D page view is a Google load (cap 500/day, then the MapLibre fallback) | S | experimental, **on main only** (#64 closed, PR #82 merged 05:59Z; not in production f8c33fd) |
| P2 | Address highlight: the OSM building only when the geocode lies inside its outline (`contains: true`, 21/500), extruded teal in 3D, outlined with a pin on its centroid in MapLibre, "Building outline © OpenStreetMap contributors"; every other address gets a soft ~25 m teal circle and "Approximate location". Data: `web/data/building-footprints.json` (`web/scripts/build-building-footprints.ts`, Overpass API, 473/500 within 30 m) | S | experimental, **on main only** (#64, PR #82) |
| P0 | Coming up: dated plain lines, recently changed, undated bills as "Proposed, not law" with "Follow" links | S | built (#52, #56). Live: `/a/A0256` (FAIR Act Jul 1, 2027), `/a/A0010` (Mass. S.2983, H.5222) |
| P1 | History "Ends: …" lines for protections that end at this address (e.g. San Diego A0019: §1947.12 and §1946.2, Jan 1, 2030), Newark version swaps, same in the email | S | WIP (PR #77, stacked on #72 + #71; issue #69) |
| P1 | Change verdict: "This change adds / narrows renter protection" badge (↑/↓/grey) in history, change log and email, taken from #59's `renter_impact.verdict`, never recomputed; no badge for pending bills or missing data | S | WIP (PR #72, needs #59). Design for the timeline: draft PR #89 (preview stack, not for merge; design commit to cherry-pick) |
| P0 | Change log per address, old → new, dated, quoted; linked from Coming up | S | built (#45, #56). Live: `/changes/A0256`. Addresses without a diff entry show an empty log (`/changes/A0010`) |
| P0 | Email preview on the change log (From, Subject, `List-Unsubscribe`, plain-text part; "Preview only, nothing is sent"); also `GET /api/alerts/preview?address=` | S | built (#45, #61). Live: `/changes/A0256` |
| P0 | Rule page: quote in a source excerpt, link to the official law, dates, status, "what it depends on", audit trail with "reasoning boundary" | S (audit data D) | built (#41/#50, NJ ids with ':' fixed in #76). Live: `/r/MA-ALG-2983`; 64 rule pages (58 scored + unscored records) |
| P1 | Impact on the rule page: every sample address the rule reaches, coloured by result | S | partial: SVG dot map + address list for one as-of date (2026-10-01); **no date slider**. Live: `/r/MA-ALG-2983` (110 MA addresses, all pending) |
| P1 | Jurisdiction pages for every level (`/j/<id>`), rules by question with their conditions, list of sample addresses | S | built (#41/#50). Live: `/j/NJ-HOBOKEN`, `/j/CA` |
| P0 | Contacts per tile (J7): `contracts/contacts.json` (36 entries, source + retrieval date); first next step on each tile is a person | D (data), S (display) | built (data and display via #56). Phones labelled "Number not yet checked by us". PR #48 is still open although its data is on `main` |
| P1 | Action helpers (J7): "Before you call, have ready" checklist, "Ask your landlord" ready email for a missing fact, Boston tenant-rights notice check | S | partial (#52): not on every tile |
| P0 | Site-wide prototype banner, same text in every email footer | S | built (#57, #67) |
| P0 | Palette + header option A "Quiet" | S | built (#58, #63) |
| P2 | Brand icon: roof-scales mark as favicon, apple-icon, site headers and email logo | S | built (#70) |
| P1 | As-of date picker / date slider on the address page | S | not built: one as-of date (`web/data/live/meta.json` `as_of_dates` has one entry, 2026-10-01) |
| P2 | MCP route `/api/mcp`: read-only tools for agents over the same data as the site (plan in [ARCHITECTURE](ARCHITECTURE.md#mcp-route-apimcp-planned-issue-23)) | D | planned (issue #23, no code; `/api/mcp` returns 404 on production). Ranked #1 in What's next |
| P3 | ChatGPT custom GPT on the JSON endpoint | D | planned (issue #25) |

### Alerts (email)

| Prio | Feature | Owner | Status · evidence |
|---|---|---|---|
| P1 | "Get alerts" form → `POST /api/subscribe` (5 per IP per 10 min, never reveals an existing subscription) → `alerts:pending:<token>` (48 h) → confirmation email → `/confirm` page with a POST button → `alerts:sub:<address_id>` | S | built (#57, #62). Live: `/a/A0010` |
| P1 | Closed test: while the postal address in `web/lib/alerts/disclaimer.ts` is a placeholder, confirmation mails and alerts go only to subscribers marked `allowed` | S | built (#62); still in force (placeholder still in the file, 08:15) |
| P1 | Unsubscribe: `/unsubscribe` page + RFC 8058 one-click `POST /api/unsubscribe`, random per-subscription token; landing pages `/alerts/confirmed`, `/alerts/unsubscribed`, `/alerts/invalid` (one route `web/app/alerts/[state]`) | S | built (#57, #62) |
| P1 | Email delivery via Resend from `alerts@yourhomerule.com`, HTML + text, `List-Unsubscribe` headers, one shared layout | S | built (#57, #61); `RESEND_API_KEY` in Vercel production + preview [verified `vercel env ls` 08:15]. Warm-up not documented as done |
| P1 | Email redesign: address hero, subject names what and when, change cards with dates, clearer button and footer; confirm email explains what you get | S | WIP (draft PR #91, stacked on #77) |
| P1 | "See an example alert" overlay on the address page ("Preview — simulated, nothing is sent") | S | built (#57). Live: `/a/A0010` |
| P0 | Demo dispatch for beat 6 (issue #11): `make alert SOURCE=<id> [RESET=1]` → `POST /api/alerts/dispatch {source}` (Bearer `DEMO_TOKEN`) on production, idempotent via `alerts:sent:…`; demo-labelled sources only to `demo`-flagged subscribers | S | built, rehearsed on production twice 04.10. (#62, #65, #66): production `f8c33fd`, take 1 07:45:23, take 2 07:50:26 CEST, one recipient each (demo inbox, A0011, `asof:2026-10-01..2027-07-02`), both arrived [verified by owner]. `DEMO_TOKEN` and `ALERTS_SITE_URL` in Vercel production only [verified 08:15]. Live take uses the hour-16 source |
| P1 | `make notify [SEND=1]`: local dry run / send of change alerts without a token | S | built (#57) |
| P2 | Alert engine: lifecycle triggers per subscribed address (discovered · takes effect 30 days before + on the day · ends 30 days before + on the day · correction), daily digest, per-rule approval gate, dry-run Vercel Cron | S | WIP (PR #90, refs issue #83; not merged, nothing deployed). Owner decided 04.10. to build a prototype; the critic's partner test is deferred to "before a real launch" (`notes/plan/alert-engine.md`, private). Needs #71 (`effective_until`) and #59 (verdicts) |

### Not built yet

| Prio | Feature | Owner | Status |
|---|---|---|---|
| P1 | Renter answers one missing building fact ("you told us", never in the scored files) | S | planned (issue #18) |
| P1 | Compare picked addresses (J5; no ranking, no rent levels, unknown counted apart) | S | planned (issue #17, #24) |
| P1 | Renter-protection map: protection by **area**, unknown shown separately; never a per-building exemption map (see Never) | S | idea |
| P2 | Protection map over time (past, today, after 01.07.2027) | S | idea |
| P1 | Spanish card summaries (brief stretch goal; quotes stay English) | S | planned (issue #19) |
| P1 | "I rent / I own" wording toggle | S | planned (issue #19) |
| P2 | Legal-aid finder for the exact address | S | planned (issue #34) |
| Idea | Search typo tolerance ("Hobokn" → suggestion, never applied silently) | S | idea |
| Idea | Google Places autocomplete for any US address (attribution and Maps terms apply) | S | idea (`NEXT_PUBLIC_GOOGLE_MAPS_KEY` exists; only the 3D map reads it) |
| Idea | Own chatbot · neighbourhood comparison · repairs card | — | idea |

### Known gaps before the freeze

1. **Production behind `main`:** `production` = f8c33fd (#84); the 3D map, building outlines and the 3D default (#82) are on `main` only. [verified `git log origin/production..origin/main`]
2. **Demo change X001 not run:** no `ingest:` source in `web/data/changes.full.json`; the send path itself is rehearsed on production with the real NJ `asof:` source. [verified]
3. **Postal-address placeholder** in `web/lib/alerts/disclaimer.ts`: every email footer shows it; this also keeps the closed test on. [verified]
4. **"Next change" empty where nothing is dated:** SF, LA, Boston and Cambridge say "No changes scheduled" on `main`; end dates come only with #71/#77. [verified on `main`: no `effective_until` in `web/data/live/rules.json`]
5. **240 unknowns from unscoped `owner_occupied` exemptions** on 5+ unit buildings (`CA-RENT-1947.12`, `CA-EVICT-1946.2`, San Diego eviction, Berkeley deposit). Issue #81 item 1. [from issue #81, numbers from `main` at 06:55]
6. **Newark exception tagged as a core rule:** `NJ-NEWARK-RENT-19:2-18.3` is a `rent_increase_limits` rule, not an exemption (display guard since #63). Issue #81 item 2.
7. **Prompt lock mismatch:** digest 5611c27… ≠ lock 0049f88…. [verified 08:15]
8. **Stale headline values** until PR #55 lands: LA rent shows "3% for Jul 2025–Jun 2026" as current on 01.10.2026.
9. **No date slider** anywhere (one as-of date): J3 step 2 and demo beat 5 can't be shown as written; the change log `/changes/A0256` is the stand-in.
10. `outputs/rules.json` is a placeholder copy (#74); the final three files come from one build after hour 16.
11. `DEMO_TOKEN` and `ALERTS_SITE_URL` are set in Vercel **production only**; `make alert` against a preview URL gets 401. [verified `vercel env ls` 08:15]
12. Open PRs not merged by the freeze stay out of the submission: #48, #53, #55, #59, #68, #71, #72, #75, #77, #89, #90, #91.
13. **East LA is a stand-in:** the unincorporated case only shows for a typed address; LA County's own ordinance (ch. 8.52) is not in HomeRule.

## User journeys

**J1 · What applies at my address?** (P0) Ana, 3515 Fillmore St, SF, just got a rent-increase notice.
1. Types "3515 Fill…", picks the suggestion.
2. Sees: California › San Francisco · built 1926 · 21 units · six tiles.
3. Opens "How much can my rent go up?": SF Rent Ordinance applies; the state cap is replaced by it; quote, citation, date.
- ✅ Done when: both rules show with the right result and a verbatim quote, in under 60 s.

**J2 · An honest unknown** (P0) Marco, 10635 Sherman Grove Ave, LA, built 1978.
1. Opens his address.
2. Rent tile says "We're missing one fact": whether the city first approved the building for living in on or before 01.10.1978. Who can tell you: LA Housing Department or your landlord.
3. (P1) Enters the date himself → tile updates, marked "you told us".
- ✅ Done when: the rule shows as unknown with the missing fact and where to check it, never hidden or guessed.

**J3 · What's coming?** (P0) A tenant at 327 Jackson St, Hoboken.
1. Scrolls to "Coming up": NJ FAIR Act takes effect 01.07.2027, may conflict with Hoboken's own ban.
2. Moves the date to 02.07.2027.
3. The tile flips to "There's a rule"; the conflict flag stays, undecided.
- ✅ Done when: the status flips at the date and the conflict is shown, not resolved.

**J4 · Tell me when the law changes** (P0 preview, P1 sending) A tenant at 134 Oxford St, Cambridge.
1. Taps the "Get alerts" bell in the address bar ("Alerts for 134 Oxford St"), enters an email and confirms.
2. A new ordinance is ingested (hour 16).
3. The change log shows old → new; the email shows the same: new rule, date, quote, "not legal advice".
- ✅ Done when: the ingest produces the change log and the matching email preview in under 10 min.

**J6 · Which buildings does this bill reach?** (P0 rule page, P1 map) An advocate in Boston.
1. Opens the rule page for MA S.2983 (from any Boston address, or search).
2. Sees: status "proposed, not law", the bill text quote, link to malegislature.gov, and all 110 MA sample addresses marked "pending".
3. Clicks one quote → sees what the model extracted and what the code decided.
- ✅ Done when: the affected list matches `changes.json` T4, every address says pending (never in force), and the law link opens the official source.

**J5 · Compare before I move** (P1) Someone choosing between two apartments.
1. Opens both addresses and "compare".
2. Sees per category: applies / unknown / coming, side by side.
- ✅ Done when: the comparison shows unknowns apart from "doesn't apply". No rent prices, no ranking.

**J7 · Take action** (P0 contacts, P1 helpers) Marco, 10635 Sherman Grove Ave, LA, has just read his rent tile.
1. Opens the tile: the first next step is a person: "LA Housing Department · phone · free".
2. Taps "Ask your landlord": a ready email asking for the missing fact; copies it.
3. Taps "Before you call": checklist "have your notice, lease, move-in date". On the eviction tile, a check item: "Did your notice include the required tenant-rights form?"
- ✅ Done when: every tile has a contact from `contracts/contacts.json` and the renter can copy a ready email or open a checklist without leaving the page.

### Journey status on the live site (checked 04.10.2026; J2 re-checked 08:15)

Walked read-only on yourhomerule.com: no form submitted, no signup, no send.

| CUJ | Live demo URL | Status | Gap |
|---|---|---|---|
| J1 What applies at my address? | [/a/A0016](https://yourhomerule.com/a/A0016) (3515 Fillmore St) | walkable | None for the done-criterion: SF Rent Ordinance § 37.3 applies, Cal. Civ. Code § 1947.12 "replaced here by the city rule", quotes + dates, built 1926 · 21 units |
| J2 An honest unknown | [/a/A0107](https://yourhomerule.com/a/A0107) (10635 Sherman Grove Ave) | walkable up to step 2 | Since #78 the rent tile names the missing fact as the journey describes ("When the city first approved the building for living in … on or before October 1, 1978"), with LA Housing Department or the landlord as who can tell you, plus a landlord email [verified live 08:15]. Step 3 (renter enters the date, "you told us") not built |
| J3 What's coming? | [/a/A0256](https://yourhomerule.com/a/A0256), [/changes/A0256](https://yourhomerule.com/changes/A0256) | partly walkable | Coming up shows the FAIR Act on Jul 1, 2027 with the conflict flag "flagged for review, not decided"; the change log shows Enacted → Applies, still flagged. Step 2 (move the date to 02.07.2027, tile flips) not possible: no date picker or slider |
| J4 Tell me when the law changes | [/a/A0010](https://yourhomerule.com/a/A0010) ("Get alerts", "See an example alert"), [/changes/A0256](https://yourhomerule.com/changes/A0256) (email preview) | partly walkable; alert send built, rehearsed on production twice 04.10. | Signup form, double opt-in, confirm and unsubscribe are live but in the closed test (only `allowed` emails get mail; postal address still a placeholder). Alert email: dispatched on production `f8c33fd` twice on 04.10. (07:45:23 and 07:50:26 CEST) to the demo inbox for A0011 with the real NJ source `asof:2026-10-01..2027-07-02`, one recipient per dry run, "1 sent" within 1 s, both arrived [verified by owner]. /changes/A0010 is still empty (Cambridge has no change). The hour-16 ingest → change log → email path has not run; that is the live take |
| J5 Compare before I move | — | not built | Planned (P1) |
| J6 Which buildings does this bill reach? | [/r/MA-ALG-2983](https://yourhomerule.com/r/MA-ALG-2983?from=A0258) | walkable | "Proposed, not law", bill quote, link to malegislature.gov, 110 MA addresses all "Pending, not law", audit trail with the reasoning boundary. Impact is a dot map for one date (no slider) |
| J7 Take action | [/a/A0107](https://yourhomerule.com/a/A0107), [/a/A0258](https://yourhomerule.com/a/A0258) | mostly walkable | Contact first on each tile (phones marked "not yet checked by us"), "Before you call, have ready" checklist, "Ask your landlord" ready email, Boston tenant-rights notice item. Helpers are not on every tile |

## Demo (2:30)

| # | Beat | Shows | Time |
|---|---|---|---|
| 1 | **Chatbot scoreboard** (only with its method on screen: who wrote the questions, date, model and version, link to the question set; if not measured by 12:00, drop it and open on beat 2): "ChatGPT 9/20 · HomeRule 19/20" on dated questions (struck Boston ballot, NJ $50 fee cap) | The headline, as a number | 0:15 |
| 2 | **Ana's address, 3515 Fillmore St, SF:** six tiles; rent tile: SF ordinance applies, state cap superseded | The product | 0:30 |
| 3 | **Same question, two more buildings:** 10635 Sherman Grove Ave, LA → unknown with what to check; 471 Columbia Rd "Dorchester" → Boston, no rent cap | Honest unknown, postal ≠ legal city, no invented rules | 0:25 |
| 4 | **Click the answer → rule page:** quote in the law text, link to the official source, what the model extracted vs what the code decided | The AI and the responsible design, visible | 0:25 |
| 5 | **Date slider on the FAIR Act map:** NJ dots flip on 02.07.2027, conflict rings on Hoboken and Jersey City | Change tracking | 0:20 |
| 6 | **Hour-16 live:** ingest the new ordinance on camera with a clock, change log updates, the alert email arrives on a phone | Automation, the live proof | 0:30 |
| 7 | **Proof frame:** 500/500 addresses resolved · 38 postal-city corrections · 100% verbatim quotes · T1–T6 pass | Credibility | 0:05 |

The order of beats still holds with the one-view page (v3, live). The answers on the site now come from the engine; these addresses are also engine tests. There is no date slider (see Known gaps): beat 5 needs a stand-in, e.g. Coming up and the change log on `/a/A0256` → `/changes/A0256`. Beat 1's numbers are placeholders; the measured scoreboard is plain 16/20, web search 20/20, HomeRule 18/20.

## Owners and handoffs

| Dimitar | Silvan |
|---|---|
| Everything up to `rules.json`: triage, Jev classification, extraction, quote check, statuses | Jurisdiction list (13 IDs both sides use), address lookup, building facts |
| Hour-16 ingest, eval suite, audit log | Engine, lookups, changes, diff |
| Extra data sources (P1), MCP route and ChatGPT GPT (P2/P3) | |
| | Page, change log, email + subscription store, score |
| Technical video | Submission package 12:00–15:00 (videos, method note, README) |

**First steps:**
- **Dimitar:** triage the 13 jurisdictions × 6 categories grid against the corpus; test Jev on 5 documents.
- **Silvan:** the jurisdiction list and the address lookup. Already measured: 500/500 jurisdictions.

The interfaces between us (file shapes, the jurisdiction list) are in [ARCHITECTURE.md](ARCHITECTURE.md#interfaces). Change them only via PR.

## Done by the 12:00 freeze

- `make eval` green:
  - ≥22 of the ~27 rules the brief names, with the right status and date;
  - every jurisdiction × category cell triaged;
  - T1–T6 right;
  - the demo addresses right;
  - 100% of quotes verbatim;
  - "not legal advice" found everywhere.
- J1–J4 work on the deployed page, on a phone, tried by someone outside the team.

## Submission checklist (12:00–15:00, lead: Silvan)

| Item | Owner | Done when |
|---|---|---|
| `rules.json`, `lookups.json`, `changes.json` committed in `outputs/` from a build on `main` | S | Schema-valid, all 500 addresses, T1–T6 present |
| Public GitHub repo with code, README (how to run), output files | S | A fresh clone runs `make all` |
| Live demo link (yourhomerule.com) | S | Works on a phone |
| Team video | S | Both of us, 30–60 s |
| Demo video, with the scores on screen | S | Follows the demo table |
| Technical video: `score.py` report on the dev set (or the `make eval` report if no score.py ships), T1–T6 results, the hour-16 run, a live `make rerun DOC=` | D | All four visible on screen |
| One-page method note | S | Sources, pipeline, what code decides vs the model, limits |

## Never

- **Advice and verdicts:** no legal advice, no "compliant" or "illegal", no comparing a user's rent to a cap (nor wording that invites it), no applying the law to the renter's case (state facts, let them conclude), no tips on avoiding a rule.
- **Inventions:** no invented rules or citations. Pending law is never shown as law.
- **Ranking:** no ranked list of least-protected buildings.
- **Data:** no non-public or pricing data; no scraping against site terms.

## Open questions

- Will `score.py` and the dev key be released? How are unknowns scored? (Discord)
- When exactly does the hour-16 ordinance drop?
- How are the 19 "no rule" findings represented in `rules.json`?
- Jev access and quality (5-document test).
- Tagline: Dimitar may still argue for the provocative line, "Your landlord has a lawyer. You have the law."
