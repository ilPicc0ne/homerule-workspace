"""make eval: one report over the full corpus (PRD acceptance checks A1-A4, issue #5).

1. Integrity: quotes located verbatim, parse_status, remaining check failures.
2. Assertions (A1): the rules the brief names, with status, key value and dates.
3. Coverage matrix: 13 jurisdictions x 6 categories -> rule / finding / gap / empty.
4. Change tests T1-T5 over all 500 addresses, against the expected set sizes.
5. Address questions: the 24 tuning questions and the 16 held-out ones.

Address results use the reference evaluator in lab/schema_experiment/evaluate.py until the engine
(interface I4) exists. Run: python3 -m tests.eval_suite [--supplemental]
"""
import datetime as dt
import json
import re
import sys
from collections import Counter, defaultdict

import yaml

from extract import changes as CH, compile as C, config
from lab.schema_experiment import evaluate as E, facts as FA

FIX = config.ROOT / "tests" / "fixtures"
JURS = [j for j in C.JUR if j.get("rules")]
CATS = list(C.CAT_CODE)

RULES = {   # question key -> (jurisdiction schema_name, category, citation regex)
    "CA-RENT": ("CA", "rent_increase_limits", r"1947\.12"),
    "SF-RENT": ("San Francisco, CA", "rent_increase_limits", r"."),
    "LA-RENT": ("Los Angeles, CA", "rent_increase_limits", r"."),
    "CA-DEP": ("CA", "security_deposits", r"1950\.5"),
    "CA-ALG": ("CA", "algorithmic_rent_setting", r"16729|325|cartwright"),
    "NJ-ALG": ("NJ", "algorithmic_rent_setting", r"FAIR|2026.*43|56:9"),
    "MA-ALG-S2983": ("MA", "algorithmic_rent_setting", r"2983"),
    "MA-ALG-H5222": ("MA", "algorithmic_rent_setting", r"5222"),
    "SD-ALG": ("San Diego, CA", "algorithmic_rent_setting", r"98\.110|."),
    "BERK-ALG": ("Berkeley, CA", "algorithmic_rent_setting", r"."),
    "SF-ALG": ("San Francisco, CA", "algorithmic_rent_setting", r"."),
    "HOB-ALG": ("Hoboken, NJ", "algorithmic_rent_setting", r"."),
    "JC-ALG": ("Jersey City, NJ", "algorithmic_rent_setting", r"."),
    "NJ-DEP": ("NJ", "security_deposits", r"46:8"),
    "MA-DEP": ("MA", "security_deposits", r"186|15B"),
    "NJ-FEE": ("NJ", "application_screening_fees", r"405|2025|46:8-18"),
    "MA-BROKER": ("MA", "application_screening_fees", r"87DDD|broker"),
    "CA-SCREEN": ("CA", "screening_restrictions", r"12955|FEHA|329|source of income"),
    "NJ-SCREEN": ("NJ", "screening_restrictions", r"fair chance|46:8-5[2-9]|46:8-6|110"),
    "NJ-EVICT": ("NJ", "just_cause_eviction", r"2A:18-61"),
    "SF-EVICT": ("San Francisco, CA", "just_cause_eviction", r"37\.9|."),
}


def normalise_dates(rules):
    """The evaluator reads events; give it the compiled from/until so both agree."""
    for r in rules:
        eff = C.effective(r["events"], r["state"], r.get("provision"))
        r["eff"] = eff
        r["events"] = ([{"kind": "effective", "date": eff["from"], "relative_rule": "none", "n": None}] if eff["from"] else []) + \
                      ([{"kind": "repealed", "date": eff["until"], "relative_rule": "none", "n": None}] if eff["until"] else [])
    return rules


def find(rules, jur, cat, cite, protections_only=True):
    hits = [r for r in rules if r["jurisdiction"] == jur and r["category"] == cat
            and re.search(cite, r["citation"] or "", re.I)
            and (r["effect"] == "protection_or_duty" or not protections_only)]
    return sorted(hits, key=lambda r: (not r.get("key_value"), r["id"]))


# ---------- 1 integrity ----------
def integrity(extracted_dirs):
    rows = []
    for d in extracted_dirs:
        for f in sorted(d.glob("*.json")):
            r = json.load(open(f))
            if r["doc_id"].startswith("S") and not SUPPLEMENTAL[0]:
                continue
            obs = r["luna"]["obligations"]
            n_quotes = len(r["spans"]) + len(r["quote_failures"])
            rows.append({"unit": r["doc_id"], "obligations": len(obs), "quotes": n_quotes,
                         "quotes_located": len(r["spans"]),
                         "failed": sum(o.get("parse_status") == "failed" for o in obs),
                         "partial": sum(o.get("parse_status") == "partial" for o in obs)})
    return rows


