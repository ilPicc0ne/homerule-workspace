"""Does the extended schema add value over the starter schema?

Arm A ("everyone else"): rule records with the starter-schema fields only; Luna decides each
address on each date from that text and the building facts. Run 3 times for stability.
Arm B (ours): the same records with the extended fields; code decides (evaluate.py).

Part (a) uses hand-written reference records for the slice (tests/fixtures/gold_slice.yaml):
can the schema carry the answers? Part (b) uses what Luna extracted (out/extracted): can we fill
it today? Expected answers: tests/fixtures/address_questions.yaml.
"""
import json
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import yaml

from extract import config, llm
from . import evaluate as E, facts as FA

FIX = config.ROOT / "tests" / "fixtures"
LAB = config.ROOT / "lab" / "schema_experiment"
RESULTS = ["applies", "unknown", "superseded", "not_yet_effective", "pending", "not_applicable"]
EMPTY = {"children": [], "fact": None, "op": None, "value": None, "values": None, "date": None, "years": None, "quote": None}


def node(n):
    """Compact fixture syntax -> full condition node."""
    if n in ("always", "never"):
        return {**EMPTY, "kind": n}
    if "all" in n or "any" in n:
        k = "all" if "all" in n else "any"
        return {**EMPTY, "kind": k, "children": [node(c) for c in n[k]]}
    if "not" in n:
        return {**EMPTY, "kind": "not", "children": [node(n["not"])]}
    if "unparsed" in n:
        return {**EMPTY, "kind": "unparsed", "quote": n["unparsed"]}
    if "age_years" in n:
        return {**EMPTY, "kind": "age_years", "fact": "built", "op": n["age_years"]["op"], "years": n["age_years"]["n"]}
    if "ref" in n:
        return {**EMPTY, "kind": "ref", "ref": n["ref"]}
    return {**EMPTY, "kind": "fact", "fact": n["fact"], "op": n["op"], "value": n.get("value"), "values": n.get("values")}


def state_of(jur):
    return jur.split(", ")[-1] if ", " in jur else jur


def load_gold():
    rules = []
    for g in yaml.safe_load(open(LAB / "gold_slice.yaml")):
        rules.append({**g, "state": state_of(g["jurisdiction"]),
                      "events": [{"date": None, "relative_rule": "none", "n": None, **e} for e in g["events"]],
                      "applies_if": node(g["applies_if"]), "exempt_if": node(g["exempt_if"]),
                      "key_value_conditions": [{"value": b["value"], "when": node(b["when"]), "tenant_note": b.get("tenant_note")}
                                               for b in g.get("key_value_conditions", [])],
                      "interactions": g.get("interactions", []), "cap_low": g.get("cap_low"), "cap_high": g.get("cap_high")})
    return rules


def load_extracted():
    rules = []
    for f in sorted((config.OUT / "extracted").glob("*.json")):
        r = json.load(open(f))
        lu = r["luna"]
        for n, o in enumerate(lu["obligations"]):
            if not o["is_headline"] or o["effect"] == "procedure_or_admin":
                continue
            rule = {"id": f"{r['doc_id']}:{n}:{o['slug']}", "doc": r["doc_id"], "jurisdiction": r["jurisdiction"],
                    "state": state_of(r["jurisdiction"]), "category": o["category"], "citation": o["citation"],
                    "effect": o["effect"], "document_status": lu["document_status"], "events": lu["events"],
                    "key_value": o["key_value"], "cap_low": o["cap_pct_low"], "cap_high": o["cap_pct_high"],
                    "applies_if": o["applies_if"], "exempt_if": o["exempt_if"],
                    "key_value_conditions": o["key_value_conditions"], "parse_status": o.get("parse_status", "ok"),
                    "interactions": o["interactions"]}
            st, _ = E.status(rule, config.DEFAULT_AS_OF)
            start, _ = E.start_date(rule)
            rule["base"] = {"title": o["title"], "requirement": o["requirement"], "key_value": o["key_value"],
                            "coverage_conditions": o["coverage_conditions"], "exemptions": o["exemptions"],
                            "interaction": "; ".join(f"{i['type']}: {i['quote']}" for i in o["interactions"]) or None,
                            "effective_date": start,
                            "status": {"in_force": "in_force", "not_yet_effective": "not_yet_effective",
                                       "pending": "pending"}.get(st, "failed")}
            rules.append(rule)
    return rules


