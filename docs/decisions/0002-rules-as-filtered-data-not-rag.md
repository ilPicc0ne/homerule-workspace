# 0002 Rules as tagged, filterable data instead of document retrieval

Date: 03.10.2026 · Proposed by: Dimitar Dimitrov · Agreed: Silvan Geser · Status: accepted

## Context
The corpus has 87 law documents of roughly 2,000 words each across state, county and city level. Whether a rule applies depends on the exact legal jurisdiction, building facts (year built, units, owner type) and dates.

## Decision
Each document is extracted once into structured rule records tagged by jurisdiction, category, coverage conditions and validity dates (valid from, valid to). Answers come from **filtering these records like a database**, not from searching document text. Each rule evaluates per address to applies, does not apply, or unknown.

In the first version, the language model that explains an answer receives every rule that applies to the address (typically 10–15) as full context, with no second retrieval step.

## Alternatives considered
- Retrieval over document chunks (RAG): simpler to start, but coverage would be guessed per question, answers would vary between runs, and "unknown" would be hard to represent.

## Consequences
- Lookups for all addresses are deterministic and auditable.
- Adding a category means re-running extraction for that category only.
- A new law ends or partly replaces earlier rules through their validity dates, which also answers "as of" queries.
