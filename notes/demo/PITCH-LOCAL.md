# Local pitch, Zurich hub, Sun 04.10.2026 15:30–16:30

Live, no slides. Website, then `/connect`, then Claude Desktop. Pages checked on production `1b914bd` at 12:55 CEST; both Claude prompts checked against the production MCP at ~13:05.
Whoever isn't speaking drives the laptop.

## Script (≤ 2:00, ~265 words)

| Time | Who | Line | Screen / click (driver) |
|---|---|---|---|
| 0:00–0:09 | S | "Housing law comes in layers: state, city, building. Two apartments in the same city can get different rules. Which ones protect you?" | Tab 1 `/` hero |
| 0:09–0:18 | S | "A chatbot has a training cutoff. A law has an effective date. HomeRule reads the law once and answers for one exact address." | Same, point at "3 states and 10 cities" |
| 0:18–0:29 | S | "3515 Fillmore Street, San Francisco. Built 1926, so city rent control covers it: the city's yearly limit is 1.6 percent, March 2026 to February 2027." | Click chip **3515 Fillmore St** → `/a/A0016`, scroll to **Rent increases** (`#t-rent`) |
| 0:29–0:41 | S | "Show the law: the ordinance, word for word, in effect, checked October 1. The state cap sits below it, marked replaced here by the city rule." | Click **Show details**, then **Show the law** at the bottom of the tile (rehearse once) |
| 0:41–0:51 | D | "Same city, 36 Hoff Street, built 1986: no city rent control. The state cap instead, and its next change: it ends January 2030." | Tab 2 `/a/A0050`, hero |
| 0:51–1:04 | D | "Los Angeles, built 1978. Coverage turns on whether the city approved it before October 1, 1978. The year can't tell. So HomeRule says unknown, and names who knows: the Housing Department." | Tab 3 `/a/A0107#t-rent`, click **Show details** to open the "What we don't know yet" box. Don't point at the "3% for Jul 2025–Jun 2026" figure (period has ended) |
| 1:04–1:13 | D | "Newark: a state ban on rent-setting software starts July 2027. Not in force yet, shown as coming, and marked: adds renter protection." | Tab 4 `/a/A0011`, Coming up panel → "Jul 1, 2027 · ↑ adds renter protection" |
| 1:13–1:28 | S | "Renters can ask for an email when a rule changes at their address. Confirm first, unsubscribe in one click. This is the email: what changes, when, which way. Today it runs as a closed test." | **Get alerts** (top bar) → popover. **Don't type, don't click Email me.** Esc → **See an example alert** ("Preview — simulated, nothing is sent") → × |
| 1:28–1:32 | D | "Any chatbot can use the same data." | Tab 5 `/connect` (first screen, Claude tab) |
| 1:32–1:50 | D | "In Claude: I'm moving from Boston to San Francisco. It quotes both places with dates, flags Boston's missing fact, and the Massachusetts bills as proposed, not law." | Claude Desktop, press Enter on the pre-typed prompt; scroll to SF 1.6% and "Not legal advice" |
| 1:50–2:00 | S | "HomeRule: not legal advice. It says unknown instead of guessing. We're looking for one tenant group or city to pilot it with." | End on the Claude answer |

**60-second cut:** hook, Fillmore (Show the law clicked silently), LA unknown, alerts (one line: "Renters can get an email when a rule changes at their address; here's what it looks like", example alert from `/a/A0016`), Claude, close. Drop rows 0:09, Hoff, Newark, `/connect`.

## Claude Desktop prompts (web search OFF, HomeRule ON)

1. Lead: "I'm moving from 471 Columbia Rd in Boston to 3515 Fillmore St in San Francisco. Which renter protections change for me, and what's coming at the new address? Quote the rules."
2. Backup: "I rent at 10635 Sherman Grove Ave in Los Angeles and just got a rent increase notice. Which rules limit it? Quote them with their dates and tell me what's unknown."

## Before 15:30

- Tabs 1–5 in one window, hard-reloaded, zoom 110–125 %: `/`, `/a/A0050`, `/a/A0107#t-rent`, `/a/A0011`, `/connect`.
- Claude Desktop: new chat, web search off, HomeRule on, lead prompt typed. One dry run beforehand; screenshot the answer.
- Fallback video open in QuickTime: `/Users/silvan/claude/code/tools/demo-video/out/homerule-demo60/demo_v3_matilda.mp4`.
- Ask the host: minutes, Q&A, own laptop/HDMI, does this round decide 10.10.?

## Fallbacks

- Wi-Fi down: play the video, say the close line over the end card.
- Claude slow > 10 s: show the screenshot, "same question, answered earlier today".
- Show the law won't open (it sits under Show details): skip, "every rule carries its quote and date".

## Judge questions

1. **Data, freshness?** Challenge corpus plus official sources; every rule has a verbatim quote, link, effective date and checked date; law as of Oct 1, 2026. Building facts from public records (DataSF, LA County eGIS, Boston Assessing, NJOGIS).
2. **New city?** A model reads each law once into a dated rule with its quote; code decides coverage per building at any date. A new city = its documents + one public address-facts source, no new code.
3. **Accuracy?** Say "as of this morning's 02:30 build" (`out/eval/report_supplemental.md`; flags a prompts-digest mismatch, re-run `make eval` if time): 55/55 quotes verbatim, change tests T1–T5 match expected, 26/27 assertions (one rule missing), 500 sample addresses. No chatbot-score claims.

## Never say

Legal/illegal/compliant; a renter's number against a cap; pending as law; "automatic/daily alerts" (digest PR #90 is open).
