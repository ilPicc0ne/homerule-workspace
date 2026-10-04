# HomeRule tech video ("Teach"), 60 seconds

Script for the visual pipeline. The video follows one law from text to answers, so a viewer understands each
technical decision from the story itself. It shows what the system does and why it is built that way, with a
three-second terminal insert showing the actual repository checks. Every record below is real (see the source table). Do
not add numbers that aren't here.

## Global direction

- **Length:** 60 s hard limit, end card included. Narration is 107 words, about 50 s spoken with the years read
  out, which leaves room for pauses and a 6 s end card.
- **Tone:** plain words, one idea per scene, one visual per idea. No jargon on screen beyond what the voice says.
- **Look:** the website's own look: navy background, green accents, the site font, the drawn HomeRule logo. The
  law's own words always in a serif font; code and data in monospace. Icons are drawn line icons, not emoji.
- **Persistent label** (top corner, every frame): `Prototype · not legal advice`.
- **Captions:** always on, matching the narration.
- **Music:** track a, low under the voice.
- **Pronunciation:** spoken "Home Rule", captioned "HomeRule". Spoken "Jeff", captioned "Jev" (the model
  `typesafe/jev-1.13`). "Luna" is the model `openai/gpt-6-luna`.
- **One diagram, built up through the video:** it starts as two halves and gains one box per scene.
  - Left half, a dashed area labelled **"Model: reads"**, holding the Luna and Jev boxes.
  - Right half, a solid area labelled **"Code: decides"**, holding the boxes for dates, addresses, the engine and
    change over time.

## Scenes

### 1 · 0:00–0:07 · The problem, and the split

**Narration (19 words):** "A law's reach depends on address, building and date. A model reads each law once; code decides
every answer."

**Visual:**
1. Three drawn icons drop in one by one, joined by "×": pin `address` × building `building` × calendar `date`.
2. The screen splits in two: left, dashed, **"Model: reads"**, with a law page icon; right, solid,
   **"Code: decides"**, with a gear icon.
3. A thin arrow runs from left to right. This split is the diagram's skeleton.

### 2 · 0:07–0:16 · Reading one law

**Narration (18 words):** "Take New Jersey's rent-software ban. Luna turns it into a rule with an exact quote; Jeff checks
it."

**Visual:** a page titled "New Jersey FAIR Act (2026)" slides into the **Model: reads** side.
1. **Luna** highlights one line in the page, in serif: *"any person to perform a coordinating function."* The line
   lifts off and becomes a clean rule card: `Rule: may not perform a coordinating function` · quote ✓ · `starts:
   "the first day of the twelfth month next following the date of enactment"`.
2. **Jev** stamps small ticks on the card, one per check: `quote supports the rule` · `start date` · `adopted` ·
   `state law`.
3. On screen only: three faint copies of the card merge into one, "3 runs → keep what agrees".

### 3 · 0:16–0:21 · Dates are computed, not guessed

**Narration (11 words):** "Code turns 'the twelfth month after enactment' into July first, 2027."

**Visual:** the card crosses to the **Code: decides** side. A calendar flips: `enacted Jul 20, 2026` → counts 12
months on a small strip → lands on **`Jul 1, 2027`**. The card's start-date field turns from serif "as written" text
into the date.

### 4 · 0:21–0:33 · From a law to one building

**Narration (23 words):** "The Census finds each address's legal city. Built 1927: covered. Built 1978, on a 1978 cutoff:
unknown, and we say what settles it."

**Visual:** switch to a Los Angeles example, with the LA rent ordinance's cutoff of Oct 1, 1978.
1. A pin drops on `6238 De Longpre Ave`. The Census stamps **"Los Angeles"**, with a small note: "legal city, not
   mailing city". A chip on screen only: `building records → year built`. The year, `1927`, appears as a short bar on
   a timeline, well before a vertical line marked **Oct 1, 1978**, so the result reads **✓ covered**.
2. Second pin: `10635 Sherman Grove Ave`, built `1978`. Its bar covers the whole of 1978, and the cutoff line cuts
   through it, so the bar turns amber and the result reads **? unknown**. Beneath it, the page's real line: "Check the
   certificate-of-occupancy date."

The idea to land visually: a year is a range, and the law's date can fall inside it.

### 5 · 0:33–0:41 · Change is just a later date

**Narration (15 words):** "Change is the same engine on a later date; state-city clashes are flagged, never decided."

**Visual:**
1. A date slider moves from `Oct 1, 2026` to `Jul 2, 2027`. A Hoboken building (`1031-1035 Clinton St`) flips the
   New Jersey law from `not yet in force` to **`applies`**.
2. A small flag pops up on the building: "may clash with Hoboken's own ban: flagged for review". The law's sentence
   appears beside it, in serif: *"A municipality shall be prohibited from enacting an ordinance that conflicts with
   this act."*

### 6 · 0:41–0:54 · Decide once, answer instantly

**Narration (21 words):** "Models run once, when a law is indexed; answering is plain code, under a millisecond. A new city
is just data."

**Visual:**
1. A horizontal split, two lanes:
   - top lane, **"Index time · once per law"**: the Luna and Jev boxes run;
   - bottom lane, **"Answer time · engine"**: only the engine gear, with two numbers in monospace:
     `0 model calls` · `< 1 ms per address`.
2. On "a new city", a US map: CA, NJ and MA lit, with the ten cities as bright dots. One dim city inside a lit state
   gets a label: "a new city: its law texts + building records".
3. At **0:51–0:54**, cut to `assets/make-check.mp4`, then the end card. Keep the existing voice track; no extra
   narration or runtime. This terminal insert shows T1–T5 and the verbatim-quote check from a real run.
   `assets/README.md` records the tested revision, provenance and limits. These are our repository checks,
   not an organizer score or a promise that every extraction is correct.

### End card · 0:54–1:00

The HomeRule logo · "Housing law, quoted and dated, for your exact address." · `yourhomerule.com` · "Not legal
advice".

## Word count

107 spoken words (scenes: 19 · 18 · 11 · 23 · 15 · 21).

## Facts used, and where they come from

| Claim | Source |
|---|---|
| FAIR Act quote, start date as written, enacted 2026-07-20, effective 2027-07-01; Jev's four checks | `out/audit.json` → `NJ-ALG-56:9-23` |
| Conflict sentence | same, `code.interaction.quote` |
| 6238 De Longpre Ave built 1927, applies; 10635 Sherman Grove Ave built 1978, unknown | `out/lookups.full.json`, `out/addresses.resolved.json` |
| Legal city can differ from mailing city | `out/addresses.resolved.json` |
| Hoboken 1031-1035 Clinton St: not yet effective → applies, conflict flagged | `out/changes.full.json` |
| 0 model calls and under 1 ms per address in the engine | `engine.build.evaluate_address`, timed on Dimitar's laptop and Silvan's (0.39 ms per address), 04.10.2026 |

## Don'ts

- Keep validation to the three-second terminal insert. Do not turn the repository checks into an organizer score;
  the recorded run still has a known assertion gap. No claim of a stable 16/16 across fresh re-extractions.
- Don't say the website, API or chatbot run the engine on each request: they serve its precomputed output.
- Don't say adding a state is data only: a new state also needs code for its default start dates and a building-data
  source. A new city in a covered state is data.
- Don't say or show "compliant", "illegal" or "guarantee", and don't compare a renter's rent to a cap.
- No chatbot comparisons. No `score.py`. No T6 or "hour 16".
- Don't present parcel lookups as built: today, building-level answers exist for the 500 sample addresses.
