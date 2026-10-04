# Alert engine: lifecycle triggers (found / in force / ending)

Build plan, **no code**, for after the hackathon freeze. Written 04.10.2026 on `s/plan-alert-engine`.
Inputs: `docs/PRD.md` (Alerts rows, J4, CUJ table), `docs/ARCHITECTURE.md` (Email and alerts, Upstash keys, env vars), `web/lib/alerts/*`, `web/lib/changes/*`, `web/scripts/alerts.ts`, `engine/diff.py`, `engine/build.py`, `extract/changes.py`, open PRs #59, #71, #72, #75, #77 (issues #60, #69).

Goal: `Goal: none named for HomeRule beyond the hackathon demo · Q4 until Step 0 says go · why now: only because the send path exists and the owner wants it`. If Step 0 passes, it becomes Q2.

---

## 0. Should it be built?

**The job.** A renter hires an alert to *not miss a change in the law that alters what they can do at their address*, without checking a site that changes a few times a year. The real job is "tell me when I have to act (or can stop worrying)", not "tell me every time a document moves". That matters for the design: an alert that does not change the result for the address is noise.

**Who has asked.** Nobody outside the team, as far as the repo shows.
- Demand evidence in the repo: the J4 demo beat (PRD, written by us), the "Get alerts" form and preview. No interview note, user quote or sign-up number. [verified: PRD J4 and CUJ table, `notes/meetings/` has no renter conversation about alerts]
- The live store held exactly one `alerts:sub:<address_id>` key on 04.10.2026, i.e. one address with any confirmed subscriber; by the seed-script design that is almost certainly the demo inbox. [verified: one key from a read-only SCAN; that it is the demo inbox is assumed]
- Renters want to know about rent-rule changes in principle. [assumed: plausible, no evidence here]
- Renters will confirm a double opt-in for a single address and keep it for months. [unknown]

**The data would send almost nothing for months.** In the current corpus (`out/rules.compiled.json`, 64 rules) the only future dates are: NJ FAIR Act `from 2027-07-01`, and CA §1947.12 / §1946.2 `until 2030-01-01`. [verified 04.10.2026] So with today's rules the first date-driven alert (B, 30 days before the FAIR Act) would go out on **01.06.2027**, the first ending alert (C) in **December 2029**. Everything before that has to come from (A) newly found law, which depends on ingest and the source monitor (#75, Newark only, review-gated). The yearly CA rent-cap percentage (Aug 1) and similar recurring numbers are not modelled. [verified: no such rule in the compiled set] → An alert engine on this corpus is a mostly idle machine. Its value is capped by **coverage of new law**, not by the sender.

Gap: no evidence anyone wants alerts, and the data has no events to send for 8 months.
Evidence to close it: real sign-ups from renters who are not us, and their reaction to one real alert.
My prior: 70% that sign-ups stay in single digits without outreach, because the site has no organic traffic. [assumed]