def matches(rule, key):
    j, c, cite = rule["jurisdiction"], rule["category"], rule.get("citation", "")
    protection = rule.get("effect") != "bars_or_limits_local_rules"
    return {
        "CA-RENT": j == "CA" and c == "rent_increase_limits" and "1947.12" in cite,
        "CA-DEP": j == "CA" and c == "security_deposits" and "1950.5" in cite and "month" in (rule.get("key_value") or "").lower(),
        "SF-RENT": j == "San Francisco, CA" and c == "rent_increase_limits",
        "LA-RENT": j == "Los Angeles, CA" and c == "rent_increase_limits",
        "CA-ALG": j == "CA" and c == "algorithmic_rent_setting",
        "NJ-ALG": j == "NJ" and c == "algorithmic_rent_setting",
        "MA-ALG-S2983": rule["state"] == "MA" and c == "algorithmic_rent_setting" and "2983" in cite,
        "MA-ALG-H5222": rule["state"] == "MA" and c == "algorithmic_rent_setting" and "5222" in cite,
        "MA-RENT-CAP": rule["state"] == "MA" and c == "rent_increase_limits" and protection,
    }[key]


def pick(rules, key):
    ids = [r["id"] for r in rules if matches(r, key)]
    if key == "MA-RENT-CAP":
        return ids
    ranked = sorted((r for r in rules if r["id"] in ids),
                    key=lambda r: (r.get("cap_high") is None and not r.get("key_value"), r["id"]))
    return [r["id"] for r in ranked[:1]]


def answer(results, ids, key):
    """Collapse per-rule results to one answer for a question key."""
    if key == "MA-RENT-CAP":
        hits = [results.get(i, {}).get("result") for i in ids]
        return "applies" if any(h in ("applies", "unknown", "superseded") for h in hits) else "none"
    if not ids:
        return "missing_rule"
    res = results.get(ids[0], {})
    r = res.get("result")
    return "none" if r in (None, "not_applicable") else r


# ---------- arm B ----------
def arm_b(rules, questions, addresses):
    out = {}
    for q in questions:
        f = FA.address_facts(addresses[q["address"]])
        res = E.evaluate(rules, f, q["as_of"])
        ids = pick(rules, q["rule"])
        out[q["id"]] = {"answer": answer(res, ids, q["rule"]), "value": res.get(ids[0], {}).get("value") if ids else None,
                        "detail": {i: {k: v for k, v in res.get(i, {}).items() if k != "status"} for i in ids}}
    return out


# ---------- arm A ----------
SYSTEM_A = """You decide which housing rules apply to one building on one date, using only the rule records and
building facts given. For each rule give one result:
- applies: the rule is in force on the date and covers this building
- unknown: whether it covers this building depends on a fact that is not given
- superseded: it covers this building, but a stricter rule at another level governs instead
- not_yet_effective: enacted, but it takes effect after the date
- pending: a bill or proposal, not law
- not_applicable: it does not cover this building, or it is not in force on the date
applicable_value: the amount or limit that applies to this building (e.g. a deposit cap), or null."""


def arm_a_call(rules, addr_row, legal_city, as_of, run):
    stack = [r for r in rules if r["jurisdiction"] in (state_of(legal_city), legal_city)]
    if not stack:
        return {}
    records = [{"rule_id": r["id"], "jurisdiction": r["jurisdiction"], "category": r["category"],
                "citation": r.get("citation"), **r["base"]} for r in stack]
    building = {k: addr_row[k] for k in ("address_id", "street_address", "year_built", "units", "use_description")}
    building["legal_city"] = legal_city
    schema = {"type": "object", "additionalProperties": False, "required": ["results"], "properties": {"results": {
        "type": "array", "items": {"type": "object", "additionalProperties": False,
                                   "required": ["rule_id", "result", "governed_by", "applicable_value", "explanation"],
                                   "properties": {"rule_id": {"type": "string", "enum": [r["id"] for r in stack]},
                                                  "result": {"type": "string", "enum": RESULTS},
                                                  "governed_by": {"type": ["string", "null"]},
                                                  "applicable_value": {"type": ["string", "null"]},
                                                  "explanation": {"type": "string"}}}}}}
    user = (f"Date: {as_of}\nBuilding: {json.dumps(building)}\n\nRule records:\n{json.dumps(records, indent=1)}")
    out, _ = llm.luna([{"role": "system", "content": SYSTEM_A}, {"role": "user", "content": user}], schema,
                      "lookup", stage="experiment_arm_a", ref=f"{addr_row['address_id']}@{as_of}", run=run,
                      max_tokens=8000, reasoning="low")
    return {x["rule_id"]: x for x in out["results"]}


