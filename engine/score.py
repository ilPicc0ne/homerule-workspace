"""Renter-protection score (one aggregated score, broken down per topic) and the better/worse verdict of changes.

Built only on the engine's results and each rule's renter_impact (extract/impact.py); every threshold and weight
is in contracts/impact.json and travels with the score. Per address and date, per topic:
- level: the strongest protecting rule that applies (strength vs the thresholds; presence topics are strong when a
  protection applies); a limiting rule that applies caps the topic; unknown when a protecting rule's result is
  unknown and could raise the level, reported apart with the topic's possible range;
- score: 100 x weighted mean of the topics' levels, unknown topics at their lowest (what a renter can count on);
  high: the unknown topics at their highest ("up to").
Cities: median over their sample addresses. States: the statewide floor (state rules only), median over the
state's sample addresses. Changes between consecutive dates: better / worse / unchanged per topic and overall.
out/scores.json, one entry per line. python3 -m engine.score
"""
import json
from pathlib import Path
from statistics import median

import copy

from engine import build as B, explain as X, facts as F, rules as R

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "contracts" / "impact.json").read_text(encoding="utf-8"))
LEVEL = CFG["levels"]
ORDER = ["none", "basic", "strong"]
PREFIX = {"states": "state", "cities": "city", "addresses": "address"}
FACT_VALUES = {f["name"]: ([True, False] if f["type"] == "bool" else f["values"] if f["type"] == "enum" else None)
               for f in json.loads((ROOT / "contracts" / "facts.json").read_text(encoding="utf-8"))["facts"]}


def rule_level(rule):
    """The level a protecting rule gives its topic on its own."""
    ri = rule.get("renter_impact") or {}
    cat = rule["category"]
    if cat in CFG["presence_topics"]:
        kinds = CFG.get("kind_levels", {}).get(cat)
        if kinds:
            return kinds.get(ri.get("kind"), kinds["default"])
        return CFG["presence_topics_level"]
    s, t = ri.get("strength"), CFG["thresholds"].get(cat)
    if not s or not t:
        return CFG["without_a_number"]
    v = s["value"]
    return "strong" if v <= t["strong_at_most"] else "basic" if v <= t["basic_at_most"] else "none"


def topic_levels(rows, rules_by_id):
    """Engine rows for one address on one date -> {topic: {level, possible, rules, limited_by}}."""
    out = {}
    for cat in CFG["weights"]:
        best, possible, used, limits = "none", "none", [], []
        for row in rows:
            rule = rules_by_id[row["team_rule_id"]]
            if rule["category"] != cat:
                continue
            direction = (rule.get("renter_impact") or {}).get("direction", "protects")
            if direction == "limits" and row["result"] == "applies":
                limits.append(rule["id"])
            if direction != "protects":
                continue
            lv = rule_level(rule)
            if row["result"] in ("applies", "superseded"):   # superseded: a stricter local rule governs, also listed
                if ORDER.index(lv) > ORDER.index(best):
                    best = lv
                used.append(rule["id"])
            if row["result"] in ("applies", "superseded", "unknown") and ORDER.index(lv) > ORDER.index(possible):
                possible = lv
        if limits and ORDER.index(best) > ORDER.index(CFG["limiting_rule_caps_at"]):
            best = CFG["limiting_rule_caps_at"]
        level = best if possible == best else "unknown"
        out[cat] = {"level": level, "at_least": best, "at_most": possible, "rules": sorted(used), "limited_by": limits}
    return out


def aggregate(topics):
    """score: the protection a renter can count on (unknown topics at their lowest, so score = low); high: with the
    unknown topics at their highest ("up to"). Never a mean over the known topics only: that put the score above
    its own range when a topic like eviction depends on facts the data doesn't have (e.g. whether the owner lives there)."""
    w = CFG["weights"]
    low = round(100 * sum(w[c] * LEVEL[t["at_least"]] for c, t in topics.items()))
    high = round(100 * sum(w[c] * LEVEL[t["at_most"]] for c, t in topics.items()))
    return {"score": low, "low": low, "high": high,
            "unknown_topics": sorted(c for c, t in topics.items() if t["level"] == "unknown")}


