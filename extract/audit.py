"""Curated audit trail per rule (the rule page's "reasoning boundary") and one log line per build.

out/audit.json, one entry per compiled rule, keyed by team_rule_id:
- source:  the document version, URL, retrieval time and the verbatim quote;
- model:   what Luna extracted (requirement, key value, conditions, dates as stated) - model judgement;
- checks:  what verified it - code checks, Jev cross-check overrides, the gate's answers with confidence,
           Jev's triage of unparsed conditions;
- code:    what code decided from that - status, effective dates and how they were derived, status evidence,
           open questions; the evaluator then decides each address from these and the building facts;
- calls:   the model calls behind the rule (stage, model, request hash, cost), from audit/calls.jsonl.
audit/builds.jsonl gets one line per build: time, git SHA, prompt digest, rule and finding counts.
"""
import json
import subprocess
import time

from . import config, prompts

PIPELINE_STAGES = ("luna_extract", "luna_extract_fallback_model", "luna_repair", "jev_J1", "jev_J2", "jev_J3",
                   "jev_J4", "jev_J5", "jev_J6", "jev_J7", "jev_J8", "jev_triage", "jev_merge_headline", "gate",
                   "gate_topic", "jev_status_corroboration", "open_questions", "jev_open_question_sources")
BOUNDARY = ("The model (Luna) read the law and wrote the requirement, key value, conditions and dates as stated; "
            "Jev checked the closed fields and the gate checked each claim against its quote. Code decided the "
            "status, the effective dates and, per address, whether the rule applies from the building's facts.")


def _calls():
    path = config.AUDIT / "calls.jsonl"
    latest = {}
    if path.exists():
        for line in open(path):
            c = json.loads(line)
            if c["stage"] in PIPELINE_STAGES:
                latest[(c["stage"], c["ref"])] = c          # the call in use: the last one per stage and ref
    return list(latest.values())


def _triaged(node, out):
    if node.get("triaged"):
        out.append({"condition": node.get("quote"), "jev": node["triaged"]})
    for c in node.get("children") or []:
        _triaged(c, out)
    return out


def _git_sha():
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=config.ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        return None


def build(rules, comps, findings, open_questions):
    calls = _calls()
    units = {}
    out = {}
    for r, c in zip(rules, comps):
        unit = r["unit"]
        if unit not in units:
            units[unit] = json.load(open(config.EXTRACTED / f"{unit}.json"))
        rec = units[unit]
        n = int(r["id"].split(":")[1])
        o = rec["luna"]["obligations"][n]
        answers = (rec.get("gate") or {}).get("answers", {})
        gate = {k: {"choice": answers[k]["choice"], "confidence": answers[k]["confidence"]}
                for k in (f"g1_req_{n}", f"g1_key_{n}", f"g2_{n}", "g4", f"g5_{n}") if k in answers}
        refs = set(rec["doc_ids"]) | {unit}
        mine = [x for x in calls if x["ref"] in refs or x["ref"].split(":")[0] in refs]
        out[c["team_rule_id"]] = {
            "team_rule_id": c["team_rule_id"], "internal_id": r["id"], "jurisdiction": c["jurisdiction"],
            "category": c["category"], "citation": r["citation"], "refiled_from": r.get("refiled_from"),
            "source": {"doc_id": r["source_doc_id"], "url": r["source_url"], "retrieved": r["retrieved"],
                       "version_id": rec["version_ids"][rec["doc_ids"].index(r["source_doc_id"])]
                       if r["source_doc_id"] in rec["doc_ids"] else None,
                       "quote": r["requirement_quote"], "quote_verbatim": r["quote_located"], "origin": r["origin"]},
            "model": {"requirement": o["requirement"], "key_value": o["key_value"],
                      "key_value_quote": o.get("key_value_quote"), "category": o["category"], "effect": o["effect"],
                      "applies_if": o["applies_if"], "exempt_if": o["exempt_if"],
                      "key_value_conditions": o["key_value_conditions"], "tenant_conditions": o["tenant_conditions"],
                      "dates_as_stated": [{k: e.get(k) for k in ("kind", "date", "relative_rule", "applies_to", "quote")}
                                          for e in rec["luna"]["events"]]},
            "checks": {"code_checks": o.get("checks", []), "gate": gate, "gate_flags": o.get("gate_flags", []),
                       "jev_overrides": [x for x in rec.get("jev_overrides") or [] if x.get("obligation") == o["slug"]],
                       "triaged_conditions": _triaged(o["applies_if"], []) + _triaged(o["exempt_if"], []),
                       "parse_status": c["parse_status"]},
            "code": {"status": c["status"], "effective": c["effective"],
                     "status_evidence": c["x_source"].get("status_evidence"), "interaction": c["interaction"],
                     "open_questions": [q for q in open_questions.get((r["jurisdiction"], r["category"]), [])],
                     "renter_impact": c.get("renter_impact"),
                     "exemption_fixes": [x for x in r.get("checks", []) if x.startswith("exempt_if: '")]},
            "calls": sorted(({k: x.get(k) for k in ("stage", "ref", "model", "request_hash", "seconds", "cost", "ts")}
                             for x in mine), key=lambda x: x["ts"]),
            "boundary": BOUNDARY,
        }
    return out


def one_per_line(d):
    """A JSON object with one key per line (sorted), so a rebuild diffs by changed entries, not reshuffled lines."""
    return "{\n" + ",\n".join(f"{json.dumps(k, ensure_ascii=False)}: {json.dumps(d[k], ensure_ascii=False, sort_keys=True)}"
                              for k in sorted(d)) + "\n}\n"


def log_build(n_rules, n_findings):
    config.AUDIT.mkdir(exist_ok=True)
    with open(config.AUDIT / "builds.jsonl", "a") as f:
        f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "kind": "build",
                            "git_sha": _git_sha(), "prompt_digest": prompts.digest(),
                            "rules": n_rules, "findings": n_findings}) + "\n")
