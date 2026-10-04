# HomeRule tech video ("Teach"), 60 seconds

Script for the visual pipeline. The video follows one law from text to answers, so a viewer understands each
technical decision from the story itself. The scoring criteria are served quietly: each scene carries a small
corner tag naming the criterion it earns. Every number and
record below is real: from `make check` on `main` (04.10.2026) and from the committed files in the source table.
Do not add numbers that aren't here.

## Global direction

- **Length:** 60 s hard limit. Narration is 139 words, ~57 s at ~146 words per minute. Keep pauses short.
- **Tone:** plain words, one idea per scene, one visual per idea. No jargon on screen beyond what the voice says.
- **Look:** the website's own look: navy background, green accents, the site font, the drawn HomeRule logo. The
  law's own words always in a serif font; code and data in monospace.
- **Persistent label** (top corner, every frame): `Prototype · not legal advice`.
- **Criterion tag** (opposite top corner): a small, quiet pill naming the scoring criterion the scene serves,
  e.g. `Extraction`. It fades in a beat after the scene starts. It is never narrated and shows no points.
- **Captions:** always on, matching the narration.
- **Music:** newly generated, calm and rhythmic, low under the voice. No stock audio.
- **Pronunciation:** spoken "Home Rule", captioned "HomeRule". Spoken "Jeff", captioned "Jev" (the model
  `typesafe/jev-1.13`). "Luna" is the model `openai/gpt-6-luna`.
- **One diagram, built up through the video:** it starts as two halves and gains one box per scene.
  - Left half, a dashed area labelled **"Model: reads"**, holding the Luna and Jev boxes.
  - Right half, a solid area labelled **"Code: decides"**, holding the boxes for dates, addresses, the engine,
    change tracking and the outputs.

## Scenes

### 1 · 0:00–0:08 · The problem, and the split

**Narration (22 words):** "Whether a housing law applies depends on address, building and date. So a model reads each law
once; code decides every answer."

**Visual:**
1. Three chips drop in one by one, joined by "×": `📍 address` × `🏢 building` × `📅 date`.
2. The screen splits in two: left, dashed, **"Model: reads"**, with a law page icon; right, solid,
   **"Code: decides"**, with a gear icon.
3. A thin arrow runs from left to right. This split is the diagram's skeleton.

**Tag:** `Responsible design`

### 2 · 0:08–0:19 · Reading one law

**Narration (21 words):** "Take New Jersey's rent-software ban. Luna turns it into a rule with a word-for-word quote; Jeff
double-checks it; three runs vote."

**Visual:** a page titled "New Jersey FAIR Act (2026)" slides into the **Model: reads** side.
1. **Luna** highlights one line in the page, in serif: *"any person to perform a coordinating function."* The line
   lifts off and becomes a clean rule card: `Rule: may not perform a coordinating function` · quote ✓ · `starts:
   "the first day of the twelfth month next following the date of enactment"`.
2. **Jev** stamps four small ticks on the card, each with a confidence:
   - quote supports the rule `0.81`
   - start date `0.84`
   - adopted `0.98`
   - state law `1.00`
3. Three faint copies of the card shuffle and merge into one: "3 runs → keep what agrees".

**Tag:** `Extraction`

### 3 · 0:19–0:24 · Dates are computed, not guessed

**Narration (11 words):** "Code turns 'the twelfth month after enactment' into July first, 2027."

**Visual:** the card crosses to the **Code: decides** side. A calendar flips: `enacted Jul 20, 2026` → counts 12
months on a small strip → lands on **`Jul 1, 2027`**. The card's start-date field turns from serif "as written" text
into the date.

**Tag:** `Extraction`

### 4 · 0:24–0:37 · From a law to one building

**Narration (28 words):** "The Census finds each address's legal city; records give the building's age. Built 1927: covered.
Built 1978, against a 1978 cutoff: unknown, and we say what settles it."

**Visual:** switch to a Los Angeles example, with the LA rent ordinance's cutoff of Oct 1, 1978.
1. A pin drops on `6238 De Longpre Ave`. The Census stamps **"Los Angeles"**, a small reminder that the legal city
   can differ from the mailing city (38 of 500 do). Its year, `1927`, appears as a short bar on a timeline, well
   before a vertical line marked **Oct 1, 1978**, so the result reads **✓ covered**.
