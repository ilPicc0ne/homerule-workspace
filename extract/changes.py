"""Change tests (Module C): changes.json in the guide's shape, from the same evaluation as the lookups.

{test_id: {affected_address_ids, conflict_flag_address_ids, notes}}

Test types (dev/change_tests.json):
- as_of     (T1, T3): addresses whose result for the rule changes between as_of_before and as_of_after;
                      conflict flags taken at as_of_after
- boundary  (T2):     addresses where the rule applies at as_of
- pending   (T4):     addresses the bill would cover if enacted (scenario: the bill treated as enacted)
- negative  (T5):     addresses where the measure produces any result; must be empty; the measure must be
                      recorded as failed (a finding)
- ingest    (T6):     a new document: addresses whose results differ with vs without it, at its effective date

The key's rule IDs (<JUR>-<CAT>-<NN|Pn>) map to our rules by jurisdiction code and category; the mapping
is written into the notes. Address results come from the reference evaluator until the engine (I4) exists.
"""
import copy
import json
import re

from . import config, compile as C

JUR_CODE = {"CA": "CA", "NJ": "NJ", "MA": "MA", "HOB": "Hoboken, NJ", "JC": "Jersey City, NJ", "NWK": "Newark, NJ",
            "SF": "San Francisco, CA", "LA": "Los Angeles, CA", "SD": "San Diego, CA", "BERK": "Berkeley, CA",
            "SA": "Santa Ana, CA", "BOS": "Boston, MA", "CAMB": "Cambridge, MA"}
CAT_CODE = {"ALG": "algorithmic_rent_setting", "RENT": "rent_increase_limits", "DEP": "security_deposits",
            "FEE": "application_screening_fees", "SCREEN": "screening_restrictions", "EVICT": "just_cause_eviction"}


def map_key_id(key_id, rules, findings):
    """CA-ALG-01 / MA-ALG-P1 / MA-RENT-P1 -> our rule IDs (or finding) for that jurisdiction and topic."""
    m = re.fullmatch(r"([A-Z]+)-([A-Z]+)-(P?)(\d+)", key_id)
    if not m:
        return [], None
    jur, cat, pending = JUR_CODE.get(m.group(1)), CAT_CODE.get(m.group(2)), bool(m.group(3))
    cands = [r for r in rules if r["jurisdiction"] == jur and r["category"] == cat and r["effect"] == "protection_or_duty"]
    if pending:
        cands = [r for r in cands if r["document_status"] == "pending"] or cands
    n = int(m.group(4))
    picked = cands[n - 1:n] if pending and len(cands) >= n else cands[:1] if not pending else []
    jid = C.BY_SCHEMA.get(jur, {}).get("id", jur)
    found = sorted((f for f in findings if f["jurisdiction"] == jid and f["category"] == cat
                    and f["kind"] in ("measure_failed", "barred_by_law")),
                   key=lambda f: f["kind"] != ("measure_failed" if pending else "barred_by_law"))
    return [r["id"] for r in picked], (found[0] if found else None)


def enacted_scenario(rules, ids, date):
    """Hypothetical: the given pending rules treated as enacted and in force from `date`. Never stored."""
    out = []
    for r in rules:
        if r["id"] in ids:
            r = copy.deepcopy(r)
            r["document_status"] = "enacted"
            r["events"] = [{"kind": "effective", "date": date, "relative_rule": "none", "n": None}]
        out.append(r)
    return out


def run_tests(tests, rules, findings, addresses, evaluate, facts_for):
    """tests: dev/change_tests.json entries (plus T6 when given). Returns changes.json content."""
    out = {}
    cache = {}

    def results(rule_set, tag, date):
        key = (tag, date)
        if key not in cache:
            cache[key] = {a: evaluate(rule_set, facts_for(a), date) for a in addresses}
        return cache[key]

    for t in tests:
        ids, finding = [], None
        mapping = {}
        for k in t.get("rule_ids", []):
            our, f = map_key_id(k, rules, findings)
            mapping[k] = our or (f and f"finding:{f['kind']}") or "not found"
            ids += our
            finding = finding or f
        affected, flagged, notes = set(), set(), [f"key rule IDs -> ours: {mapping}"]
        kind = t["type"]
        if kind == "as_of":
            before, after = results(rules, "base", t["as_of_before"]), results(rules, "base", t["as_of_after"])
            for a in addresses:
                for i in ids:
                    rb, ra = before[a].get(i, {}).get("result"), after[a].get(i, {}).get("result")
                    if rb != ra:
                        affected.add(a)
                    if after[a].get(i, {}).get("conflict_with"):
                        flagged.add(a)
        elif kind == "boundary":
            now = results(rules, "base", t["as_of"])
            for a in addresses:
                if any(now[a].get(i, {}).get("result") == "applies" for i in ids):
                    affected.add(a)
        elif kind == "pending":
            now = results(rules, "base", t["as_of"])
            pending_now = {a for a in addresses if all(now[a].get(i, {}).get("result") == "pending" for i in ids)}
            scen = results(enacted_scenario(rules, set(ids), t["as_of"]), f"enact:{t['test_id']}", t["as_of"])
            affected = {a for a in addresses if any(scen[a].get(i, {}).get("result") in ("applies", "unknown")
                                                    for i in ids)}
            notes.append(f"pending today at {len(pending_now)} addresses; affected set = addresses the bill(s) "
                         f"would cover if enacted (hypothetical, never stored)")
        elif kind == "negative":
            now = results(rules, "base", t["as_of"])
            affected = {a for a in addresses if any(now[a].get(i, {}).get("result") for i in ids)}
            notes.append("measure recorded as " + (f"{finding['kind']} ({finding.get('citation') or finding['source_doc_ids']})"
                                                   if finding else "NOT RECORDED (no finding)"))
        elif kind == "ingest":
            base, new = t["rules_before"], t["rules_after"]
            for d in t["dates"]:
                b, n = results(base, "before_ingest", d), results(new, f"after_ingest:{t['test_id']}", d)
                for a in addresses:
                    listed = lambda res: {k: v["result"] for k, v in res.items() if v.get("result")}
                    if listed(b[a]) != listed(n[a]):
                        affected.add(a)
            notes.append(f"new document effective {t.get('effective')}; compared at {t['dates']}")
        out[t["test_id"]] = {"affected_address_ids": sorted(affected), "conflict_flag_address_ids": sorted(flagged),
                             "notes": "; ".join(notes)}
    return out
