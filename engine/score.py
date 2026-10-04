"""Renter-protection score (one aggregated score, broken down per topic) and the better/worse verdict of changes.

Built only on the engine's results and each rule's renter_impact (extract/impact.py); every threshold and weight
is in contracts/impact.json and travels with the score. Per address and date, per topic:
- level: the strongest protecting rule that applies (strength vs the thresholds; presence topics are strong when a
  protection applies); a limiting rule that applies caps the topic; unknown when a protecting rule's result is
  unknown and could raise the level, reported apart with the topic's possible range;
- score: 100 x weighted mean of the known topics' levels; low/high: the unknown topics at their lowest/highest.
Cities: median over their sample addresses. States: the statewide floor (state rules only), median over the
state's sample addresses. Changes between consecutive dates: better / worse / unchanged per topic and overall.
out/scores.json, one entry per line. python3 -m engine.score
"""
import json
from pathlib import Path
from statistics import median

from engine import build as B, facts as F, rules as R

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "contracts" / "impact.json").read_text(encoding="utf-8"))
LEVEL = CFG["levels"]
ORDER = ["none", "basic", "strong"]
PREFIX = {"states": "state", "cities": "city", "addresses": "address"}


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
    w = CFG["weights"]
    known = {c: t for c, t in topics.items() if t["level"] != "unknown"}
    wk = sum(w[c] for c in known)
    score = round(100 * sum(w[c] * LEVEL[t["level"]] for c, t in known.items()) / wk) if wk else None
    low = round(100 * sum(w[c] * LEVEL[t["at_least"]] for c, t in topics.items()))
    high = round(100 * sum(w[c] * LEVEL[t["at_most"]] for c, t in topics.items()))
    return {"score": score, "low": low, "high": high,
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
        c["renter_impact"] = {"verdict": v, "topic": cat, "level_before": b[cat]["level"], "level_after": a[cat]["level"]}
    return changes


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
            res["addresses"].setdefault(aid, {})[d] = {**aggregate(t), "topics": t}
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