def verdict(before, after):
    """Topic levels at two dates -> better / worse / unchanged per topic and overall (unclear if unknowns move)."""
    per = {}
    for cat in CFG["weights"]:
        b, a = before[cat], after[cat]
        if "unknown" in (b["level"], a["level"]):
            per[cat] = "unchanged" if (b["at_least"], b["at_most"]) == (a["at_least"], a["at_most"]) else "unclear"
        else:
            d = ORDER.index(a["level"]) - ORDER.index(b["level"])
            per[cat] = "better" if d > 0 else "worse" if d < 0 else "unchanged"
    moved = {v for v in per.values() if v != "unchanged"}
    overall = "unchanged" if not moved else moved.pop() if len(moved) == 1 else "mixed"
    return overall, per


NOUN = {"rent_increase_limits": "yearly rent increase cap", "security_deposits": "security deposit limit",
        "application_screening_fees": "application fee cap"}
PRESENCE = {   # (topic, kind) -> what covers the home, for topics without a number
    ("just_cause_eviction", "grounds"): "Just-cause eviction protection",
    ("just_cause_eviction", "procedure"): "Eviction notice rules (not just cause)",
    ("just_cause_eviction", None): "Eviction protection",
    ("algorithmic_rent_setting", "ban"): "A ban on rent-setting software",
    ("algorithmic_rent_setting", "disclosure"): "A disclosure rule for rent-setting software",
    ("algorithmic_rent_setting", None): "A rule on rent-setting software",
    ("screening_restrictions", None): "Tenant screening protections",
}
TOPIC_WORDS = {"rent_increase_limits": "rent increase protection", "just_cause_eviction": "eviction protection",
               "security_deposits": "deposit protection", "application_screening_fees": "application fee protection",
               "screening_restrictions": "screening protection", "algorithmic_rent_setting": "rent-setting software protection"}


def _amount(st):
    v = st["value"]
    v = int(v) if float(v).is_integer() else v
    return {"%/year": f"{v}%", "months of rent": f"{v} month{'s' if v != 1 else ''}' rent", "$": f"${v}"}[st["unit"]]


def _lead(topic, rules_by_id):
    """The rule that sets a topic's level: highest level, then the lowest number."""
    rs = [rules_by_id[i] for i in topic["rules"] if i in rules_by_id]
    if not rs:
        return None
    key = lambda r: (-ORDER.index(rule_level(r)), ((r.get("renter_impact") or {}).get("strength") or {}).get("value", 1e9))
    return sorted(rs, key=key)[0]


def _numbered(topic, rules_by_id):
    """(rule, strength) with the best number among the topic's rules, or None (numbers decide numbered topics)."""
    rs = [(rules_by_id[i], (rules_by_id[i].get("renter_impact") or {}).get("strength")) for i in topic["rules"]
          if i in rules_by_id]
    rs = [x for x in rs if x[1]]
    return min(rs, key=lambda x: x[1]["value"]) if rs else None


def _cov(cat, rule):
    if cat in NOUN:
        st = (rule.get("renter_impact") or {}).get("strength")
        if st and st.get("from") == "kind: ban":
            return "A ban on application fees"
        return f"A {_amount(st)} {NOUN[cat]}" if st else f"A {NOUN[cat]}"
    kind = (rule.get("renter_impact") or {}).get("kind")
    return PRESENCE.get((cat, kind)) or PRESENCE.get((cat, None))


def _missing_words(rows, cat, rules_by_id):
    facts, text = [], False
    for row in rows:
        if rules_by_id[row["team_rule_id"]]["category"] == cat and row["result"] == "unknown":
            for m in row.get("missing") or []:
                if m.startswith("unparsed: "):
                    text = True
                elif X.FACT_NOUN.get(m, m) not in facts:
                    facts.append(X.FACT_NOUN.get(m, m))
    if facts:
        return "Depends on " + " and ".join(facts[:2]) + ", which our data doesn't have."
    if text:
        return "Depends on an exception in the law's text that our building data can't check."
    return "Depends on facts our data doesn't have."