# ---------- 2 assertions ----------
def assertions(rules, finds):
    out = []
    for a in yaml.safe_load(open(FIX / "assertions.yaml")):
        res = {"id": a["id"], "want": a["status"], "rule": None, "checks": []}
        if a["status"] == "finding":
            jid = C.BY_SCHEMA.get(a["jur"], {}).get("id", a["jur"])
            hit = [f for f in finds if f["jurisdiction"] == jid and f["category"] == a["cat"]
                   and re.search(a["cite"], f.get("citation") or "", re.I)]
            res["got"] = "finding" if hit else "missing"
            res["ok"] = bool(hit)
            out.append(res)
            continue
        hits = find(rules, a["jur"], a["cat"], a["cite"])
        if not hits:
            res.update(got="missing", ok=False)
            out.append(res)
            continue
        r = hits[0]
        st = C.status(r["document_status"], r["eff"])
        got = {"enacted_not_effective": "not_yet_effective"}.get(st, st)
        res.update(rule=r["id"], got=got, origin=r["origin"])
        ok = got == a["status"]
        if a.get("key") and not re.search(a["key"], r.get("key_value") or "", re.I):
            res["checks"].append(f"key_value {r.get('key_value')!r} !~ {a['key']}")
            ok = False
        if a.get("effective") and r["eff"]["from"] != a["effective"]:
            res["checks"].append(f"effective {r['eff']['from']} != {a['effective']}")
            ok = False
        if not r.get("quote_located"):
            res["checks"].append("quote not located verbatim")
            ok = False
        res["ok"] = ok
        out.append(res)
    return out


# ---------- 3 coverage matrix ----------
def matrix(rules, finds):
    grid = {}
    for j in JURS:
        for c in CATS:
            rs = [r for r in rules if r["jurisdiction"] == j["schema_name"] and r["category"] == c
                  and r["effect"] == "protection_or_duty"]
            fs = [f for f in finds if f["jurisdiction"] == j["id"] and f["category"] == c]
            grid[(j["id"], c)] = ("rule" if rs else "finding" if any(f["kind"] != "not_in_corpus" for f in fs)
                                  else "gap" if fs else "empty")
    return grid


# ---------- 4 change tests ----------
def run_addresses(rules, addresses, dates):
    out = {}
    for aid, row in addresses.items():
        f = FA.address_facts(row)
        out[aid] = {d: E.evaluate(rules, f, d) for d in dates}
    return out


def ids_for(rules, key):
    jur, cat, cite = RULES[key]
    hits = find(rules, jur, cat, cite)
    return [h["id"] for h in hits[:1]]


def change_tests(rules, addresses, res):
    city = {a: FA.address_facts(r)["address.city"].values[0] for a, r in addresses.items()}
    by_state = defaultdict(set)
    for a, c in city.items():
        by_state[c.split(", ")[-1]].add(a)

    def result(a, d, key):
        ids = ids_for(rules, key)
        return res[a][d].get(ids[0], {}).get("result") if ids else "missing_rule"

    def flagged(a, d, key):
        ids = ids_for(rules, key)
        return bool(ids and res[a][d].get(ids[0], {}).get("conflict_with"))

    out = {}
    t1 = {a for a in by_state["CA"] if result(a, "2025-12-31", "CA-ALG") == "not_yet_effective"
          and result(a, "2026-01-02", "CA-ALG") == "applies"}
    out["T1"] = {"expected": len(by_state["CA"]), "got": len(t1)}
    hob = {a for a in addresses if result(a, "2026-10-01", "HOB-ALG") == "applies"}
    jc = {a for a in addresses if result(a, "2026-10-01", "JC-ALG") == "applies"}
    want_hob = {a for a, c in city.items() if c == "Hoboken, NJ"}
    want_jc = {a for a, c in city.items() if c == "Jersey City, NJ"}
    newark = {a for a, c in city.items() if c == "Newark, NJ"}
    out["T2"] = {"expected": f"Hoboken {len(want_hob)} / Jersey City {len(want_jc)} / Newark 0",
                 "got": f"Hoboken {len(hob & want_hob)} (+{len(hob - want_hob)} wrong) / Jersey City "
                        f"{len(jc & want_jc)} (+{len(jc - want_jc)} wrong) / Newark {len((hob | jc) & newark)}",
                 "ok": hob == want_hob and jc == want_jc}
    t3 = {a for a in by_state["NJ"] if result(a, "2026-10-01", "NJ-ALG") == "not_yet_effective"
          and result(a, "2027-07-02", "NJ-ALG") == "applies"}
    t3f = {a for a in by_state["NJ"] if flagged(a, "2027-07-02", "NJ-ALG")}
    out["T3"] = {"expected": f"{len(by_state['NJ'])} flip, {len(want_hob | want_jc)} conflict flags",
                 "got": f"{len(t3)} flip, {len(t3f & (want_hob | want_jc))} flags (+{len(t3f - want_hob - want_jc)} wrong)",
                 "ok": len(t3) == len(by_state["NJ"]) and t3f == want_hob | want_jc}
    t4 = {a for a in by_state["MA"] if result(a, "2026-10-01", "MA-ALG-S2983") == "pending"
          and result(a, "2026-10-01", "MA-ALG-H5222") == "pending"}
    out["T4"] = {"expected": len(by_state["MA"]), "got": len(t4)}
    t5 = set()
    for a in by_state["MA"]:
        for rid, r in res[a]["2026-10-01"].items():
            rule = next(x for x in rules if x["id"] == rid)
            if rule["category"] == "rent_increase_limits" and r.get("result") in ("applies", "unknown", "superseded"):
                t5.add(a)
    out["T5"] = {"expected": 0, "got": len(t5)}
    for k in ("T1", "T4", "T5"):
        out[k]["ok"] = out[k]["got"] == out[k]["expected"]
    return out


