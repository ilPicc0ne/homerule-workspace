# Resolver edge cases — live Census probe, 04.10.2026

Endpoint: `geocoder/geographies/onelineaddress`, benchmark/vintage Current, `layers=all` (19 layers returned).

| Input | Census result | What the resolver must do |
|---|---|---|
| 3515 Fillmore St, San Francisco, CA | SF city 0667000, SF County | Normal case; SF is a consolidated city-county |
| 471 Columbia Rd, Dorchester, MA | Boston city 2507000 | Postal neighbourhood → legal city; show the note |
| 4801 E 3rd St, Los Angeles, CA 90022 | **No incorporated place**; East Los Angeles CDP; LA County | **Postal city "Los Angeles" but unincorporated** → county level governs, LA city law does NOT apply |
| 20 Civic Center Plaza, Santa Ana, CA | Santa Ana city 0669000 | Covered city with no sample addresses |
| 350 5th Ave, New York, NY | New York city, Manhattan borough | Tree shown, "not covered" |
| 333 Washington St, Brookline, MA | No place; Brookline CDP; **Brookline town** (county subdivision) | NJ/MA: municipality = county subdivision when there is no incorporated place |
| 1 Harmon Plaza, Weehawken, NJ | No match | Friendly not-found; suggest checking the street |
| 3515 fillmore street apt 4b san francisco ca 94123 | Matches; unit dropped | Lowercase, "street", unit numbers are fine |
| 327 Jackson St, Hoboken, NJ **07017** | Matches Hoboken, corrects ZIP to 07030 | Wrong ZIP doesn't break the one-line call |
| Boston, MA · 90210 · asdfgh | No match | Place-only input must go through our jurisdiction list/aliases, not Census; nonsense → not found |
| 1600 Pennsylvania Ave NW, Washington, DC | Washington city / District of Columbia | Not a state in scope → not covered |

Batch-run findings (lab/geocode-500): leading-zero ordinals ("05TH AV"), double addresses ("600 JACKSON/601 HARRISON"), ranges ("322-322.5"), lot suffixes, rows without a house number (6), a street unknown to Census (21 Guerrero St), Cambridge street matching Boston without ZIP, NJ ZIPs are owner mailing ZIPs.

Still to probe: Census timeout/5xx, multiple matches, CA county subdivisions (CCDs are statistical, never a municipality), NJ townships that are also CDPs.