def why(cat, verdict, b, a, change, before_rows, after_rows, rules_by_id):
    """One plain sentence, built only from the fields that decided the verdict (levels, the leading rules, their
    numbers and citations, the missing facts). Never advice; no model."""
    if verdict == "unclear":
        if change.get("conflict_flag_changed"):
            return "A state law may limit the city rule here; this overlap is not decided."
        return _missing_words(after_rows, cat, rules_by_id) if a["level"] == "unknown" else \
            _missing_words(before_rows, cat, rules_by_id)
    lb, la = _lead(b, rules_by_id), _lead(a, rules_by_id)
    if verdict == "unchanged":
        other = next((x for x in (lb, la) if x and x["id"] != change["team_rule_id"]), None)
        if other:
            return f"No change in {TOPIC_WORDS[cat]}: {other['citation']} already gives this protection."
        return f"No change in {TOPIC_WORDS[cat]} for this home."
    if a["limited_by"] and not b["limited_by"]:
        return f"An exemption ({rules_by_id[a['limited_by'][0]]['citation']}) now limits {TOPIC_WORDS[cat]} here."
    if b["limited_by"] and not a["limited_by"]:
        return f"An exemption ({rules_by_id[b['limited_by'][0]]['citation']}) no longer limits {TOPIC_WORDS[cat]} here."
    nb, na = _numbered(b, rules_by_id), _numbered(a, rules_by_id)
    if cat in NOUN and na and na[1].get("from") == "kind: ban" and not (nb and nb[1].get("from") == "kind: ban"):
        return f"Application fees are now banned for this home ({na[0]['citation']})."
    if cat in NOUN and nb and nb[1].get("from") == "kind: ban" and not (na and na[1].get("from") == "kind: ban"):
        return f"Application fees are no longer banned for this home ({nb[0]['citation']})."
    if cat in NOUN and nb and na and nb[1]["value"] != na[1]["value"]:
        return f"The {NOUN[cat]} goes from {_amount(nb[1])} to {_amount(na[1])} ({na[0]['citation']})."
    if cat in NOUN and na and not nb and la and la["id"] == na[0]["id"]:
        return f"The {NOUN[cat]} is now {_amount(na[1])} ({na[0]['citation']})." if lb else \
            f"{_cov(cat, la)} now covers this home ({la['citation']})."
    if la and (not lb or b["at_least"] == "none"):
        cov = _cov(cat, la)
        return f"{cov} now covers this home ({la['citation']})."
    if lb and (not la or a["at_least"] == "none"):
        cov = _cov(cat, lb)
        return f"{cov} no longer covers this home ({lb['citation']})."
    word = "stronger" if verdict == "better" else "weaker"
    return f"{TOPIC_WORDS[cat].capitalize()} gets {word}: {_cov(cat, lb).lower()} becomes {_cov(cat, la).lower()} ({la['citation']})."


def annotate_changes(changes, before_rows, after_rows, rules_by_id):
    """Layer 2: each change of one address gets renter_impact = better / worse / unchanged / unclear for its topic,
    from the topic's level before and after (so a law replaced by a newer version is judged by the levels, not by
    the two rule IDs). A change that adds or removes a conflict flag stays unclear: a possible override is never
    decided."""
    b, a = topic_levels(before_rows, rules_by_id), topic_levels(after_rows, rules_by_id)
    _, per = verdict(b, a)
    for c in changes:
        cat = rules_by_id[c["team_rule_id"]]["category"]
        v = "unclear" if c.get("conflict_flag_changed") else per[cat]
        used = sorted(set(b[cat]["rules"]) | set(a[cat]["rules"]) | set(b[cat]["limited_by"]) | set(a[cat]["limited_by"])
                      | {c["team_rule_id"]})
        c["renter_impact"] = {
            "verdict": v, "topic": cat, "level_before": b[cat]["level"], "level_after": a[cat]["level"],
            "why": why(cat, v, b[cat], a[cat], c, before_rows, after_rows, rules_by_id),
            "decided_by": {"verdict": "code",
                           "direction": {i: (rules_by_id[i].get("renter_impact") or {}).get("decided_by", "code")
                                         for i in used if i in rules_by_id}},
            "inputs": {"rules_before": b[cat]["rules"], "rules_after": a[cat]["rules"],
                       "limited_by_before": b[cat]["limited_by"], "limited_by_after": a[cat]["limited_by"],
                       "range_before": [b[cat]["at_least"], b[cat]["at_most"]],
                       "range_after": [a[cat]["at_least"], a[cat]["at_most"]],
                       "conflict_flag_changed": bool(c.get("conflict_flag_changed"))}}
    return changes


def _full_text(rule, start):
    """The engine names a text-only condition by its first 60 characters: the full text from the rule."""
    def walk(n):
        if isinstance(n, dict):
            if n.get("kind") == "unparsed":
                yield n.get("quote") or ""
            for c in n.get("children") or []:
                yield from walk(c)
    return next((q for q in (*walk(rule.get("applies_if")), *walk(rule.get("exempt_if"))) if q.startswith(start)), start)


