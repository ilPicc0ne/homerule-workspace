# Building evidence and the next useful fact

First implementation for issue #22 and the user-approved “find the one fact that
matters” feature. It supplies the data layer for an address-page investigation and
the renter-protection score. It does not change the score's formula, the shared I3
building facts, legal extraction, or scored outputs. Display integration is pending.

## Run

```sh
make enrich-buildings       # offline: replay all pinned public evidence
make fact-gaps AS_OF=2026-10-01
python3 -m unittest tests.test_fact_gaps

# Optional, explicit network refresh; bounded queries/downloads:
make enrich-buildings-live SOURCE=sdparcels
# Other SOURCE choices: la ma sf hud lihtc sd; omit SOURCE for NJ

# Once the score branch is available, use the SAME rule/fact inputs as the score:
python3 -m engine.fact_gaps --input-dir out --scores out/scores.json
```

The code uses the Python standard library. The existing full repo evaluation
requires PyYAML. `make test eval` covers the engine regression checks too.

## What the planner does

`engine/fact_gaps.py` reads I2 and I3, then uses the existing evaluator and its
effective-date gate. For each building fact it partitions the current possible
values at the actual extracted thresholds (including singleton values for `eq`,
strict inequalities and date cutoffs). It re-evaluates one fact at a time, keeping
every other unknown. It also finds conditional amounts whose coverage is known.

An unknown field alone is not enough to generate a question. At least one answer
must resolve an unresolved rule result or conditional amount. For example, an
unknown owner fact behind an already-false exception is not a useful question.
Local/state dependencies are re-evaluated together, so a local building-date
answer can also settle which state's rule yields to it.

Questions rank by the minimum number of answers resolved across all branches,
then the maximum. This is a reduction in uncertainty, not expected information
gain: no probability distribution is assumed. It is not score uplift; proving a
protection does not cover a building also resolves an uncertainty. Independent
coverage and amount questions count separately. The planner does not search
joint combinations, so “no useful single question” does not mean investigation
cannot help.

Each question has its relevant topics, source rule IDs/citations/quotes, exact
condition tests, hypothetical branches, evidence leads, and how to check it.
`research_routes.json` supplies official record-request routes for LA and San
Diego, plus the NJ source. `request_text` is a copyable records question; nothing
is sent. The output carries `as_of`, `not_legal_advice`, input hashes and assumptions.

`blockers` preserves unresolved conditions, date uncertainty and invalid nodes.
Unparsed conditions are retained for review; some may be masked by other branches
of the same rule. `tenant_notes` preserves the extraction's full tenant-condition
text even when building coverage is known. It must not be interpreted as an
automatically answerable building question. We do not introduce tenancy-duration
predicates or change the extraction vocabulary.

## Joining the renter-protection score

The optional `--scores` join reads `address:<id>[as_of]`. A question's
`unsettled_score_topics` identifies the relevant uncertain topics. `score_context`
preserves the supplied low/high/score; `score_effect` is always `not_calculated`.
The score file has no input hashes, so the caller must regenerate it from the same
I2/I3 inputs. Its file hash is recorded, and rule/fact inputs changing during a
planner run cause a failure. Do not silently combine an old score with new rules.

Consumer flow: display the original score range; offer the highest-ranked relevant
question with its evidence route; keep the branches labelled hypothetical. A later
verified fact can be passed to the owning score engine in a separate scenario.
No response, public-record match, or prototype branch is promoted here.

The “built” field currently stands in for construction/occupancy dates in I7.
An assessor year does not prove original occupancy. Even a date hypothesis that
settles the compiled predicate is not proof that a renter has a protection.
Personal tenancy conditions, unresolved law, and named data assumptions remain.

## Observed results (2026-10-04)

- On main `82ae9c8`: 500 plans, 101 addresses with a useful single-fact question;
  building date first at 100, owner occupancy first at one. These are **rule-level**
  investigations, not 101 proven improvements to the headline score.
- Also exercised against the `d/renter-impact` inputs at `c13c304`: same 101
  addresses; score context joins without changing the score implementation.
- LA example A0107: the existing 1978 year range straddles an extracted date
  cutoff. On main, a precise date settles two rule coverage results; on the score
  branch it settles three to four unresolved rule/value answers. Source versions
  explain the different counts; the thresholds are not hand-coded in this feature.
- San Diego example A0019: building date can settle one to three unresolved
  rule/value answers, while other conditions remain. With the supplied score
  snapshot it relates to both unsettled rent and eviction topics; its score remains
  50–88 here. This is an illustration of the join, not a new score computation.
- NJ pilot: 140/140 exact address + municipality matches; one lead for a missing
  unit count (A0227, `DWELL=93`), which still requires review. Most data repeats the
  starter source. **Zero facts promoted, zero claimed score improvement.**

