# MCP in the demo

Private. Written 04.10.2026. MCP server on `main` since PR #98 (`/api/mcp`, tools `find_place`, `get_rules`, `coverage`; `/connect` page). Contacts per topic and the "confirm with this office" rule: PR in progress (`s/mcp-contacts`).

## Where it goes

| Where | What | Length |
|---|---|---|
| Live demo | One full run in Claude with the HomeRule connector: prompt 1 below, answer streams with quotes, dates, the honest unknowns, the per-topic contact and "Not legal advice" | ~60 s |
| Demo video (60 s) | Only that it's possible: a silent ~2.5 s shot of `/connect` ("Make your chatbot rent-law aware") before the end card. No interaction | ~2.5 s |
| Teach video | Optional: "same data, in Claude", as the scalability point (Dimitar decides) | — |

## Prompts (addresses, not cities)

Rule: always give addresses. City-level questions are where a chatbot with web search already scores 20/20 (`scoreboard/`), and the honest answer in San Francisco is "depends on the building".

1. **Moving (live demo lead):** "I'm moving from 471 Columbia Rd in Boston to 3515 Fillmore St in San Francisco. Which renter protections change for me, and what's coming at the new address? Quote the rules."
   Expect: Dorchester is legally Boston; Massachusetts bars rent control, one bill proposed, one measure failed; Fillmore (1926) under San Francisco rent control, state cap replaced; quotes with dates; what's coming; contacts per topic; "Not legal advice".
2. **Before I sign (J5, renter):** "I'm choosing between 3515 Fillmore St and 36 Hoff St in San Francisco. What protections come with each?" (the comparison the UI doesn't have yet)
3. **Landlord (housing provider):** "I own 1064 Summit Ave in Jersey City. What changes in the next 12 months that I need to prepare for?" (FAIR Act from Jul 1, 2027; overlap with the city ban flagged, not decided)
4. **Advocate (J6):** "Which Massachusetts buildings would the pending rent-setting software bills reach?" (110 sample addresses, "proposed, not law")

Fallback if the live run misbehaves: a recorded run of prompt 1.

## Check before showing (every prompt, once, before 12:00)

- No verdict wording from the chatbot: "better/worse protected", "compliant", "illegal", "you're covered", or a comparison of the user's rent to a cap. If it appears, tighten the server instructions, not the prompt.
- Every rule quoted with its date; unknowns stay unknown and name the missing fact.
- The per-topic contact is named (with "not yet checked by us" where marked), and the answer ends with "Not legal advice".
- Numbers only as HomeRule returns them.
