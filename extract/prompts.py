"""Prompt lint and prompt freeze (AGENTS.md: no test-suite values in prompts; no prompt edits after the hour-16 drop).

The prompts are the string literals of the modules that talk to a model (system prompts, instructions, Jev
criteria). Document text is not a prompt and is never linted.

- lint():   test-suite citations, dates and key values (tests/fixtures, dev/change_tests.json) found in a
            prompt literal. Only alternatives with a digit or of two or more words count, so a topic word
            like "algorithm" is not a hit.
- digest(): one hash over all prompt literals. `make freeze` writes it to extract/PROMPTS.lock before the
            hour-16 drop; `make eval` reports whether the prompts still match the lock.
Run: python3 -m extract.prompts [--freeze]
"""
import ast
import datetime as dt
import hashlib
import json
import re
import sys

import yaml

from . import config

MODULES = ["luna_pass", "jev_pass", "jev_check", "gate", "links", "open_questions", "status", "cards"]
LOCK = config.ROOT / "extract" / "PROMPTS.lock"
FIX = config.ROOT / "tests" / "fixtures"
MIN_LEN = 30
# reviewed hits that are not test values: (test label, module) -> why
ALLOW = {("A03 citation", "jev_pass"): "the rent_increase_limits category definition uses the generic term "
                                       "'rent stabilization', not the name of LA's ordinance"}


def literals():
    """(module, line, text) for every string literal of at least MIN_LEN characters, f-string parts included."""
    out = []
    for m in MODULES:
        tree = ast.parse((config.ROOT / "extract" / f"{m}.py").read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) >= MIN_LEN:
                out.append((m, node.lineno, node.value))
    docstrings = set()
    for m in MODULES:      # module and function docstrings are not sent to a model
        tree = ast.parse((config.ROOT / "extract" / f"{m}.py").read_text(encoding="utf-8"))
        for node in [tree] + [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.ClassDef))]:
            d = ast.get_docstring(node, clean=False)
            if d:
                docstrings.add((m, d))
    return [x for x in out if (x[0], x[2]) not in docstrings]


def digest():
    return hashlib.sha256("\n\x00".join(t for _, _, t in sorted(literals())).encode()).hexdigest()


def _dates(iso):
    d = dt.date.fromisoformat(iso)
    return [iso, f"{d.strftime('%B')} {d.day}, {d.year}", f"{d.month}/{d.day}/{d.year}"]


def tokens():
    """Test-suite values as (label, regex) pairs."""
    out = []

    def alternatives(rx, label):
        for alt in rx.split("|"):
            if re.fullmatch(r"\d+", alt):          # a bare number: only as an amount or a percentage
                out.extend([(label, rf"\${alt}(?![\d.])"), (label, rf"(?<![\d.]){alt}\s?%")])
            elif re.search(r"\d", alt) or len(alt.replace("\\", "").split()) >= 2:
                out.append((label, alt))

    for a in yaml.safe_load(open(FIX / "assertions.yaml")):
        alternatives(a["cite"], f"{a['id']} citation")
        if a.get("key"):
            alternatives(a["key"], f"{a['id']} key value")
        if a.get("effective"):
            out += [(f"{a['id']} date", re.escape(x)) for x in _dates(a["effective"])]
    tests = json.load(open(config.STARTER / "dev" / "change_tests.json"))
    for t in tests if isinstance(tests, list) else tests.get("tests", []):
        for k in ("as_of", "as_of_before", "as_of_after"):
            if t.get(k):
                out += [(f"{t['test_id']} date", re.escape(x)) for x in _dates(t[k])]
    return out


def lint():
    hits = []
    lits = literals()
    for label, rx in tokens():
        for m, line, text in lits:
            if re.search(rx, text, flags=re.I):
                hits.append({"test": label, "pattern": rx, "where": f"extract/{m}.py:{line}",
                             "allowed": ALLOW.get((label, m))})
    return hits


def status():
    locked = LOCK.read_text().strip() if LOCK.exists() else None
    now = digest()
    return {"digest": now, "locked": locked, "frozen": locked is not None, "matches_lock": locked == now if locked else None}


if __name__ == "__main__":
    if "--freeze" in sys.argv:
        LOCK.write_text(digest() + "\n")
        print("prompts frozen:", digest())
    else:
        print(json.dumps(status(), indent=1))
        for h in lint():
            print("LINT", h)
