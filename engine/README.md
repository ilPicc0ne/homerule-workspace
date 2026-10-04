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
