# engine (Silvan)

B · Address resolution, C · Engine, D · Change and diff → `outputs/lookups.json`, `outputs/changes.json`. See `docs/ARCHITECTURE.md` and interfaces I3, I4, I6.

| Command | Does |
|---|---|
| `make resolve` | B · `out/addresses.resolved.json` (I3), offline from `engine/cache/census` |
| `make build AS_OF=2026-10-01` | C+D · `outputs/lookups.json`, `outputs/changes.json`, `out/lookups.full.json`, `out/build_summary.json` |
| `make test` | adapter, determinism, guards, boundaries, journeys |

| Module | Does |
|---|---|
| `evaluate.py` | The one evaluator: three-valued coverage, status, precedence, conflicts (from the extraction work) |
| `rules.py` | I2 + I8 → the evaluator's rule records |
| `facts.py` | I3 → the evaluator's facts, with source and assumption per fact |
| `explain.py` | One or two plain sentences per result |
| `build.py` | CLI, status gate for month/year precision, output files, summary |

Python: `python3 -m venv .venv && .venv/bin/pip install pyyaml` (only the eval needs pyyaml); the Makefile uses `.venv/bin/python` when it exists.

## Extra data and useful next facts

`make fact-gaps` generates read-only, per-address investigation plans in
`out/fact_gaps.json`. It re-evaluates hypothetical answers using the existing
engine; it does not change I3 or score outputs. `make enrich-buildings` replays the
pinned NJ parcel evidence, and `make enrich-buildings-live` explicitly refreshes
those public API queries. See `data/building-evidence/README.md` for the source
review, limitations, score integration and commands.

`make enrich-buildings` now replays all acquired public building records into
`data/building-evidence/public-evidence.json`. Explicit refresh:
`make enrich-buildings-live SOURCE=sdparcels` (also `la ma sf hud lihtc sd`).
`make fact-gaps` reads the combined evidence by default and exposes both relevant
question leads and `building_evidence` for conflicts with known/assumed facts.
This adds evidence only; shared I3 and score values are not changed.