**Cheapest real-world test (2 weeks, no engine).**
1. Put the existing "Get alerts" form in front of real renters: one post per covered city in a tenant forum or newsletter (e.g. a tenants' union list, r/bayarea, a Hoboken/Jersey City group), linking a real address page. Live sign-ups alone measure our traffic, not demand.
2. Count: form submissions, confirmed sign-ups (needs the postal address filled in, otherwise the closed test swallows every confirmation mail), unsubscribes. Add a PII-free daily counter (`alerts:metric:<event>:<date>`, INCR) so the number survives log retention.
3. **Hand-send the first alerts.** When anything real changes for a subscribed address (a new ordinance ingested, a rule corrected), Silvan writes the email by hand from `render()` output via `make notify` (dry run) and sends it with `make notify SEND=1 --source …`, or from his own mailbox. Ask one question in it: "Was this useful? Reply with one word."
4. If nothing real changes in the 2 weeks: send each confirmed subscriber one hand-written "what's coming for your address" note (the FAIR Act for NJ, "nothing scheduled" plus "we'll tell you when the city or state passes something" elsewhere) and measure replies/clicks.

**Go / no-go (after 14 days).**
- **Go** (build phases 1–3 below): ≥ 25 confirmed external subscribers *and* (≥ 3 replies or ≥ 30 % clicked the address link in a hand-sent mail).
- **Partial** (10–24): build only phase 1 (calendar events + manual approval, no digest/preferences); retest in 4 weeks.
- **No-go** (< 10): keep the preview, the change log and `make notify` as they are; put effort into coverage (monitor #75, more jurisdictions) instead, because without new law there is nothing to alert about.

Everything below assumes Go.

---

## 1. Owner's trigger model, and my position on each review note

Trigger model (Silvan): **(A)** new legislation entered/found, whatever its effective date; **(B)** the act comes into force; **(C)** legislation runs out and that changes things for the renter: one month before and on the day.

| # | Review note | Position |
|---|---|---|
| 1 | Pending bills ≠ law → (A) only for `enacted` / `not_yet_effective`, bills opt-in | **Agree.** A bill alert reads as "this applies to you" to most readers. (A) fires for enacted rules only. Bills are a separate opt-in preference ("Proposed bills", default off), worded "Proposed, not law". Bill *death* (failed) only for people who opted in. |
| 2 | Auto-send on discovery pushes extraction errors into inboxes → gate + manual approval until N subscribers | **Agree with the gate, disagree with "until N subscribers".** The risk scales with extraction error rate, not with audience size; one wrong legal claim to 5 renters is as bad as to 500 for trust. Approval is **per rule, once**: a rule is approved (quote verified, status and date clear), then all its lifecycle events (B, C, 30-day notices) send automatically. Auto-approval only after measured quality: the last 20 approved rules needed no edit. Volume is tiny (a handful of new rules per month across 13 jurisdictions), so the queue costs minutes. |
| 3 | Symmetry → also 30 days before (B) | **Agree.** `upcoming_30d` for start dates, `ending_30d` for end dates. The 30-day notice is the one a renter can act on; the "on the day" mail is confirmation. If both would land within 7 days of each other (late approval), send only the later one. |
| 4 | Month/year precision and conflicting dates (Berkeley) → no day-exact reminders, "in July 2027" | **Agree, with a rule for "on the day".** Day precision: dated wording. Month/year precision: "takes effect in July 2027"; the 30-day notice anchors to the first day of the window; the in-force mail goes out the day after the window ends ("is now in effect; it took effect during July 2027"). This matches the engine gate, which makes the whole window `unknown` (`engine/build.py` `gate`). Conflicting dates (`open_question` `dates_disagree`, Berkeley algorithm ban: Jan 2026 vs Mar 1, 2026): treat as a range from the earliest to the latest claim, word it "sources give different dates (January 2026 or March 1, 2026)", never pick one. Today all 64 compiled rules are `precision: day` [verified], so this path is untested by real data; it needs fixtures. |
| 5 | Volume → one digest per subscriber per day across all their addresses | **Agree.** One email per person per local day, grouped by address. Needs a person-level record (today subscriptions are per address only). |
| 6 | Corrections → correction email when a date or rule changes after an alert | **Agree, scoped.** Only when something we *told this person* changes: date moved, result changed, rule withdrawn. Store what was sent per person × rule (fingerprint). Corrections always go through the approval queue and are never batched away. |
| 7 | Only notify when the result for that address changes; unknown → "may affect you" | **Agree.** Events come from the per-address diff, which already lists only result or conflict-flag changes. Conflict-flag-only changes: no mail (they would read as noise); shown on the page. `unknown` → "may affect you: it depends on <missing fact>". |
| 8 | Local date per jurisdiction for "on the day" | **Agree.** CA → `America/Los_Angeles`, NJ/MA → `America/New_York`, from the state code. One cron run after local midnight in both zones. |
| 9 | Positive/negative via #59 verdicts; preview showed 0 "worse" of 642 → dependency risk | **Agree it is a risk; don't block on it.** The verdict is a *badge*, never a send condition. Missing/`unclear` → neutral wording ("This changes the rules at …"). The 0 "worse" is mostly because ending dates were not in the diff; #71 adds the 2030 CA sunset sources (246 addresses, all `removed`), which should produce the first "worse" verdicts. Acceptance check for phase 2: the CA sunset shows ↓ on a hand-checked sample. Until #59 is merged, emails carry no verdict at all. |
| 10 | Legal-advice guardrails, prototype disclaimer | **Agree.** Status words from `RESULT_WORDS`, quote + link to the law, "Not legal advice", prototype notice in every footer until the site stops being a prototype, banned-word lint (#72's list: illegal/compliant/must/should/recommend/advise, plus "your landlord can't") over every rendered email in CI. |
| 11 | Unsubscribe / `List-Unsubscribe` | **Agree.** Keep RFC 8058 one-click. With digests, the header points at a **person-level** token (stop everything); per-address and per-trigger links in the body and on a preferences page. |
| 12 | Postal address placeholder | **Agree, it is a hard gate.** No mail to anyone outside `allowed` until `POSTAL_ADDRESS` is real (CAN-SPAM; `closedTest()` already enforces this). Owner decision: a P.O. box or a virtual mailbox, not a home address. |
| 13 | Resend limits and costs | **Agree, cheap at this scale.** See §6. The real constraint is deliverability of a new domain (first test landed in Outlook spam), not price. |
| 14 | Idempotency via `sent:` keys per event (rule × address × trigger × date) | **Agree, plus a per-person digest key.** See §2 and §6. |

---

## 2. Event model

### Event types

| Type | Owner trigger | Fires when (local date of the jurisdiction) | Condition at this address |
|---|---|---|---|
| `discovered` | A | first time an **approved** rule appears in a deployed build, on the next cron run | rule listed with `applies`, `unknown` or `not_yet_effective` (enacted only); `pending` only for people with the bills preference |
| `upcoming_30d` | B (symmetry) | `effective_from − 30 days` (window start for month/year precision) | result at `effective_from` differs from today's |
| `in_force` | B | `effective_from` (day precision) or day after the window (month/year) | result changes on that date (`not_yet_effective` → `applies`/`unknown`, or added) |
| `ending_30d` | C | `effective_until − 30 days` | the ending rule applies or may apply today, and the result changes at `until` |
| `ended` | C | `effective_until` | as above; no event when a successor in the same jurisdiction and topic starts the same day with the same result (Newark version swaps, `web/lib/changes/ends.ts` from #77) |
| `correction` | review note 6 | next cron run after a build changes a fingerprint this person was told | the person got an alert for this rule × address and its date, result or quote changed, or the rule was withdrawn |

`discovered` and `upcoming_30d` can coincide (a law found 3 weeks before it starts): merge into one item, "New law, takes effect on …".

### Sources of each event

| Event | Source | Status on `main` |
|---|---|---|
| `discovered` | ingest (`make ingest` / `make demo-change` → `ingest:` source in `changes.full.json`); later the source monitor (#75) → human review → promotion into the corpus → `make build` | ingest path built, never run on production; monitor open (#75), never emails by design, candidates only |
| `upcoming_30d`, `in_force` | engine diff at every distinct `effective_from` (±1 day) | **missing**: `engine/diff.py` `date_sources` only uses the brief's two test windows. Needs the same generalisation #71 makes for `until` |
| `ending_30d`, `ended` | engine diff at every distinct `effective_until` (±1 day), `ending_rule_ids`, `effective_until` per change | open in #71 (engine, sync, API) and #77 (wording, Newark swaps) |
| `correction` | comparing the new build's event calendar with the stored fingerprints of sent alerts | new |
| verdict (badge only) | #59 `renter_impact.verdict` on each diff change, mapped by #72 `web/lib/changes/impact.ts` | open (#59 stacked on #53; #72) |

### The event calendar (new build output)

`make build` writes `out/alert-events.json` (synced to `web/data/alert-events.json`), derived from `changes.full.json` and the compiled rules, nothing recomputed in the web app:

```
{as_of, build_id, events: [{event_id, type, rule_id, address_id, fire_date, tz, precision,
  window: {from, to} | null, date_note | null, result_before, result_after, verdict | null,
  fingerprint, requires_approval, demo_label | null}]}
```

- **Event id** = `<rule_id>|<address_id>|<type>|<anchor_date>`, where `anchor_date` is the effective/until date (or window start), not the fire date. `discovered` uses the rule's first-approved build date. Stable across rebuilds as long as the date does not change; a moved date gives a new id **and** a correction for the old one.
- **Fingerprint** = sha256 of `(anchor_date, precision, result_after, requirement_quote, document_status)`[:16]. Changes → correction.
- Historical dates (Newark 2017, 2024) are in the calendar but never fire: see the catch-up rule in §3.
- Size: today ~642 diff changes; with all start and end dates maybe 2–3 k events × ~300 bytes ≈ 1 MB. Fine as build-time JSON; if it grows, split per state.

### State per subscriber

Today: `alerts:sub:<address_id>` hash email → subscriber (per-address token, `allowed`, `demo`). Add a person record so digests, preferences and corrections have a home (§6). Per person × rule × address we keep what we told them (`told:` key: type, anchor date, fingerprint, sent date). That is the only memory corrections need.

---

## 3. Scheduler

### Option 1 (recommended): Vercel Cron → build-time event calendar

- `vercel.json` cron, once a day at **14:00 UTC** (07:00 PDT / 10:00 EDT; 06:00 PST / 09:00 EST): after local midnight in both zones, before people read mail.
- `GET /api/alerts/cron`, protected by `CRON_SECRET` (Vercel sends it as Bearer). Same handler as `POST /api/alerts/dispatch` gets a mode `daily`.
- It reads `web/data/alert-events.json` (imported at build time like `changes.full.json`), computes per jurisdiction `today` in its time zone, and selects events with `fire_date == today` (plus the catch-up window). No engine call, no Python on Vercel: date arithmetic and a join with subscribers only.
- **today and today + 30** are both pre-computed in the calendar as separate event types (`upcoming_30d` has its own `fire_date`), so the cron never evaluates two dates.
- **Catch-up:** if a run is missed, events with `fire_date` in the last 3 days still go (their id is not yet in `sent:`). Older ones are dropped and logged as `expired`. This also stops the first run from mailing every historical date.
- Hobby limits [assumed, check Vercel docs and the project's plan, which is [unknown]]: daily cron only, timing within the hour, function max duration a few minutes. A run is resumable (idempotency keys), so a timeout means "rerun", not double mail. Hobby is non-commercial use only; fine for a prototype.

### Option 2: GitHub Actions scheduled workflow

- `schedule: cron` in the workspace repo runs `node web/scripts/alerts.ts daily --send` (or even `make build` first, so Python can evaluate at runtime).
- Pros: no function timeout; can run the Python engine; logs kept 90 days.
- Cons: Upstash and Resend secrets copied to GitHub; scheduled runs are delayed at busy times and disabled after 60 days without repo activity [assumed, GitHub docs]; runs from the workspace repo, not from what is deployed, so the mail can disagree with the live page; one more place to operate.

**Pick Option 1.** The deciding argument is consistency: the cron reads the same build the page shows, so an alert never describes a rule the site does not show yet. Option 2 only wins if we ever need runtime evaluation for typed addresses (below).

### Build-time JSON vs. runtime evaluation

- **Build-time (recommended):** deterministic, testable in Python next to `test_diff.py`, the page and the email cannot disagree. Cost: a new law reaches inboxes only after ingest → `make build` → sync → deploy (same as today's hour-16 path). That latency (hours) is irrelevant for laws that take effect months later.
- **Runtime:** needed only for addresses outside the 500 samples (typed addresses on `/a/at?q=`). Subscriptions are keyed by `address_id` today, so typed addresses cannot subscribe [assumed from `service.ts` requiring `addressId`; verify]. Keep it that way for this plan; revisit only if Step 0 shows people subscribing for addresses we don't have.

### Time zones

`tz` per event from the state (CA → Los Angeles, NJ/MA → New York). Dates in emails are written in words ("July 1, 2027"), no times. The digest day is the subscriber's first address's time zone (one digest per person per day; all three states are close enough that this never splits a day in practice).

---

## 4. Gates, approval queue, digest, corrections, preferences

### Gates (in order, per event)

1. **Data gate (build time):** the rule has a verbatim quote that passed `make check` / the scored-quote check, a `document_status` of `enacted` (or `pending` for the bills preference), and a date that is either day-exact, a month/year window, or a flagged `dates_disagree` range. Rules with `parse_status` problems or `confidence` below the gate threshold get `requires_approval: true` and never auto-approve.
2. **Approval gate (runtime):** `discovered` and `correction` events need the rule to be in `alerts:approved` (set of rule ids + fingerprint). Date-driven events (`upcoming_30d`, `in_force`, `ending_30d`, `ended`) for an approved rule with an unchanged fingerprint send without further approval. An unapproved rule's events wait in the queue; if they expire there (catch-up window passed), they are logged, not sent.
3. **Audience gate:** closed test (`allowed` only while the postal address is a placeholder), demo-labelled sources only to `demo`-flagged subscribers (as today), the person's preferences.
4. **Result gate:** the event changes the result at that address (§2 table); conflict-flag-only changes are dropped.

### Approval queue

- The cron writes every new event that needs approval into `alerts:queue` (hash event_id → JSON with rule, quote excerpt, date, affected subscribed addresses count) and emails **one** operator summary to `OPS_INBOX` ("3 rules waiting, 2 subscribers affected").
- Approve with `npm run alerts -- approve <rule_id> [--fingerprint F]` or reject with a reason. A small `/ops/alerts` page (Bearer-protected, no PII beyond masked emails) is phase 3, not needed earlier.
- Approval checklist (printed by the script): quote matches the official source, status enacted, date and precision right, the plain line (`PLAIN[rule].line`) reads right, the address count is plausible.
- Auto-approval switch: only when the last 20 approvals needed no edit; logged, reversible by env flag.

### Digest assembly

- Group the day's sendable events per person (email hash), then per address, then by type in this order: corrections first, `in_force`/`ended`, `upcoming_30d`/`ending_30d`, `discovered`, bills.
- One email: subject names the first address and the count ("2 rule changes for 134 Oxford St and 1 other address"). Body: one section per address, one line per event (§5).
- Cap: max 10 items per address; beyond that, "and N more on the change log" + link (a large new state law could hit many rules at once).
- An event whose `told:` record already holds the same fingerprint for this person is skipped (covers re-subscriptions and rebuilds).
- A person who confirmed *after* a rule's approval date does not get `discovered` for it; they get its future date events. Optional later: the confirmation email lists what is already coming for the address.

### Corrections

- On each run, for every `told:` record whose rule × address now has a different fingerprint, or whose event vanished from the calendar (rule withdrawn), create a `correction` event. Always approval-gated.
- Wording: "Correction: in our email of September 3 we said X takes effect on July 1, 2027. The date is now July 15, 2027 (source: …)." Withdrawn: "We told you about X. We no longer show it for your address because … Sorry for the confusion."
- Corrections ignore the bills/trigger preferences (if we told someone something, we fix it) but respect unsubscribe.

### Unsubscribe and preferences

- Person-level token in `List-Unsubscribe` (one click stops everything for that email).
- Body links: "Stop alerts for this address" (existing per-subscription token) and "Choose which alerts you get" → `/alerts/manage?t=<person token>` with: New laws (A, on), Taking effect incl. 30 days before (B, on), Ending incl. 30 days before (C, on), Proposed bills (off), list of addresses with remove buttons. POST only; GET never changes anything (scanner prefetch).
- Preferences are stored on the person record; defaults as above. Honour within the same day (CAN-SPAM allows 10 business days).

---

## 5. Email content

Reuse `web/lib/changes/email.ts`: `layout`, `button`, `link`, `plainChange()` (topic + the address page's plain line), `unsubscribeHeaders()`, `footerText/footerHtml()`, `shortAddress()`, the #72 verdict mapping (`impact.ts`) and the #77 "Ends on" wording. New: `renderDigest(person, items[])` that calls the same per-item helpers; `render()` stays for the single-source path (`make alert`, demo).

Rules for every item: plain sentence from `PLAIN`, the status in `RESULT_WORDS`, the date in words with its precision, a link to "Show the law" on the address page, no advice verbs. "Not legal advice · data as of <date>" and the prototype notice in every footer. Unknown → "may affect you".

Examples (address 327 Jackson St, Hoboken unless noted):

- **discovered** — "**New law** · Algorithmic rent setting — New Jersey has passed a law that bans landlords from using pricing software that coordinates rents. It takes effect on July 1, 2027. Status: Enacted, not yet in effect."
- **discovered, unknown** (LA, 10635 Sherman Grove Ave) — "**New law that may affect you** · Rent increases — Los Angeles passed a rule on rent increases. Whether it covers your building depends on one fact we don't have: when the city first approved it for living in. Who can tell you: LA Housing Department or your landlord."
- **upcoming_30d** — "**In 30 days** · From July 1, 2027: landlords in New Jersey can't use pricing software that coordinates rents. (Hoboken's own ban may conflict with it; we don't decide that.)"
- **upcoming_30d, month precision** — "**Coming in July 2027** · … takes effect in July 2027 (the law gives the month, not the day)."
- **in_force** — "**Now in effect** · Since July 1, 2027: …"
- **dates disagree** (Berkeley) — "**Coming soon** · Berkeley's ban on coordinated pricing software: sources give different start dates (January 2026 or March 1, 2026). We'll write again once it is clearly in effect."
- **ending_30d** (San Diego A0019; not SF or LA, where the city rule replaces the state cap and no end event fires) — "**Ends in 30 days** · ↓ This change narrows renter protection · On January 1, 2030 California's statewide cap on rent increases ends for your building, unless the legislature extends it."
- **ended** — "**Ended** · Since January 1, 2030 the statewide rent cap no longer applies at …"
- **correction** — see §4.
- **bill (opt-in)** — "**Proposed, not law** · Massachusetts bill S.2983 would … It has not passed. We'll tell you if it does."

Subject lines stay neutral (#72): "Rule changes for 327 Jackson St" / "Correction: rule date for 327 Jackson St". Verdict badges only per item, never in the subject. Preheader = the first item.

---

## 6. Data, idempotency, retries, observability, cost

### Upstash keys (additions under `alerts:`)

| Key | Value | Lifetime |
|---|---|---|
| `person:<emailHash>` | JSON {email, token, prefs {a, b, c, bills}, addresses [ids], tz, created_at} | until unsubscribed |
| `sub:<address_id>` | unchanged (index "who follows this address"); keeps per-subscription token | unchanged |
| `approved` | hash rule_id → JSON {fingerprint, by, at, note} | permanent |
| `queue` | hash event_id → JSON (pending approval) | until approved/rejected/expired |
| `sent:<event_id>:<emailHash>` | "1" after Resend accepted the digest containing it | 2 years (date events can be years apart; 90 days is too short for corrections) |
| `told:<emailHash>:<address_id>:<rule_id>` | JSON {type, anchor_date, fingerprint, sent_at} | until unsubscribed |
| `digest:<emailHash>:<local_date>` | `SET NX` lock "sending" → "sent:<resend_id>" | 7 days |
| `log:<date>` | list of JSON lines {event_id, to(masked), outcome, resend_id} | 90 days |
| `metric:<name>:<date>` | counters (signups, confirms, unsubscribes, sent, failed) | 1 year |

Migration: a one-off script builds `person:` records from existing `sub:` hashes (tokens carried over, so old unsubscribe links keep working).

### Idempotency and retries

- Event-level: `sent:<event_id>:<emailHash>`, written for every event in a digest only after Resend accepts it (same pattern as today's `dispatch.ts`).
- Digest-level: `digest:<emailHash>:<local_date>` `SET NX` before sending, so two overlapping runs can't both send; Resend `Idempotency-Key: <emailHash>:<local_date>` as second guard [assumed: Resend supports it for 24 h, verify].
- Failure: digest lock set back to absent, events stay unsent, next run (or a manual `npm run alerts -- daily --send`) retries; after 3 failed days the item is logged `failed_final` and goes to the operator summary.
- Bounces/complaints: Resend webhook → mark person `suppressed` (no further mail). Phase 3.

### Observability

- `log:<date>` per send line (masked email), the cron's JSON report in Vercel logs, and one daily operator summary mail only when something is queued, failed or expired.
- `npm run alerts -- log [--date D]` prints it. No PII in logs beyond masked email.

### Rate limits and cost

- Resend [assumed, check resend.com/pricing]: free tier 3,000 mails/month, 100/day; Pro ~$20/month for 50k. With one digest per person per day and events a few times a year per address, 1,000 subscribers produce far below 100/day except on a big-law day; on that day the cron sends in batches ≤ 2 req/s (Resend's default rate limit [assumed]) and spreads the rest over the next run if the daily cap is hit.
- Upstash free tier [assumed: ~500k commands/month]: a daily run is ~(subscribed addresses × 1 HGETALL) + (events × 2–3 commands); thousands of commands a day at most.
- Vercel: one cron, one function run a day; negligible.
- **Estimated cost up to ~1,000 subscribers: $0/month.** The first paid step is Resend Pro when the daily cap bites.

---

## 7. Tests, rollout, risks

### Test plan

- **Unit (fakes, `memoryStore` + fake mailer, as today):**
  - Python: `tests/test_alert_events.py` builds the calendar from fixture rules: day/month/year precision, `dates_disagree` range, Newark successor swap (no `ended`), unknown result, pending only with bills, historical dates present but never due, fingerprint changes on date move.
  - TS: selection by local date in both time zones (incl. DST change days), catch-up window (2 days late → send, 4 days → expired), approval gate, preferences, digest grouping and cap, correction creation, idempotency (second run sends nothing, crash between Resend and `markSent` → `Idempotency-Key` prevents duplicate), closed-test and demo flags unchanged.
  - Banned-word lint and AA contrast over every rendered digest fixture (extends #72's test).
- **Dry-run mode:** `npm run alerts -- daily --date 2027-06-01 [--send]` simulates any date: prints per person what would go, writes nothing. The cron route takes `?dry=1&date=` behind the secret.
- **Seeded rehearsal:** seed 3 test inboxes (Hoboken, San Diego, Berkeley) as `allowed`; run `daily --date` for 2027-06-01, 2027-07-01, 2029-12-02, 2030-01-01 with `--send` against preview; check Gmail, Outlook, iPhone Mail rendering, one-click unsubscribe, preferences page, and that a second run sends nothing.

### Rollout phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Step 0 test (2 weeks), postal address filled in, deliverability warm-up (DMARC beyond `p=none`, a few hundred mails to own inboxes) | Go threshold met; a test mail lands in Gmail and Outlook inbox, not spam |
| 1 | Event calendar in `make build` (start dates generalised, #71 end dates), `alert-events.json` synced, approval queue + script, Vercel Cron in dry-run only (report to operator) | 14 consecutive daily dry runs with correct output; every event for the seeded rehearsal dates matches a hand-made list; `make eval` and scored files unchanged |
| 2 | Real sends for `allowed` subscribers: digest, corrections, person record + migration, one-click person unsubscribe, verdict badges if #59/#72 merged | Seeded rehearsal passes; idempotency test on production (two runs, one mail); hand-check of 15 badges ≤ 1 wrong (else no badges) |
| 3 | Open to all confirmed subscribers (closed test off), preferences page, bounce webhook, `/ops/alerts` page, metrics | 30 days with 0 duplicate mails, 0 mails to unsubscribed people, complaint rate < 0.1 %, every correction approved within 2 days |

### Risks

1. **Nothing to send.** The corpus has no date event before June 2027; alerts depend on new-law coverage (monitor #75, Newark only). Mitigation: Step 0; tie phase 2 to the monitor covering ≥ 3 jurisdictions.
2. **Wrong legal claim in an inbox.** Mitigation: per-rule approval, quote gate, corrections, neutral wording, prototype notice.
3. **Flood on first run** (historical dates, a big state law). Mitigation: catch-up window, per-address cap, dry-run phase.
4. **Verdict dependency (#59)**: 0 "worse" in the preview. Mitigation: badges optional, never a send condition.
5. **Deliverability** of a new domain (first test in Outlook spam). Mitigation: warm-up before phase 2, DMARC tightened, plain-text part kept.
6. **Two date models drift** (page vs. calendar). Mitigation: calendar built from the same `changes.full.json`; a test that every `in_force` event has a matching change-log entry.

### Open decisions

1. Approval: per rule once (then lifecycle events auto-send), not "until N subscribers"? (Proposal: per rule once; auto-approve only after 20 clean approvals.)
2. Postal address for the CAN-SPAM footer, which ends the closed test? (Proposal: a P.O. box or virtual mailbox, never a home address.)
3. Who runs the approval queue and how fast? (Proposal: Silvan, within 2 days; queued events expire into the log, never sent late.)
4. Bills (pending) at all, or out of scope? (Proposal: opt-in preference, default off, built in phase 3 only.)
5. Go threshold for Step 0? (Proposal: ≥ 25 confirmed external subscribers in 14 days and ≥ 3 replies or ≥ 30 % clicks.)

---

## 8. Unconsidered alternatives

| Alternative | What it is | Verdict |
|---|---|---|
| **Calendar feed (.ics) per address** | `/a/<id>/calendar.ics` with every dated event (30-day notices as `VALARM`s); subscribe once in Google/Apple Calendar | **Beats email for (B) and (C)** on cost and risk: no store, no sending, no CAN-SPAM, no deliverability, reminders handled by the calendar app. Fails (A) and corrections (calendar apps refresh slowly, and nobody reads a changed event). Cheap enough to build **before** the email engine as part of Step 0 (count `.ics` fetches as a demand signal). Recommendation: build it in phase 0; email engine then carries A + corrections + people who don't use calendars. |
| **Weekly digest only** | One email per week per person, no day-exact sends | Simpler (no time-zone logic, fewer sends) and enough for laws announced months ahead. Loses "on the day" (owner's C). With the data's sparsity, most weeks would be empty, so it is a scheduling choice, not a different product. Recommendation: keep daily evaluation, offer "weekly" as a preference later if people ask. |
| **No email: change-log page + RSS/Atom + browser push** | `/changes/<id>` already exists; add a feed and Web Push | Zero PII, zero CAN-SPAM. RSS reaches almost no renters; Web Push needs a service worker and permission prompts, works poorly on iOS without installing the site. Loses the "tell me without me checking" job for most renters. Keep RSS as a free side output of the calendar, not as the main channel. |
| **Partner channel** | Send nothing ourselves; give tenant unions / legal aid a per-city feed or weekly digest they forward to their members | Possibly the strongest for reach and trust (renters already listen to them), and it doubles as the Step 0 outreach. Needs a partner who says yes. Worth one conversation per city before phase 2. |

Why the plan still builds email: it is the only channel that covers (A) "new law found" and corrections for people who never visit again. But the .ics feed is cheaper for (B)/(C) and should come first.