## Acquisition and source limitations

The [NJ publisher](https://nj.gov/njgin/edata/parcels/) explicitly links the public
parcel/MOD-IV feature service. The service item is public and its terms request
attribution, warn about currency/accuracy and forbid treating parcels as survey
data. [State terms, Section F](https://www.nj.gov/nj/legal.shtml) allow copying State
information subject to specific restrictions. Attribution: NJ Office of Information
Technology, Office of GIS (NJOGIS), its listed county/municipal contributors, and
the Division of Taxation. Exact item terms are pinned in `nj-service-terms.json`.

`engine/enrich_nj.py` issues one bounded exact-address query per municipality.
The first Jersey City query returned no rows because its official label is
`JERSEY CITY CITY`; a targeted exact-address check established that spelling, then
only that batch was repeated. Zero matches are never interpreted as no protection.
No fuzzy address match, nearest parcel, owner name, owner mailing address, assessed
value or sales price is requested. Ambiguous matches and truncated responses fail
or remain unpromoted. The raw JSON responses retain only the requested fields.

The ArcGIS robots resource returned 403; this is recorded in
`nj-robots-check.txt`, not claimed as clearance. Acquisition used the explicitly
published public query API. No denial from a data endpoint was bypassed, no user
agent was disguised, and no site was crawled. A fetched robots policy that
disallows the query path stops the script. Any data-endpoint error also stops it.

Response envelopes include request URLs, retrieval times, the original transfer
hash and a reproducible canonical-response hash checked on offline replay.
`nj-modiv.json` records exact matches, source fields and record IDs. Zero/null
construction years or dwelling counts stay missing. A current assessment does not
establish a historical building fact, and parcel-level counts can cover more than
one building. Conflicts are evidence for review, never replacements of I3.

For the California gaps, [San Diego's occupancy bulletin](https://www.sandiego.gov/development-services/forms-publications/information-bulletin/585)
provides an existing-certificate request route (research fees may apply), and
[LADBS](https://www.ladbs.org/services/check-status/online-building-records) provides
online records and a research request route. These are routes, not documents already
acquired. San Diego's public approvals dataset includes alterations, expiration
and final inspection dates; it is not a substitute for original occupancy. The
county parcel service's two-character `YEAR_EFFECTIVE` is not an original building
year and was not ingested as one. No rent-registry coverage lookup was ingested.

## Remaining work

Connect the generated plan to the address page in the UI branch; retrieve and
review original occupancy evidence for a small California pilot; establish
fact-specific promotion rules with source dates and building/parcel identity;
then measure actual uncertainty and score-range reduction. The expanded acquisition below is complete for the listed snapshots; original occupancy records remain unavailable. API/schema/date
uncertainty and extraction defects must remain separate from missing public facts.

## Expanded acquisition (2026-10-04)

The second pass **downloaded records**, not just source links. `engine/enrich_public.py`
queries official APIs and filters official downloads, pins the responses, then builds
`public-evidence.json`. `make fact-gaps` consumes this combined file by default.
Each address also has `building_evidence`, including records that challenge an
existing assumption even when the engine currently has no missing-fact question.
Nothing is silently promoted to I3 or the score.

| Source | Downloaded rows retained | Address matches | What was acquired |
|---|---:|---:|---|
| LA County parcels | 86 | 79 unambiguous; 1 ambiguous | Construction years and units for up to five separate building lines, parcel ID, use code, roll year |
| MassGIS parcels | 134 | 88 unambiguous; 6 ambiguous; 16 unmatched | Construction year, units, parcel IDs, use description, fiscal year for Boston/Cambridge |
| SF assessor roll 2025 | 90 | 52 unambiguous; 26 address-range candidates; 2 ambiguous | Construction year, units, parcel identity, tax exemption proxy |
| San Diego County parcels | 51 | 49/50 | Dwelling counts and parcel/address identity; `YEAR_EFFECTIVE` retained raw, never interpreted as a year built |
| San Diego issued approvals, 2024–2026 | 6 matching permits | 3/50 | Permit IDs, dates, status, project type, parcel ID and proposed dwelling change |
| HUD multifamily properties | 8 | 5/500 | Assisted/project units, restriction flag, administrative occupancy date and record update time |
| HUD LIHTC | 14 | 6/500 | Historical program participation, project/assisted units, allocation and placed-in-service years |
| NJ MOD-IV (first pass) | 140 | 140/140 | Construction years, dwelling counts and parcel IDs |

Counts distinguish address matches from rows and usable leads. Multi-parcel matches
remain ambiguous. LA addresses with several populated building lines keep those
lines as raw evidence without guessing which building they describe. SF range/unit
addresses remain candidates. Multiple permit events are legitimate, not duplicate
parcels. Matched addresses and leads overlap between sources.

Across all sources, **444/500 addresses have at least one matched or candidate
record**, and **374/500 have a typed evidence lead**. This includes the original
NJ pilot and many values that simply repeat the starter pack. It is not a count
of resolved unknowns or improved scores.

### What is actually new or different

- HUD assistance counts challenge the assumed `subsidised=false` at **A0008**
  (Jersey City) and **A0257** (SF). A project may include more than the sample
  building, so the unit scope and legal relevance still need review.
- LIHTC records challenge the same assumption at **A0037, A0063, A0081, A0106
  and A0257**. These are historical listings, not proof of a current restriction.
  Combined with HUD, this is **six distinct addresses** needing restriction review.
- HUD and LIHTC supply potentially narrower unit counts for **A0217, A0403 and
  A0096**. Other counts conflict, which can mean different project/building scope.
- MassGIS lists **1910** at **A0366**, while I3 has **2024**. Both are retained;
  the new value is not declared correct.
- SF has two positive homeowner-exemption proxies (**A0097, A0202**). They are
  explicitly labelled `tax_exemption_proxy`, not established owner occupancy.
- Five HUD administrative occupancy dates, six LIHTC placed-in-service years and
  six SD permit events are typed separately. None becomes `built`.
- NJ `DWELL` also disagrees with some multi-unit building descriptions. Those
  records need a field-definition and parcel/building-scope check, not automatic
  replacement of the starter count.
- The 49 SD parcel unit counts and most LA/MA/SF assessor values repeat the starter
  data. **No new original California occupancy certificate was acquired.**

### Access and reproducibility

`sources.json` is the source/field allowlist. `*-metadata.json` pins relevant
field definitions, attribution and source update information where published;
`*-policy.json` records the robots check and documented public-API/download basis.
`acquisition-notes.json` records unsuccessful attempts and corrected query errors.
No data-endpoint authorization challenge was bypassed. A missing robots resource
is recorded as missing, not permission; an explicit path disallow stops acquisition.

The [SF dataset](https://data.sf.gov/d/wv5m-vpq2) and
[SD official downloads](https://data.sandiego.gov/datasets/development-permits/)
carry Open Data Commons Public Domain Dedication and License terms. MassGIS's
public item terms are pinned in `ma-terms.json`. LA and SD county data are read
through their published public query APIs, with agency attribution. HUD data comes
from its public GIS services; the LIHTC layer records a December 2024 data update,
so it is historical even though fetched today.

Long ArcGIS filters use the documented form POST query API. LIHTC uses seven
batches of at most 80 sample addresses. All queries request explicit fields and
reject API errors, truncated result sets and unrelated fields. Matching changes
only case, whitespace and common street-suffix spellings; it preserves street
numbers, ranges, fractions, unit identifiers and directions, with city/state or
municipality/ZIP checks. It never assigns the nearest parcel.

SD downloads are the three complete **issued-year slices**, processed locally;
only matching sample rows and explicit fields are retained. No permit-holder
names, owner names, mailing addresses, valuations or geometries are retained.
The selected-row snapshot has its own canonical hash; the complete download's
transport hash and number of scanned rows are also recorded. Absence from these
three slices means no matching record in those slices, not no building history.

API responses have transport and canonical hashes. LIHTC's combined response has
per-request transport hashes and a deduplicated canonical hash. Offline replay
checks hashes and query URLs before rebuilding. Plans record the combined evidence
hash, and source facts remain separate from hypotheses and legal evaluation.
These artifacts are still outside the public-export allowlist.

### Remaining acquisition gaps

- **Berkeley:** zero sample records from the HUD queries. The city's officially
  linked BESO endpoint failed with TLS EOF/empty response in Python and curl.
  No data acquired there; older permits require microfiche research via the
  [city's record service](https://berkeleyca.gov/construction-development/permits-design-parameters/permit-process/research-permit-records).
- **San Diego A0346:** `AUBURN DR` has no house number; no guessed parcel match.
- **Boston:** 15 addresses lack matched records across these sources; additional
  MA queries with house-number ranges or unit-level parcel IDs require review.
- Precise original occupancy approvals, restriction periods, current owner
  occupancy and renter tenancy duration remain unresolved. Public records do not
  establish the renter's move-in date.

For the score feature, consume `public-evidence.json.addresses[id].leads` and
`out/fact_gaps.json.addresses[id].building_evidence`. Show `meaning`, `comparison`,
source period, limitation and source link. `narrows_range` is a comparison of
numbers only, not permission to replace the fact. Use `sources` to inspect
ambiguous records. The score must continue using I3 until evidence is verified.
