"""Demo-only ingest trigger: make demo-change [DOC=<path>] [JUR="Cambridge, MA"] [ID=X001]

ingest (extract/ingest.py: index, extraction, gate; model calls cached by request hash) -> the new document's
rules compiled to I2 in memory -> engine before/after at the as-of date -> engine/diff.py -> out/changes.full.json
(the build's date sources plus this ingest source) -> prints the changed addresses and the preview URLs.

It never writes outputs/ nor the committed I2 files (out/rules*.json): the document is not added to the
scored rules, and its index and extraction records are removed afterwards, as make rehearse does.
`make build` rewrites out/changes.full.json without the demo source.
A fictional document (the synthetic X001 fixture, or a header saying FICTIONAL) is labelled
"Demo: fictional ordinance" in every change, so the change log and the email preview say so.
No model call is faked: without OPENROUTER_API_KEY and without a cached extraction it stops and says so.
"""
import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from engine import diff as D, facts as F, rules as R

ROOT = R.ROOT
SYNTHETIC = ROOT / "tests" / "fixtures" / "synthetic"
DEFAULT_DOC = SYNTHETIC / "X001.txt"
PREVIEW = "http://localhost:3000/changes/{}"


def is_fictional(path):
    path = Path(path).resolve()
    head = path.read_text(encoding="utf-8")[:400]
    return SYNTHETIC.resolve() in path.parents or "FICTIONAL" in head.upper()


def to_engine_rules(new_internal, out_dir=None):
    """Extraction records (extract/compile.py internal format) -> engine rules, through the same I2 shape the
    build reads (compiled + scored record), in a temp copy of out/. The committed files are not touched."""
    from extract import compile as C
    out_dir = Path(out_dir or R.OUT)
    tmp = Path(tempfile.mkdtemp(prefix="demo-change-"))
    try:
        comps = json.loads((out_dir / "rules.compiled.json").read_text(encoding="utf-8"))
        scored = json.loads((out_dir / "rules.json").read_text(encoding="utf-8"))
        ids = set()
        for r in new_internal:
            comp = C.compiled(r)
            comps.append(comp)
            ids.add(comp["team_rule_id"])
            rec = C.starter_record(r, comp)
            if rec:
                scored["rules"].append(rec)
        (tmp / "rules.compiled.json").write_text(json.dumps(comps), encoding="utf-8")
        (tmp / "rules.json").write_text(json.dumps(scored), encoding="utf-8")
        shutil.copy(out_dir / "findings.json", tmp / "findings.json")
        return [r for r in R.load(tmp) if r["id"] in ids]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_extraction(path, jurisdiction, doc_id):
    """The hour-16 ingest without the corpus rebuild (extract.compile.build would need every extraction)."""
    from extract import config, ingest
    config.INDEX.mkdir(parents=True, exist_ok=True)
    config.VERSIONS.mkdir(parents=True, exist_ok=True)
    try:
        return ingest.ingest(str(path), jurisdiction, doc_id)
    finally:
        for p in (config.INDEX / f"{doc_id}.json", config.OUT / "extracted" / f"{doc_id}.json"):
            p.unlink(missing_ok=True)


def apply(new_rules, document, as_of, demo, out_dir=None, addresses=None):
    """Engine rules of the new document -> out/changes.full.json content (date sources + this ingest)."""
    base = R.load(out_dir)
    addresses = addresses or F.load()
    cache = {}
    srcs = D.build_sources(base, addresses, as_of)
    srcs.append(D.ingest_source(base, new_rules, addresses, as_of, document, demo=demo, cache=cache))
    return D.assemble(srcs, addresses, as_of), srcs[-1]


def report(full, src):
    sid, meta, changes = src
    tag = f" [{meta['demo_label']}]" if meta["demo_label"] else ""
    print(f"{sid}{tag}: {len(changes)} address(es) changed, rules {', '.join(meta['rule_ids']) or '-'}")
    for aid in sorted(changes)[:25]:
        parts = [f"{c['team_rule_id']} {(c['before'] or {}).get('result') or 'not listed'} -> "
                 f"{(c['after'] or {}).get('result') or 'not listed'}" for c in changes[aid]]
        print(f"  {aid}  {full['addresses'][aid]['label']}: {'; '.join(parts)}")
    if len(changes) > 25:
        print(f"  … and {len(changes) - 25} more")
    for aid in (["A0010"] if "A0010" in changes else []) + sorted(changes)[:1]:
        print(f"preview: {PREVIEW.format(aid)}")
        break


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("path", nargs="?", default=str(DEFAULT_DOC))
    p.add_argument("--jurisdiction", default="Cambridge, MA")
    p.add_argument("--id", default="X001")
    p.add_argument("--as-of", default="2026-10-01")
    a = p.parse_args(argv)
    demo = is_fictional(a.path)
    try:
        res = run_extraction(a.path, a.jurisdiction, a.id)
    except RuntimeError as e:
        if "OPENROUTER_API_KEY" in str(e):
            print(f"demo-change: no extraction for {a.id}. The model calls are not cached here (build/cache) and "
                  f"OPENROUTER_API_KEY is not set (.env.local). Nothing was faked and nothing was written.",
                  file=sys.stderr)
            return 2
        raise
    if not res["new_rules"]:
        print(f"demo-change: {a.id} produced no rules; out/changes.full.json unchanged.", file=sys.stderr)
        return 1
    new = to_engine_rules(res["new_rules"])
    document = {"doc_id": a.id, "path": str(Path(a.path).resolve().relative_to(ROOT)) if ROOT in Path(a.path).resolve().parents else Path(a.path).name,
                "effective": res["effective"], "fictional": demo}
    full, src = apply(new, document, a.as_of, demo)
    (R.OUT / "changes.full.json").write_text(D.dump(full), encoding="utf-8")
    report(full, src)
    print("reset: make build (rewrites out/changes.full.json without the demo), then cd web && npm run sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