def arm_a(rules, questions, addresses, run):
    combos = sorted({(q["address"], q["as_of"]) for q in questions})

    def one(c):
        row = addresses[c[0]]
        city = FA.address_facts(row)["address.city"].values[0]
        return c, arm_a_call(rules, row, city, c[1], run)

    with ThreadPoolExecutor(8) as ex:
        per = dict(ex.map(one, combos))
    out = {}
    for q in questions:
        res = per[(q["address"], q["as_of"])]
        ids = pick(rules, q["rule"])
        out[q["id"]] = {"answer": answer(res, ids, q["rule"]),
                        "value": res.get(ids[0], {}).get("applicable_value") if ids else None,
                        "detail": {i: res.get(i) for i in ids}}
    return out


# ---------- scoring ----------
def value_ok(expected, got):
    if expected is None:
        return None
    if isinstance(got, dict):
        return expected == "conditional"
    s = (got or "").lower()
    one = any(t in s for t in ("one month", "1 month", "one (1) month"))
    two = any(t in s for t in ("two month", "2 month"))
    cond = two and one or any(t in s for t in ("depend", " if ", "unless", "or two"))
    return {"one_month": one and not two, "conditional": cond}[expected]


def score(questions, arm):
    rows, weighted = [], 0.0
    for q in questions:
        got = arm[q["id"]]["answer"]
        ok = got == q["expect"]
        w = 0.0
        if not ok:
            if q["expect"] in ("applies", "superseded") and got in ("none", "missing_rule"):
                w = 2.0
            elif q["expect"] == "applies" and got == "unknown":
                w = 0.5
            else:
                w = 1.0
        weighted += w
        rows.append({"id": q["id"], "expect": q["expect"], "got": got, "ok": ok,
                     "value_ok": value_ok(q.get("value"), arm[q["id"]]["value"])})
    vals = [r["value_ok"] for r in rows if r["value_ok"] is not None]
    return {"correct": sum(r["ok"] for r in rows), "n": len(rows), "weighted_errors": weighted,
            "values_correct": sum(vals), "values_n": len(vals), "rows": rows}


def run(parts=("gold", "extracted"), runs=3):
    questions = yaml.safe_load(open(FIX / "address_questions.yaml"))
    addresses = FA.load()
    report = {}
    for part in parts:
        rules = load_gold() if part == "gold" else load_extracted()
        b = arm_b(rules, questions, addresses)
        a_runs = [arm_a(rules, questions, addresses, run=k) for k in range(runs)]
        failed = {r["id"] for r in rules if r.get("parse_status") == "failed"}
        fb = {}
        for q in questions:
            ids = pick(rules, q["rule"])
            use_a = any(i in failed for i in ids) or (q["rule"] == "MA-RENT-CAP" and failed & set(ids))
            fb[q["id"]] = a_runs[0][q["id"]] if use_a else b[q["id"]]
        stable = sum(len({ar[q["id"]]["answer"] for ar in a_runs}) == 1 for q in questions)
        report[part] = {"rules": [r["id"] for r in rules], "B": score(questions, b),
                        "B_fallback": score(questions, fb), "failed_rules": sorted(failed),
                        "A": [score(questions, ar) for ar in a_runs], "A_stable_items": stable,
                        "B_detail": b, "A_detail": a_runs}
    out = LAB / "results"
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps(report, indent=1, default=str, ensure_ascii=False))
    return report


if __name__ == "__main__":
    rep = run()
    for part, r in rep.items():
        print(f"\n=== part {part}: {len(r['rules'])} rules")
        for name in ("B", "B_fallback"):
            print(f"{name:10} {r[name]['correct']}/{r[name]['n']} correct, weighted errors {r[name]['weighted_errors']}, "
                  f"values {r[name]['values_correct']}/{r[name]['values_n']}")
        print("failed rules:", r["failed_rules"])
        for k, a in enumerate(r["A"]):
            print(f"A run {k}:  {a['correct']}/{a['n']} correct, weighted errors {a['weighted_errors']}, "
                  f"values {a['values_correct']}/{a['values_n']}")
        print(f"A stable across runs: {r['A_stable_items']}/{r['B']['n']}")
        print(f"{'question':18} {'expect':18} {'B':18} " + " ".join(f"A{k:<17}" for k in range(len(r['A']))))
        for i, row in enumerate(r["B"]["rows"]):
            a = [r["A"][k]["rows"][i] for k in range(len(r["A"]))]
            mark = lambda x: ("" if x["ok"] else "✗ ") + x["got"] + ("" if x["value_ok"] in (None, True) else " (value✗)")
            print(f"{row['id']:18} {row['expect']:18} {mark(row):18} " + " ".join(f"{mark(x):18}" for x in a))