# ---------- 4b changes.json in the guide's shape, T1-T6 ----------
def changes_json(rules, finds, addresses, all_rules):
    tests = json.load(open(config.STARTER / "dev" / "change_tests.json"))
    city = {a: FA.address_facts(r)["address.city"].values[0] for a, r in addresses.items()}
    in_state = lambda st: {a for a, c in city.items() if c.split(", ")[-1] == st}
    in_city = lambda c: {a for a, x in city.items() if x == c}
    expected = {"T1": (in_state("CA"), set()), "T2": (in_city("Hoboken, NJ") | in_city("Jersey City, NJ"), set()),
                "T3": (in_state("NJ"), in_city("Hoboken, NJ") | in_city("Jersey City, NJ")),
                "T4": (in_state("MA"), set()), "T5": (set(), set())}
    x = [r for r in all_rules if r["origin"] == "ingested"]
    if x:   # T6 rehearsal on the synthetic ordinance, if it has been ingested
        eff = min(C.effective(r["events"], r["state"], r.get("provision"))["from"] or "9999" for r in x)
        before = normalise_dates([dict(r) for r in rules])
        after = normalise_dates([dict(r) for r in rules + x])
        tests.append({"test_id": "T6", "type": "ingest", "rules_before": before, "rules_after": after,
                      "dates": [(dt.date.fromisoformat(eff) + dt.timedelta(days=1)).isoformat()], "effective": eff})
        units = {a for a in in_city("Cambridge, MA") if (lambda f: f.known and f.lo >= 6)(
            FA.address_facts(addresses[a]).get("units", FA.UNKNOWN))}
        expected["T6"] = (units, set())
    out = CH.run_tests(tests, rules, finds, list(addresses), E.evaluate, lambda a: FA.address_facts(addresses[a]))
    report = {}
    for tid, v in out.items():
        want, want_flags = expected.get(tid, (set(), set()))
        got, flags = set(v["affected_address_ids"]), set(v["conflict_flag_address_ids"])
        shape_ok = set(v) == {"affected_address_ids", "conflict_flag_address_ids", "notes"}
        report[tid] = {"expected": len(want), "got": len(got), "missing": len(want - got), "extra": len(got - want),
                       "flags_expected": len(want_flags), "flags_got": len(flags & want_flags),
                       "flags_extra": len(flags - want_flags), "shape_ok": shape_ok, "notes": v["notes"][:300],
                       "ok": got == want and flags == want_flags and shape_ok}
    (config.OUT / "changes.json").write_text(json.dumps(out, indent=1))
    return report


# ---------- 5 address questions ----------
def value_ok(expected, got):
    if expected is None:
        return None
    if isinstance(got, dict):
        return expected == "conditional"
    s = (got or "").lower()
    return {"one_month": ("one month" in s or "1 month" in s) and "two" not in s,
            "one_and_half": "1.5" in s or "one and one-half" in s or "one and one half" in s,
            "conditional": False}[expected]


def questions(rules, addresses, res, path):
    out = []
    for q in yaml.safe_load(open(path)):
        if q["rule"] == "MA-RENT-CAP":
            hits = [rid for rid, r in res[q["address"]][q["as_of"]].items()
                    if next(x for x in rules if x["id"] == rid)["category"] == "rent_increase_limits"
                    and r.get("result") in ("applies", "unknown", "superseded")]
            got, value = ("applies" if hits else "none"), None
        else:
            ids = ids_for(rules, q["rule"])
            r = res[q["address"]][q["as_of"]].get(ids[0], {}) if ids else {}
            got = "missing_rule" if not ids else (r.get("result") or "none")
            value = r.get("value")
        out.append({"id": q["id"], "expect": q["expect"], "got": got, "ok": got == q["expect"],
                    "value_ok": value_ok(q.get("value"), value)})
    return out


