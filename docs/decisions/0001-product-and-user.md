# 0001 HomeRule for renters, built on the RealPage starter pack

Date: 03.10.2026 · Decided by: Silvan Geser, Dimitar Dimitrov · Status: accepted

## Context
Hack-Nation 7, challenge "Rental Housing Law Navigator" (RealPage): for any apartment address in the covered cities (CA, NJ, MA), say which housing rules apply today, explain them with citations, and show what new or pending laws would change. 75 of 100 points are scored by the organizers' script on three output files; 25 by judges on plain language, responsible design and the path to scale.

## Decision
We build **HomeRule**: housing law compiled into checkable, dated rules. Every address gets a quoted answer (applies, superseded, not yet effective, pending) or one honest question when a fact is missing. The primary user is the **renter** facing a concrete moment: a rent increase, a deposit deduction, a fee, an eviction notice, or a change in the law.

Pitch: *A model has a training cutoff. A law has an effective date.*

## Alternatives considered
- A chatbot answering from the law texts directly: cannot know laws passed after its training and tends to guess coverage.
- Advocates, agencies or small landlords as the primary user: kept as secondary audiences.
- Other challenges of the event: weighed in a structured comparison; this one fits the team's strengths in retrieval, evaluation and process scoping.

## Consequences
- The three scored files (`rules.json`, `lookups.json`, `changes.json`) come first; the renter interface is built on top of them.
- Every interface states "Not legal advice", shows an "as of" date and separates enacted from pending law.
