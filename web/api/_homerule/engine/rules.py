"""I2 -> the evaluator's rule format.

Reads the committed interface files (out/rules.compiled.json, out/rules.json, out/findings.json), so the
engine runs from a clean checkout without the extraction's git-ignored intermediates (out/extracted/).
Each compiled record becomes the internal record engine/evaluate.py expects: compact Nodes back to
{"kind": ...} nodes (the inverse of extract/compile.py:to_node), and dates from the compiled
`effective.from/until` only (as tests/eval_suite.py:normalise_dates does), never re-derived.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
JUR = {j["id"]: j for j in json.loads(Path(ROOT / "contracts" / "jurisdictions.json").read_text(encoding="utf-8"))["jurisdictions"]}


def from_node(n):
    """Compact I2 Node -> internal node (inverse of extract/compile.py:to_node)."""
    if n is True:
        return {"kind": "always"}
    if n is False or n is None:
        return {"kind": "never"}
    if "all" in n or "any" in n:
        k = "all" if "all" in n else "any"
        return {"kind": k, "children": [from_node(c) for c in n[k]]}
    if "not" in n:
        return {"kind": "not", "children": [from_node(n["not"])]}
    if "fact" in n:
        if n["op"] == "in":
            return {"kind": "fact", "fact": n["fact"], "op": "in", "values": n["value"]}
        return {"kind": "fact", "fact": n["fact"], "op": n["op"], "value": n["value"]}
    if "age_years" in n:
        a = n["age_years"]
        return {"kind": "age_years", "fact": "built", "op": a.get("op"), "years": a.get("n")}
    if "ref" in n:
        return {"kind": "ref", "ref": n["ref"]}
    return {"kind": "unparsed", "quote": n.get("unparsed") or ""}


DOC_STATUS = {"pending": "pending", "failed": "failed"}     # everything else was enacted


def _effect(comp, bars):
    x = comp["x_source"]
    if x.get("effect"):
        return x["effect"]
    key = (comp["jurisdiction"], comp["category"], x.get("citation"))
    return "bars_or_limits_local_rules" if key in bars else "protection_or_duty"


def load(out_dir=None, origins=None):
    """Internal rule records for every compiled rule (origins: e.g. {"starter"}; None = all)."""
    out_dir = Path(out_dir or OUT)
    comps = json.loads(Path(out_dir / "rules.compiled.json").read_text(encoding="utf-8"))
    scored = {r["team_rule_id"]: r for r in json.loads(Path(out_dir / "rules.json").read_text(encoding="utf-8"))["rules"]}
    finds = load_findings(out_dir)
    bars = {(f["jurisdiction"], f["category"], f.get("citation")) for f in finds if f["kind"] == "barred_by_law"}
    rules = []
    for c in comps:
        x = c["x_source"]
        if origins and x.get("origin") not in origins:
            continue
        j = JUR.get(c["jurisdiction"], {})
        schema = j.get("schema_name") or c["jurisdiction"]
        eff = c["effective"]
        s = scored.get(c["team_rule_id"])
        inter = c.get("interaction") or {"type": "none"}
        rules.append({
            "id": c["team_rule_id"], "jurisdiction": schema, "jurisdiction_id": c["jurisdiction"],
            "level": c.get("level"), "state": schema.split(", ")[-1], "category": c["category"],
            "citation": x.get("citation"), "effect": _effect(c, bars),
            "document_status": DOC_STATUS.get(c["status"], "enacted"),
            "eff": eff,
            "events": ([{"kind": "effective", "date": eff["from"], "relative_rule": "none", "n": None}] if eff["from"] else [])
                      + ([{"kind": "repealed", "date": eff["until"], "relative_rule": "none", "n": None}] if eff["until"] else []),
            "applies_if": from_node(c["applies_if"]), "exempt_if": from_node(c["exempt_if"]),
            "key_value": c.get("key_value"),
            "key_value_conditions": [{"value": b["value"], "when": from_node(b["when"]), "tenant_note": b.get("tenant_note")}
                                     for b in c.get("key_value_conditions", [])],
            "tenant_conditions": c.get("tenant_conditions", []),
            "interactions": [] if inter.get("type") in (None, "none") else [{"type": inter["type"]}],
            "cap_low": x.get("cap_pct_low"), "cap_high": x.get("cap_pct_high"),
            "renter_impact": c.get("renter_impact"),      # direction + strength (extract/impact.py), for the score
            "parse_status": c.get("parse_status"), "checks": c.get("checks", []),
            "origin": x.get("origin") or "starter", "unit": x.get("unit"), "source_doc_id": x.get("source_doc_id"),
            "retrieved": c.get("retrieved_at"),
            # from the scored file: present only for rules with a verbatim quote
            "scored": s is not None, "quote_located": bool(s and s.get("quoted_span")),
            "requirement_quote": s.get("quoted_span") if s else None, "title": s.get("title") if s else None,
            "source_url": s.get("source_url") if s else None, "confidence": s.get("confidence") if s else None,
        })
    return rules


def load_findings(out_dir=None):
    return json.loads(Path(Path(out_dir or OUT) / "findings.json").read_text(encoding="utf-8"))