SUPPLEMENTAL = [False]


def run(supplemental=False):
    SUPPLEMENTAL[0] = supplemental
    dirs = [config.OUT / "extracted"]
    all_rules = C.internal_rules(dirs[0])
    rules = [r for r in all_rules if r["origin"] == "starter" or (supplemental and r["origin"] == "supplemental")]
    rules = normalise_dates(rules)
    finds = C.findings(rules)
    addresses = FA.load()
    dates = ["2025-12-31", "2026-01-02", "2026-04-30", "2026-10-01", "2027-07-02", "2030-01-02"]
    res = run_addresses(rules, addresses, dates)
    report = {
        "rules": len(rules), "integrity": integrity(dirs), "assertions": assertions(rules, finds),
        "matrix": {f"{k[0]}|{k[1]}": v for k, v in matrix(rules, finds).items()},
        "changes": change_tests(rules, addresses, res),
        "changes_json": changes_json(rules, finds, addresses, all_rules),
        "questions_tuning": questions(rules, addresses, res, FIX / "address_questions.yaml"),
        "questions_holdout": questions(rules, addresses, res, FIX / "address_questions_holdout.yaml"),
    }
    out = config.OUT / "eval"
    out.mkdir(parents=True, exist_ok=True)
    name = "report_supplemental" if supplemental else "report"
    (out / f"{name}.json").write_text(json.dumps(report, indent=1, default=str))
    (out / f"{name}.md").write_text(markdown(report))
    return report


def markdown(rep):
    L = ["# Eval report", ""]
    integ = rep["integrity"]
    q, ql = sum(r["quotes"] for r in integ), sum(r["quotes_located"] for r in integ)
    L += [f"**Integrity:** {len(integ)} units, {sum(r['obligations'] for r in integ)} obligations, quotes located "
          f"{ql}/{q} ({100 * ql / max(q, 1):.1f}%), parse_status failed {sum(r['failed'] for r in integ)}, "
          f"partial {sum(r['partial'] for r in integ)}. Headline rules compiled: {rep['rules']}.", ""]
    a = rep["assertions"]
    L += [f"## Assertions (A1): {sum(x['ok'] for x in a)}/{len(a)}", "", "| id | want | got | notes |", "|---|---|---|---|"]
    L += [f"| {x['id']} | {x['want']} | {'✓ ' if x['ok'] else '✗ '}{x['got']} | {'; '.join(x['checks'])} |" for x in a]
    m = rep["matrix"]
    cnt = Counter(m.values())
    L += ["", f"## Coverage matrix: rule {cnt['rule']}, finding {cnt['finding']}, gap {cnt['gap']}, empty {cnt['empty']} (of {len(m)})", "",
          "| jurisdiction | " + " | ".join(c.split('_')[0] for c in CATS) + " |", "|---|" + "---|" * len(CATS)]
    for j in JURS:
        L.append(f"| {j['id']} | " + " | ".join(m[f"{j['id']}|{c}"] for c in CATS) + " |")
    L += ["", "## Change tests", "", "| test | expected | got |", "|---|---|---|"]
    L += [f"| {k} | {v['expected']} | {'✓ ' if v['ok'] else '✗ '}{v['got']} |" for k, v in rep["changes"].items()]
    L += ["", "## changes.json (guide shape), T1-T6", "", "| test | expected addresses | got | missing | extra | flags (exp/got/extra) | shape | notes |",
          "|---|---|---|---|---|---|---|---|"]
    L += [f"| {k} | {v['expected']} | {'✓ ' if v['ok'] else '✗ '}{v['got']} | {v['missing']} | {v['extra']} | "
          f"{v['flags_expected']}/{v['flags_got']}/{v['flags_extra']} | {'✓' if v['shape_ok'] else '✗'} | {v['notes'][:120]} |"
          for k, v in rep["changes_json"].items()]
    for name in ("questions_tuning", "questions_holdout"):
        qs = rep[name]
        vals = [x["value_ok"] for x in qs if x["value_ok"] is not None]
        L += ["", f"## {name.replace('_', ' ')}: {sum(x['ok'] for x in qs)}/{len(qs)}, values {sum(vals)}/{len(vals)}", "",
              "| id | expect | got |", "|---|---|---|"]
        L += [f"| {x['id']} | {x['expect']} | {'✓ ' if x['ok'] else '✗ '}{x['got']}{'' if x['value_ok'] in (None, True) else ' (value ✗)'} |" for x in qs]
    return "\n".join(L)


if __name__ == "__main__":
    rep = run(supplemental="--supplemental" in sys.argv)
    print(markdown(rep))
