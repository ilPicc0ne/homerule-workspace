# HomeRule

**Your rights as a renter, for your exact address.**

> **Not legal advice.** HomeRule shows which published housing rules may apply to an address, with quotes and dates. It does not tell anyone what to do and is not a compliance certification.

**A model has a training cutoff. A law has an effective date.**

HomeRule compiles state, county and city housing law into checkable, dated rules. Every address gets a quoted answer (applies, superseded, not yet effective, pending) or one honest question when a fact is missing. The same engine serves renters on the web and AI assistants through MCP.

Built at Hack-Nation 7 (Zurich hub, 03.–04.10.2026) for the RealPage challenge "Rental Housing Law Navigator" by Silvan Geser and Dimitar Dimitrov.

## Status

Work in progress. Submission: Sun 04.10.2026, 15:00 CEST.

## Repository layout (planned)

| Path | What |
|---|---|
| `extract/` | Rule extraction from the law corpus (Python) |
| `engine/` | Rule engine: coverage, dates, statuses, precedence (TypeScript or Python, decision D2) |
| `outputs/` | `rules.json`, `lookups.json`, `changes.json` |
| `web/` | Renter page and MCP route (Next.js on Vercel) |
| `data/realpage-starter/` | Original starter pack, tracked in this workspace; excluded from the public submission copy |
| `notes/`, `lab/` | Private workspace only: plans, meetings, ideas, experiments (not in the public repo) |

## Docs

Product docs: [docs/](docs/README.md).

## Setup

1. The workspace includes the RealPage starter pack in [`data/realpage-starter/`](data/realpage-starter/README.md). Its 65 files match the downloaded ZIP; provenance and archive checksum are in `data/realpage-starter.provenance.json`. This version excludes the scoring script, dev answer key and hour-16 ordinance. In the filtered public submission copy, obtain the pack separately and place it at the same path.
2. Further steps follow as the build lands.