def open_questions(rec, d, rows, topics, rules, by_id):
    """For each unknown topic: the building facts that would settle it, where to check each, and the topic level and
    score for each possible answer (the engine re-run with that one fact set; code only); the exemptions only the
    law's text states; and the tenant conditions of its rules (never inputs, notes for the reader)."""
    out = {}
    for cat, t in topics.items():
        if t["level"] != "unknown":
            continue
        facts, text = [], []
        for row in rows:
            if by_id[row["team_rule_id"]]["category"] != cat or row["result"] != "unknown":
                continue
            for m in row.get("missing") or []:
                if m.startswith("unparsed: "):
                    m = _full_text(by_id[row["team_rule_id"]], m[len("unparsed: "):])
                    if m not in text:
                        text.append(m)
                elif m not in facts:
                    facts.append(m)
        asked = []
        for f in facts:
            q = {"fact": f, "check": X.HOW_TO_CHECK.get(f)}
            if FACT_VALUES.get(f) and (rec.get("facts") or {}).get(f) is None:
                q["answers"] = {}
                for v in FACT_VALUES[f]:
                    r2 = copy.deepcopy(rec)
                    r2["facts"][f] = v
                    t2 = topic_levels(B.build_lookups(rules, {rec["address_id"]: r2}, d)[rec["address_id"]], by_id)
                    a2 = aggregate(t2)
                    q["answers"][json.dumps(v)] = {"level": t2[cat]["level"], "score": a2["score"], "high": a2["high"]}
            asked.append(q)
        notes = sorted({n for row in rows if by_id[row["team_rule_id"]]["category"] == cat
                        and row["result"] in ("applies", "superseded", "unknown")
                        for n in by_id[row["team_rule_id"]].get("tenant_conditions") or []})
        out[cat] = {"facts": asked, "text_exemptions": text, "tenant_notes": notes}
    return out


def build(dates=None):
    dates = dates or CFG["dates"]
    rules = R.load()
    by_id = {r["id"]: r for r in rules}
    addresses = F.load()
    state_rules = [r for r in rules if r.get("level") == "state"]
    res = {"addresses": {}, "cities": {}, "states": {}}
    floor = {}
    for d in dates:
        rows = B.build_lookups(rules, addresses, d)
        srows = B.build_lookups(state_rules, addresses, d)
        for aid, rs in rows.items():
            t = topic_levels(rs, by_id)
            res["addresses"].setdefault(aid, {})[d] = {**aggregate(t), "topics": t,
                                                       "open": open_questions(addresses[aid], d, rs, t, rules, by_id)}
            floor.setdefault(aid, {})[d] = aggregate(topic_levels(srows[aid], by_id))
    for d in dates:
        by_city, by_state = {}, {}
        for aid, rec in addresses.items():
            js = rec.get("jurisdictions") or {}
            s = res["addresses"][aid][d]["score"]
            if js.get("city") and s is not None:
                by_city.setdefault(js["city"], []).append(s)
            if js.get("state") and floor[aid][d]["score"] is not None:
                by_state.setdefault(js["state"], []).append(floor[aid][d]["score"])
        for c, v in by_city.items():
            res["cities"].setdefault(c, {})[d] = {"median": median(v), "addresses": len(v)}
        for st, v in by_state.items():
            res["states"].setdefault(st, {})[d] = {"statewide_floor_median": median(v), "addresses": len(v)}
    for aid, per_date in res["addresses"].items():           # change between consecutive dates
        for d0, d1 in zip(dates, dates[1:]):
            overall, per = verdict(per_date[d0]["topics"], per_date[d1]["topics"])
            per_date[d1]["change_from_previous"] = {"from": d0, "overall": overall, "topics": per,
                                                     "score_delta": None if None in (per_date[d0]["score"], per_date[d1]["score"])
                                                     else per_date[d1]["score"] - per_date[d0]["score"]}
    return res


def write(res):
    lines = [f'"method": {json.dumps({k: CFG[k] for k in CFG if not k.startswith("_")}, sort_keys=True)}',
             '"not_legal_advice": true']
    for part in ("states", "cities", "addresses"):
        for k in sorted(res[part]):
            lines.append(f'"{PREFIX[part]}:{k}": {json.dumps(res[part][k], sort_keys=True)}')
    (ROOT / "out" / "scores.json").write_text("{\n" + ",\n".join(lines) + "\n}\n")


if __name__ == "__main__":
    r = build()
    write(r)
    for st, v in sorted(r["states"].items()):
        print(st, {d: x["statewide_floor_median"] for d, x in v.items()})
    for c, v in sorted(r["cities"].items()):
        print(c, {d: x["median"] for d, x in v.items()})
