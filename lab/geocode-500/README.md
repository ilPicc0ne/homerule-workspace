# Census geocoder on all 500 sample addresses (04.10.2026)

`geo.py` calls the Census geographies endpoint once per address (8 threads; ZIP sent for CA except SF and for MA except Cambridge, never for NJ). Raw results in `geo_results.json`.

| Result | Count |
|---|---|
| Matched the expected legal city | 485 |
| No match | 14 (SF 7, Boston 5, Hoboken 1, San Diego 1) |
| Wrong city | 1 (A0009, a Cambridge street matched in Boston) |

A retry with normalised input fixed 8 more: leading zeros in ordinals ("05TH AV" → "5TH AVE", 6 SF rows), the double address "600 JACKSON/601 HARRISON", and the ZIP for A0009. That makes 493/500. The last 7 have no house number or are unknown to Census; their city is certain from the postal city, so jurisdiction is 500/500. Rules are in `docs/ARCHITECTURE.md` (B · Address resolution).
