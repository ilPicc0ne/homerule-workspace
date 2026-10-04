# Video production

What the submission videos must meet, and how we make them. Read before scripting or rendering any video.

## Hard constraints

| # | Constraint | Source | Status |
|---|---|---|---|
| 1 | **Three separate videos: Team Intro, Demo, Teach (technical)** | Hack-Nation Luma message, 04.10.2026 08:27 CEST: "Submit 3 separate videos, max 1 min each: Team Intro, Demo & Teach. No 3–5 min video required." Terms of participation §6/§7 (app.hack-nation.ai/agb) also name three videos | [verified] for the event |
| 2 | **Max 1 minute each** | Same message | [assumed] for our challenge: the message is headed "World Bank Challenge Clarification"; we are on the RealPage challenge. Confirm on Discord or in the submission form. Until then, plan for 60 s |
| 3 | Only material we hold the rights to (images, audio, video); no stock or random music | Terms §6/§7 | [verified]. Voice and music are generated (Gemini TTS, Lyria, ElevenLabs): check each provider's terms for commercial/public use before upload [unknown] |
| 4 | Hack-Nation may show the videos on its channels, also after the event (non-exclusive) | Terms §6/§7 | [verified]: nothing private on screen |
| 5 | Late submissions are not judged; deadline 15:00 CEST 04.10.2026, freeze 12:00 | Workspace, PRD | [verified] |

Organizer tips (same Luma channel, 04.10.2026 05:18 CEST): record early; "great lighting, music + visuals win"; example videos at tinyurl.com/team-vid-26 and tinyurl.com/demo-vid-26.

## The three videos

| Video | Length | Content | Owner |
|---|---|---|---|
| Team Intro | ≤ 60 s | Both of us, who we are, why this problem | Silvan |
| Demo | ≤ 60 s | The renter story (`notes/demo/video/STORY.md`, cut to 60 s): one renter end to end, then quick cases (another building, an honest unknown, what's coming / failed / pending), end card | Silvan |
| Teach | ≤ 60 s | How it works: law text in → extracted rule with quote and date → code decides coverage → change tracking, `make eval` results (issue #95) | Dimitar |

At ~150 words per minute, 60 s holds ~140 spoken words including the end card. Something has to go: one renter carries the film, the others get one sentence each.

## Content rules (from the PRD "Never" list and the brief)

- Labelled "Prototype · not legal advice" on screen throughout.
- No legal advice or verdicts: no "legal/illegal", no "compliant", no comparing a renter's increase to a cap (nor wording that invites it). State the rules; the renter concludes.
- Pending law is never shown as law; show unknown, pending, failed and not-yet-effective as what they are.
- Numbers only from `make eval` / `out/build_summary.json` of the build that is live, re-checked after the last merge. No chatbot score claims.
- Real sample addresses only; personas are illustrative and say so where it matters. No real person's name or private data.
- Captions always on (videos autoplay muted).

## How we make them

- Tooling: `~/claude/code/tools/demo-video` (Remotion + Playwright). The template pipeline (`make.sh` + `script.json`) gave a generic look; HomeRule videos are built as free compositions in `experiments/homerule-*` with the site's own look (navy, green, site font, drawn logo).
- Narrated throughout; on-screen text echoes the voice. Voice: ElevenLabs (key read only by a script Silvan runs) or Gemini TTS as a placeholder. Music: newly generated per video, calm or rhythmic, no stock.
- Screen recordings of production (`yourhomerule.com`), not stills; wait for maps to load.
