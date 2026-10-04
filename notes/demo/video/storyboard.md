# HomeRule demo video: storyboard

The narrated demo film for the submission ("Demo video: show your tool in use"), built with the owner's pipeline `/Users/silvan/claude/code/tools/demo-video` (hackathon template). English throughout. ~116 s.

- **Runnable copy:** `/Users/silvan/claude/code/tools/demo-video/examples/homerule/script.json` (with `stills/` and `proof.html`). `notes/demo/video/script.json` is a mirror of it; the stills and the proof card stay in the tool folder, so the mirror's `still`/`clip` paths only resolve there.
- **Outputs (never in this repo):** `/Users/silvan/claude/code/tools/demo-video/out/homerule/` (`animatic.mp4`, `demo.mp4`, stills, contact sheet). Final MP4 path: see "Render log" below.
- **Re-render** after the production update (GAPS #1): `cd /Users/silvan/claude/code/tools/demo-video && ./make.sh examples/homerule/script.json` (audio is cached, so only capture, render and qa run; ~4 min, $0).

## Shots

Times from the animatic (props: hook 4.6 s, title ~4 s, scenes as listed, end card 6.4 s).

| Time | Picture | Narration (spoken) | Caption | How produced | Real / needs build |
|---|---|---|---|---|---|
| 0:00 | Problem montage: one address ("3515 Fillmore St") pasted into a rent-increase mail, Cal. Civ. Code 1947.12, SF Rent Ordinance ch. 37, Mass. S.2983 (pending), NJ FAIR Act, a spreadsheet; counter "searched" | "Three layers of housing law decide your rent. Which ones apply to your home?" | same | `hook.montage` | drawn (illustration of the pain) |
| 0:05 | Title card "HomeRule" · "Housing law, quoted and dated, for your exact address." | — | — | `titleStyle: light` | drawn |
| 0:09 | Home page; types "3515 Fill"; suggestion; address page with "Built 1926 · 21 units" | "Ana rents in San Francisco and just got a rent increase. She types her address. HomeRule finds her building: built 1926, 21 units." | same | capture `/` → `/a/A0016` | real (production) |
| 0:20 | Rent tile opens; Show the law: "State of California's rule … is replaced here by the city rule", verbatim quotes, dates | "The city limits her increase to 1.6 percent this year. The state cap is replaced here by the city rule, and every line quotes the law, with its date." | same | capture | real |
| 0:31 | Rule page audit trail: Extracted by the model │ reasoning boundary │ Decided by code | "Behind every answer, the line stays visible: the model read the law, and code decided whether it covers this building. Same facts, same answer." | same | capture `/r/CA-RENT-1947.12?from=A0016` | real |
| 0:41 | Sticky search "36 Hoff"; rent tile "California limits yearly rent increases to 5% plus inflation, never more than 10%" | "Same city, a building from 1986: here the state cap applies instead. A chatbot answers per city. The law answers per building." | same | capture `/a/A0050` | real |
| 0:52 | LA rent tile "We're missing one fact", box, "Talk to someone first: Los Angeles Housing Department" | "In Los Angeles, this 1978 building sits right on the rent control cutoff. HomeRule doesn't guess. It says which fact is missing, and whom to call." | same | capture `/a/A0107` | real; box text correct only after production update (#78) |
| 1:03 | Dorchester hero "Inside Boston city limits (mailing address says Dorchester)"; rent tile "No local rule — state basics only … a bill is not law" | "The mailing address says Dorchester, but the building is in Boston. Massachusetts bars rent control, so there is no cap, and a pending bill is never shown as law." | same | capture `/a/A0258` | real |
| 1:16 | Jersey City "Next change: Jul 1, 2027"; software tile; "Possible overlap, not decided" | "In Jersey City, a state ban on rent-setting software starts in July 2027 and may clash with the city's own ban. HomeRule flags it for a person. It doesn't decide." | same | capture `/a/A0012` | real |
| 1:28 | Example alert overlay "Preview — simulated, nothing is sent" with the email; extra badge "Preview · nothing is sent" | "Renters can ask for alerts. When a rule at their address changes, the email says what changes and from when, quoted, and never as legal advice." | same | capture (overlay, no form submitted) | real preview; real sending is closed test |
| 1:38 | Proof card: 500/500 · T1–T5 exact (250 · 90 · 140 + 90 flags · 110 · 0) · 26/27 · 0 wrong (18 right, 2 partly; plain chatbot 4 wrong; with web search 20 right) | "Measured on the challenge data: all 500 addresses in their legal city, every supplied change test exact, and no wrong answer in our chatbot check." | same | `clip` of `proof.html` | numbers from `make eval`, ARCHITECTURE B, `scoreboard/` |
| 1:50 | End card "Your rights as a renter, for your exact address." · "yourhomerule.com · Hack-Nation 7 · RealPage challenge" | "Home Rule. Your rights as a renter, for your exact address." | "HomeRule. …" | end card | drawn |

Corner badge on every app scene: "Prototype · not legal advice".

## Decisions taken

1. **English** narration, captions, hook and end card; voice Iapetus (the tool's approved narrator, D10/D11), plain hook (no trailer voice).
2. **Story = the demo beats in DEMO.md minus the hour-16 beat.** The hour-16 ingest needs a terminal and a phone and happens after this render; it belongs in the tech video (brief: "show your system processing the hour-16 ordinance") and in the live run. The film stays honest about it by not mentioning T6.
3. **No chatbot "score" headline.** The proof card shows HomeRule's 0 wrong next to the plain chatbot's 4 wrong *and* the web-search arm's 20 right, because the repo's scoreboard says so. "A chatbot answers per city, the law answers per building" carries the argument instead.
4. **Addresses chosen per point, all verified on production 04.10:** A0016 (superseded), A0050 (state cap applies, same city), A0107 (cutoff-year unknown), A0258 (postal ≠ legal city, no cap, pending bill), A0012 (future law + conflict flag, real citation), A0012's example alert. Not used: Newark rent tile (hardship ceiling text), Hoboken (citation not stated), Boston/Cambridge eviction tiles (label mismatch), A0005/A0019 and San Diego (owner-occupied unknowns, issue #81).
5. **Hook montage** shows the pain (one address searched across statute, ordinance, bill and act), not a slogan (VIDEO_CHECKLIST "Problem intro first").
6. **"Home Rule" spelled as two words in the spoken end line** (the TTS said "Homerun" for "HomeRule"); the caption keeps "HomeRule".
7. **Music:** the template's single `music.track` prompt; the cached track from expense-e2e was reused (0 Lyria clips, $0).
8. **Length 116 s** (target 60–120 s): cut from 123 s by shortening three lines.
9. **Proof card is a local HTML clip** in the tool folder, not a page on the site, so nothing new is deployed.
10. **Rendered against production as it is** (8e7c326); re-capture after the production update so the LA box names the approval date.

## Render log

- Animatic 1: hook failed the length check 4× ("State law, city law, pending bills." read with long pauses, 11–12.5 s for max 9.8 s) → hook rewritten as one flowing sentence.
- Animatic 2: 122.7 s (over 120) → three lines shortened; end line spelled "Home Rule".
- Animatic 3: 116.2 s; every passage passed the transcript check (two takes retried for spoken style words).
- Full render: see below (filled in after the run).
