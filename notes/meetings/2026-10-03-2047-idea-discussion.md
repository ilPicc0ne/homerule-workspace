# Wispr: "idea discussion", Sat 03.10.2026, 20:47–21:24 CEST (36 min)

Source: Wispr Flow meeting `ead09602…`, full transcript read. Speakers kept: Silvan, Dimitar (labelled by Wispr; attribution high confidence, a few back-to-back lines may be swapped). Speaker 3 left out entirely.

**Decisions**
1. Deterministic, metadata-based ("SQL-style") retrieval over classified rule data instead of naive RAG; output applies / does not apply / unknown. Dimitar proposed, Silvan agreed. Not one of D1–D8 (core architecture).
2. v1 passes the full applicable rule set (~10–15 rules from 87 docs of ~2k words) to the LLM as context, no second retrieval step. Silvan proposed, Dimitar agreed.
3. Primary user is the renter (eviction notice, rent increase, change alerts). Silvan proposed, Dimitar went along. Settles **D7** (tentatively).
4. Address matching: start with an existing geocoding service plus region tagging; GIS vector layers (zoning, special areas) only as an extension, possibly not needed for the renter case. Silvan proposed, Dimitar agreed.
5. Conflict/supersession linking runs as a separate pass, not at index time (index time = applicability only). Complex conflicts (local ban vs state law) are flagged with all sources shown, not decided by the LLM. Dimitar proposed, Silvan agreed.
6. Extraction with "JEF" [unclear: tool name as heard, "type-safe", "new kid on the block"], cheap parallel categories, rerun one category when adding it. Both.

**Topics discussed**
- Entry point: Silvan's prior is an MCP connector for ChatGPT plus a landing page that can render "all laws for this address" (leans **D5**, not settled).
- Dated rules: valid-from/valid-to so queries answer "as of date X"; new rules must invalidate or partially replace old ones.
- "Unknown → categorize now" feature: rerun extraction on the uncategorised set in seconds (Dimitar), a candidate for **D1** self-repair, not decided.
- Differentiation: Dimitar thinks most teams will also do filterable metadata, so deterministic retrieval alone is "not the flashiest" (touches **D6**).
- Renter-friendliness index / colour-coded map (Dimitar); Silvan: possible angle, but scope tightly.
- Postal address may not resolve district/zone (Zurich Oerlikon vs Schwamendingen example); US behaviour unverified.
- Scoring metric (held-out addresses, jurisdiction/category/citation match): Dimitar did not understand the wording yet (relates to M0 score.py calibration).

**Open questions / disagreements**
- Own web chat on top of MCP or not: Dimitar asked, left open (D5).
- Building age from public sources: Dimitar wants it, Silvan doubts it can be got reliably.
- State-preemption conflicts in scope: Silvan "maybe not going there", Dimitar "we might have to".
- GIS layers: Silvan raised the need, Dimitar questioned whether a real problem exists; deferred.
- Not discussed: D2 (TS vs Python), D3 headline, D4 Berkeley vs Hoboken, D8 mentor.

**Action items** (meeting said "next hour or so", i.e. ~22:30 CEST, which overlaps the 22:00 go/no-go)
- Dimitar: study starter data and eval metric, derive initial filter categories, present to Silvan.
- Silvan: revisit use cases / final product idea; address-to-jurisdiction matching (check US postal-to-municipality); write up this discussion.
