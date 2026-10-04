"""One isolated model extraction. Invoked by pipeline; never touches scored outputs."""
import json
import sys
from pathlib import Path


def main(snapshot_path, result_path, jurisdiction):
    from extract import config, ingest, luna_pass, gate, compile as C
    from engine import rules as R
    snapshot = json.loads(Path(snapshot_path).read_text())
    stage = Path(result_path).parent / (snapshot["id"] + "-work")
    config.OUT = stage / "out"
    config.INDEX = config.OUT / "index"
    config.VERSIONS = stage / "versions"
    config.AUDIT = stage / "audit"
    for p in (config.INDEX, config.VERSIONS, config.AUDIT):
        p.mkdir(parents=True, exist_ok=True)
    # Model cache stays in this worktree's build/cache; provenance and outputs are isolated.
    from .store import digest
    doc_id = "XMON" + digest(snapshot["document"])[:12]
    path = stage / "input.txt"
    path.write_text("SOURCE: " + snapshot["metadata"]["url"] + "\nRETRIEVED: " +
                    snapshot["observed_at"] + "\n\n" + snapshot["text"], encoding="utf-8")
    ingest.index_file(path, doc_id, jurisdiction)
    record = luna_pass.extract(doc_id)
    gate.run([doc_id])
    internal = C.internal_rules(extracted_dir=config.OUT / "extracted")
    issues = list(record.get("document_problems", []))
    if record.get("quote_failures"):
        issues.append("Some extracted quotes could not be located")
    if not internal:
        issues.append("No rules extracted; absence is not treated as repeal")
    for r in internal:
        if r.get("parse_status") != "ok" or r.get("checks") or not r.get("quote_located") or r.get("stub"):
            issues.append("Incomplete extraction: " + r["id"])
        if not r.get("requirement_quote") or r["requirement_quote"] not in path.read_text():
            issues.append("Supporting quote not verbatim: " + r["id"])
    comps = [C.compiled(r) for r in internal]
    scored = [C.starter_record(r, c) for r, c in zip(internal, comps)]
    (config.OUT / "rules.compiled.json").write_text(json.dumps(comps))
    (config.OUT / "rules.json").write_text(json.dumps({"rules": [r for r in scored if r]}))
    (config.OUT / "findings.json").write_text(json.dumps([]))
    rules = R.load(config.OUT)
    if len({r["id"] for r in rules}) != len(rules):
        issues.append("Duplicate extracted rule IDs")
    for r in rules:
        r["id"] = doc_id + ":" + r["id"]
    Path(result_path).write_text(json.dumps({"snapshot_id": snapshot["id"], "rules": rules,
                                            "issues": sorted(set(issues)), "not_legal_advice": True}, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:])
