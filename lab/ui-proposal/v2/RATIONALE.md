# HomeRule one view, v2: rationale

Open `index.html` (starts empty, as a renter would) or `index.html#sf`, `#hoboken`, `#boston`. Content comes from `web/data/demo` (lookups for Oct 1, 2026), not from v1's text. All 28 quotes match that data's spans exactly, and the data passes `node web/scripts/check-quotes.mjs` (verbatim against the corpus).

## Where v1 fails, per journey
- **J1 what applies:** no address entry, only chips. The topic name is the smallest text on the tile (13px grey) and has no icon. Nothing shows that a tile opens. The "6 of 6 protections" banner changes colour with the count, so it reads like a grade. That the city rule replaces the state cap is hidden. Most tiles have no quote, and "source" links go nowhere.
- **J2 honest unknown:** amber means two things: "depends on a fact" (Hoboken rent) and "weaker rule" (Boston eviction, screening). The missing fact and where to check it are mixed into one line, and the building facts don't show which fact is unknown.
- **J3 what's coming:** "Pending" sits in the date slot next to real dates. There's no way to see a status change on its effective date, and the conflict is plain prose.
- **J4 alerts:** the signup is at the very bottom, not tied to the address by name, and nothing says it's a mock.
- **J6 bill reach:** no link to a rule page or to the buildings a bill would reach.
- **Everywhere:** dots carry meaning by colour alone and the legend sits under the grid. Small headings are all caps, dates use a non-US format, and chips are about 32px tall.

## Patterns and why
1. **Summary first.** An "At a glance" sentence plus six status tokens (topic icon, mark, colour) fit above the fold at 375×812. Tapping a token jumps to its tile and opens it.
2. **Status = mark + word + colour, one meaning per colour.** Green: protection applies. Amber: depends on a fact. Slate: no extra protection. Blue is reserved for actions and time. An unknown inside a protected topic becomes a note chip, not a second colour. Colours rate the renter's protection, never the building or the landlord.
3. **Tile = accordion (WAI-ARIA pattern).** Each tile has a large title with an icon, one answer line, the source level, and "Show details" with a chevron. One opens at a time. The details answer in order: the renter's question, what we don't know, what you can do next, then the law in serif (verbatim, with citation, source link, dates, checked date and confidence). A missing quote is stated as missing.
4. **Grouped by situation:** "While you live here" (rent, eviction, software) and "Moving in or out" (deposit, fees, screening).
5. **J4: the sticky address area holds the lookup and the alert signup.** The lookup is a combobox for an address, city or neighborhood ("Dorchester" finds Boston), and it says plainly when an address isn't covered. Until an address is picked, the signup is disabled and reads "Pick your address first". After that it is one field plus a button under "Alerts for 3515 Fillmore St". Submitting shows "Coming soon — launches with double opt-in", with no network and no storage. On phones the signup sits right under the lookup, and once it scrolls away a bell in the one-row sticky bar brings it back.
6. **Map.** On phones a thumbnail sits beside the legal place and building facts. On desktop a card sits beside the address. The caption reads "Inside Boston city limits — your mail says Dorchester", and tapping opens a larger map. Here it is inline SVG with hand-simplified outlines; **the real build uses map tiles plus Census TIGER place boundaries.**
7. **Now | Coming up.** On desktop the tiles sit on the left and a sticky timeline on the right. A "Today" marker splits future items from recent changes, which show old → new. Undated bills sit in a dashed "Proposed, not law" box with the J6 link-out. "Preview Jul 2, 2027" flips the FAIR Act to "Applies" while the conflict flag stays undecided (J3).
8. **Trust stays visible but quiet.** "Demo data" and "Not legal advice" sit in the header at every width. A strip above the tiles says the answers are quoted from the law and gives the as-of date. Every details panel ends with "Not legal advice".
9. **Two typefaces, two voices.** Atkinson Hyperlegible Next, made by the Braille Institute for low-vision readers, carries the plain language; it keeps 1/l/I and 0/O apart in addresses and citations. Source Serif 4 is used only for the law's own words. Text meets WCAG AA contrast and every tap target is at least 44px; checked at 320, 375, 768 and 1280px with no horizontal scroll.

## Left out on purpose
- An as-of date dropdown or slider: renters don't need time travel. Preview appears only where a dated change exists.
- Counts shown as a score, any ranking, comparing someone's rent to a cap, and labels for landlords or buildings.
- Map base tiles, plus jurisdiction and rule pages: their links show a "not in this mockup" note.
- "You told us" fact entry (P1), Spanish, compare, and dark mode.
