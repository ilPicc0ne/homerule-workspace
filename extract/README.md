# extract (Dimitar)

A · Extraction: corpus → `out/rules.json` + `out/rules.compiled.json` (+ `out/findings.json`). See `docs/ARCHITECTURE.md` (A · Extraction) and interface I2.

| Module | Does |
|---|---|
| `corpus.py` | Pins every text by content hash (`build/versions/`), parses the SOURCE/RETRIEVED header, evidence tier, sections, date and boundary-phrase candidates → `out/index/`, `out/inventory.json`. No model calls. `python3 -m extract.corpus` |
| `sections.py` | Legal structure as nested sections with code-point offsets (`1950.5/c/5/A/ii`); paragraph blocks for the rest |
| `jev_pass.py` | One Jev call per document: document type and status, per-section content type and category, what each date marks |
| `luna_pass.py` | One Luna call per document (agency summaries of one city bundled): obligations with conditions, amounts, events, interactions, quotes; quotes located in the pinned text |
| `llm.py` | OpenRouter client; every call cached (`build/cache/`) and logged (`audit/calls.jsonl`) |

Key: `OPENROUTER_API_KEY` in `.env.local`. Models: `openai/gpt-6-luna`, `typesafe/jev-1.13`.
