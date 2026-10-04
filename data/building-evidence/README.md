# Building evidence and the next useful fact

First implementation for issue #22 and the user-approved “find the one fact that
matters” feature. It supplies the data layer for an address-page investigation and
the renter-protection score. It does not change the score's formula, the shared I3
building facts, legal extraction, or scored outputs. Display integration is pending.

## Run

```sh
make enrich-buildings       # offline: replay the three pinned NJ API responses
make fact-gaps AS_OF=2026-10-01
python3 -m unittest tests.test_fact_gaps

# Optional, explicit network refresh; only fixed sample addresses:
make enrich-buildings-live

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
then measure actual uncertainty and score-range reduction. API/schema/date
uncertainty and extraction defects must remain separate from missing public facts.
