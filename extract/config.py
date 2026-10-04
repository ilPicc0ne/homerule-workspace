"""Paths, model IDs and secrets. Nothing here makes a network call."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STARTER = ROOT / "data" / "realpage-starter"
CORPUS_TEXT = STARTER / "corpus" / "text"
MANIFEST = STARTER / "corpus" / "corpus_manifest.csv"
ADDRESSES = STARTER / "data" / "sample_addresses.csv"
STARTER_SCHEMA = STARTER / "schema" / "rule_record.schema.json"

OUT = ROOT / "out"
INDEX = OUT / "index"
BUILD = ROOT / "build"          # git-ignored: pinned document versions, model-call cache
VERSIONS = BUILD / "versions"
CACHE = BUILD / "cache"
AUDIT = ROOT / "audit"

LUNA = "openai/gpt-6-luna"       # free-form structured extraction (chat completions)
JEV = "typesafe/jev-1.13"         # bounded decisions (/api/alpha/decisions)
OPENROUTER = "https://openrouter.ai/api"

DEFAULT_AS_OF = "2026-10-01"


def openrouter_key() -> str:
    import os
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    for name in (".env.local", ".env"):          # AGENTS.md: keys live in .env.local
        env = ROOT / name
        if env.exists():
            for line in env.read_text().splitlines():
                if line.strip().startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("OPENROUTER_API_KEY missing (set it in .env.local)")