2. Second pin: `10635 Sherman Grove Ave`, built `1978`. Its bar covers the whole of 1978, and the cutoff line cuts
   through it, so the bar turns amber and the result reads **? unknown**. Beneath it, the page's real line: "Check the
   certificate-of-occupancy date."

The idea to land visually: a year is a range, and the law's date can fall inside it.

**Tag:** `Address coverage`

### 5 · 0:37–0:45 · Change is just a later date

**Narration (20 words):** "Change is the same engine on a later date. All five test cases match; state-city clashes are
flagged, never decided."

**Visual:**
1. A date slider moves from `Oct 1, 2026` to `Jul 2, 2027`. A Hoboken building (`1031-1035 Clinton St`) flips the
   New Jersey law from `not yet in force` to **`applies`**.
2. A small flag pops up on the building: "may clash with Hoboken's own ban: flagged for review". The law's sentence
   appears beside it, in serif: *"A municipality shall be prohibited from enacting an ordinance that conflicts with
   this act."*
3. Along the bottom, five small tiles tick green: `T1 · T2 · T3 · T4 · T5`.

**Tag:** `Change tracking`

### 6 · 0:45–0:52 · Why you can trust it

**Narration (18 words):** "Every quote is checked against its source, every model call logged, and held-out questions score
sixteen of sixteen."

**Visual:** three quick cards, about 2 s each:
- the FAIR Act quote highlighted inside its source page, with a ✓ and `54/54 quotes found word for word`;
- a scrolling log, one line legible: `luna_extract · D069 · openai/gpt-6-luna · request ca265022…`;
- `16/16` large, with the line "questions we never tuned on".

**Tag:** `Citations · Responsible design`

### 7 · 0:52–1:00 · One engine, any city, then end card

**Narration (19 words):** "One engine serves the site, an API and AI assistants. A new city means new laws, not new code."

**Visual:**
1. The finished diagram. Its right end fans into three icons: **website** · **API** · **AI assistant (MCP)**.
2. A new city card slides in: "+ law texts + one list entry". No code icon appears.
3. A faint dotted lane under the addresses: "next: public parcel data for any address", labelled **next**.
4. **End card:** the HomeRule logo · "Housing law, quoted and dated, for your exact address." · `yourhomerule.com` ·
   "Not legal advice".

**Tag:** `Scalability`

## Word count

139 spoken words (scenes: 22 · 21 · 11 · 28 · 20 · 18 · 19).

## Facts used, and where they come from

| Claim | Source |
|---|---|
| FAIR Act quote, start date as written, enacted 2026-07-20, effective 2027-07-01; Jev 0.81 / 0.84 / 0.98 / 1.00; log line `ca265022…` | `out/audit.json` → `NJ-ALG-56:9-23` |
| Conflict sentence | same, `code.interaction.quote` |
| 6238 De Longpre Ave built 1927, applies; 10635 Sherman Grove Ave built 1978, unknown | `out/lookups.full.json`, `out/addresses.resolved.json` |
| 38 of 500 mailing city ≠ legal city; 500/500 resolved | `out/addresses.resolved.json` |
| Hoboken 1031-1035 Clinton St: not yet effective → applies, conflict flagged | `out/changes.full.json` |
| T1–T5 match; 26/27 named rules; 54/54 quotes; held-out 16/16 | `make check` |
| Website, API, MCP | `web/app/a/[id]`, `web/app/api/address`, `web/app/api/mcp` |

## Don'ts

- No point values; criterion tags are names only. No summary row of criteria.
- Don't say or show "compliant", "illegal" or "guarantee", and don't compare a renter's rent to a cap.
- No chatbot comparisons. No `score.py` (not shared with participants). No T6 or "hour 16".
- Don't present parcel lookups as built: today, building-level answers exist for the 500 sample addresses.
- Quotes: "checked against its source". Don't claim all are from the supplied corpus (47 of 54 are).
