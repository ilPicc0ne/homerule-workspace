"""Plain explanations for one lookup: one or two sentences naming the deciding facts and where they came from.

Rule text never decides here: the evaluator has already decided; this walks the same conditions to find
which facts settled the answer (true/false leaves) or left it open (unknown leaves), and says so.
Never "compliant", "illegal", "you should" or "legal advice" (AGENTS.md); the disclaimer lives on the page.
"""
import datetime as dt

from engine import evaluate as E

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]

ASSUMPTION_TEXT = {
    "no_recorded_affordability_restriction": "assumed: no affordability restriction on record",
    "boston_land_use_A_is_7_plus": "assumed: Boston land use A means 7 or more units",
    "boston_elderly_home_is_apartment": "assumed: Boston elderly home counted as apartments",
    "subsidised_housing_counts_as_apartment": "subsidised building counted as apartments",
}

# where a tenant can settle a fact the data doesn't have
HOW_TO_CHECK = {
    "built": "the certificate-of-occupancy date (city building department or the landlord)",
    "units": "the number of units in the building (county assessor record or the landlord)",
    "use_class": "what kind of building it is (county assessor record)",
    "subsidised": "whether the building has a subsidy or affordability restriction (city housing department)",
    "owner_type": "who owns the building, a person or a company (county recorder, or the owner named on the lease)",
    "owner_occupied": "whether the owner lives in the building (ask the landlord)",
}

FACT_NOUN = {"built": "the build date", "units": "the unit count", "use_class": "the building type",
             "subsidised": "whether the building is subsidised", "owner_type": "who owns the building",
             "owner_occupied": "whether the owner lives there"}


def fmt_date(d):
    d = dt.date.fromisoformat(d[:10])
    return f"{MONTHS[d.month - 1]} {d.day}, {d.year}"


def place(rule):
    j = rule["jurisdiction"]
    return {"CA": "California", "NJ": "New Jersey", "MA": "Massachusetts"}.get(j, j.split(", ")[0])


def leaves(node, ctx, out):
    """Collect (leaf node, truth) for every fact/age/unparsed/ref leaf under node."""
    k = node.get("kind")
    if k in ("all", "any", "not"):
        for c in node.get("children") or []:
            leaves(c, ctx, out)
    elif k in ("fact", "date_fact", "age_years", "unparsed", "ref"):
        out.append((node, E.ev(node, ctx)))
    return out


def fact_phrase(key, fact):
    if key == "built":
        y0, y1 = fact.lo[:4], fact.hi[:4]
        s = f"built {y0}" if y0 == y1 else f"built {y0}–{y1}"
    elif key == "units":
        s = (f"{fact.lo} units" if fact.lo == fact.hi else
             f"{fact.lo} or more units" if fact.hi is None else f"{fact.lo}–{fact.hi} units")
    elif key == "use_class":
        s = fact.values[0].replace("_", " ") + " building"
    elif key == "subsidised":
        s = "subsidised" if fact.values[0] else "not subsidised"
    else:
        s = f"{key.replace('_', ' ')} {fact.values[0]}"
    src = fact.source or ""
    if fact.assumption and "assumed" not in src:
        note = ASSUMPTION_TEXT.get(fact.assumption, f"assumed: {fact.assumption}")
        src = f"{src}; {note}" if src else note
    return f"{s} ({src})" if src else s


def leaf_phrase(node, truth, facts, as_of):
    """'built 1926 (year_built, DataSF), before the June 13, 1979 cutoff'."""
    k = node["kind"]
    key = "built" if k == "age_years" else node.get("fact")
    fact = facts.get(key)
    if k == "age_years":
        a = dt.date.fromisoformat(as_of)
        cutoff = a.replace(year=a.year - int(node["years"] or 0)).isoformat()
        n = node["years"]
        if fact.hi < cutoff:
            return f"{fact_phrase('built', fact)}, over {n} years ago"
        if fact.lo > cutoff:
            return f"{fact_phrase('built', fact)}, under {n} years ago"
        return f"{fact_phrase('built', fact)}, too close to the {n}-year age limit ({fmt_date(cutoff)}) to tell"
    if key == "built" and isinstance(node.get("value"), str):
        side = {"le": "on or before", "lt": "before", "ge": "on or after", "gt": "after"}.get(node["op"], node["op"])
        if truth is None:
            return f"{fact_phrase('built', fact)}, but the cutoff is {side} {fmt_date(node['value'])} and the year alone can't settle it"
        rel = "before" if fact.hi <= node["value"] else "after"
        return f"{fact_phrase('built', fact)}, {rel} the {fmt_date(node['value'])} cutoff"
    return fact_phrase(key, fact)


def _join(parts):
    parts = list(dict.fromkeys(parts))
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def _cap(s):
    return s[:1].upper() + s[1:]


def value_note(rule, res, facts, as_of, refs=None):
    """' Which amount applies depends on the unit count (not in the data). Check …' for a conditional value, else ''.

    Walks the value branches as evaluate.select_value does (in order, up to the first true one) and names the
    leaves left open, so an explanation never reads as settled while the value is not."""
    v = res.get("value")
    if not isinstance(v, dict) or "conditional" not in v:
        return ""
    open_, checks = [], []
    for b in rule.get("key_value_conditions", []):
        ctx = E.Ctx(facts, as_of, refs or {})
        t = E.ev(b["when"], ctx)
        if t is True:
            break
        if t is False:
            continue
        for n, t in leaves(b["when"], ctx, []):
            if t is not None:
                continue
            key = "built" if n["kind"] == "age_years" else n.get("fact")
            if n["kind"] == "unparsed":
                open_.append("a condition in the text we can't check from the data")
            elif n["kind"] == "ref":
                open_.append("whether local " + n["ref"].replace("local_", "").replace("_", " ") + " covers the unit")
            elif key in facts and facts[key].known:
                open_.append(leaf_phrase(n, None, facts, as_of))
                checks.append(HOW_TO_CHECK.get(key))
            else:
                open_.append(f"{FACT_NOUN.get(key, key)} (not in the data)")
                checks.append(HOW_TO_CHECK.get(key))
    open_ = list(dict.fromkeys(open_)) or [_join(FACT_NOUN.get(k, k) for k in v.get("depends_on", [])) or "a condition"]
    s = f" Which amount applies depends on {_join(open_[:2])}."
    checks = [c for c in dict.fromkeys(checks) if c]
    if checks:
        s += f" Check {_join(checks[:2])}."
    return s


def explain(rule, res, facts, as_of, rules_by_id, refs=None, flags=None):
    """One or two sentences for the lookup row."""
    cite = rule.get("citation") or rule["id"]
    result = res["result"]
    since = rule["eff"]["from"]
    if result == "pending":
        return f"{cite} is a bill, not law: pending, so it doesn't cover this address yet."
    if result == "not_yet_effective":
        s = f"{cite} is enacted but takes effect {fmt_date(since)}" if since else f"{cite} is enacted but not yet in effect"
        if res.get("conflict_with"):
            s += f"; it may conflict with {place(rules_by_id[res['conflict_with'][0]])}'s own rule, flagged for review, not decided"
        return s + "."
    ctx = E.Ctx(facts, as_of, refs or {})
    ls = leaves(rule["applies_if"], ctx, []) + leaves(rule["exempt_if"], ctx, [])
    decided = [(n, t) for n, t in ls if t is not None and n["kind"] in ("fact", "date_fact", "age_years")]
    open_ = [(n, t) for n, t in ls if t is None]
    if result == "superseded":
        gov = rules_by_id.get(res.get("governed_by"))
        g = (gov.get("citation") if gov else None) or res.get("governed_by")
        why = []
        if gov:
            gls = leaves(gov["applies_if"], ctx, []) + leaves(gov["exempt_if"], ctx, [])
            why = [leaf_phrase(n, t, facts, as_of) for n, t in gls
                   if t is not None and n["kind"] in ("fact", "date_fact", "age_years")]
        s = f"Covered by {cite}, but the stricter local {g} governs here"
        return s + (f": {_join(why)}." if why else ".")
    if result == "applies":
        note = value_note(rule, res, facts, as_of, refs)
        rank = {"built": 0, "age_years": 0, "units": 1, "subsidised": 2, "use_class": 3}
        decided = sorted(decided, key=lambda nt: rank.get(nt[0].get("fact") or nt[0]["kind"], 9))
        why = [leaf_phrase(n, t, facts, as_of) for n, t in decided][:2]
        level = "Statewide" if ", " not in rule["jurisdiction"] else "Citywide"
        if why:
            s = f"{cite} covers this address: {_join(why)}."
        else:
            # the claim is about coverage only; an open value branch is named right after it (value_note)
            s = f"{level} {place(rule)} rule in force" + (f" since {fmt_date(since)}" if since else "") \
                + f" ({cite}); no building condition in it excludes this address" \
                + (", but the amount is not settled." if note else ".")
        s += note
        if res.get("conflict_with"):
            s += f" May conflict with {_join([rules_by_id[c].get('citation') or c for c in res['conflict_with']])}: flagged for human review, not decided."
        return s
    # unknown
    flags = flags or {}
    if "in_effective_month" in flags:
        return f"{cite} takes effect during {flags['in_effective_month']}; the exact day isn't in the source, so on this date it is unknown."
    straddle, absent, local, unparsed, checks = [], [], [], [], []
    if any(i.get("type") in ("yields_to_local", "exempt_where_local_rule_stricter") for i in rule.get("interactions", [])):
        city = facts["address.city"].values[0]
        for o in sorted(rules_by_id.values(), key=lambda o: o["id"]):
            if o["jurisdiction"] == city and o["category"] == rule["category"] and o["id"] != rule["id"] \
                    and o.get("effect") != "bars_or_limits_local_rules" and E.status(o, as_of)[0] == "in_force":
                octx = E.Ctx(facts, as_of, refs or {})
                if E.coverage(o, octx) is None:
                    ols = leaves(o["applies_if"], octx, []) + leaves(o["exempt_if"], octx, [])
                    why = [leaf_phrase(n, None, facts, as_of) for n, t in ols
                           if t is None and n["kind"] in ("fact", "date_fact", "age_years")
                           and facts.get("built" if n["kind"] == "age_years" else n.get("fact"))]
                    local.append(f"whether the local {o.get('citation') or o['id']} covers the unit, which would govern instead"
                                 + (f" ({_join(why)})" if why else ""))
                    checks += [HOW_TO_CHECK.get("built" if n["kind"] == "age_years" else n.get("fact")) for n, t in ols if t is None]
    for n, _ in open_:
        k = n["kind"]
        key = "built" if k == "age_years" else n.get("fact")
        if k == "unparsed":
            unparsed.append(f"a condition in the text we can't check from the data (\"{(n.get('quote') or '')[:70].strip()}…\")")
        elif k == "ref":
            local.append("whether local " + n["ref"].replace("local_", "").replace("_", " ") + " covers the unit")
        elif key in facts and facts[key].known:
            straddle.append(leaf_phrase(n, None, facts, as_of))
            checks.append(HOW_TO_CHECK.get(key))
        else:
            absent.append(FACT_NOUN.get(key, key))
            checks.append(HOW_TO_CHECK.get(key))
    absent = list(dict.fromkeys(absent))
    if absent:
        absent = [f"{_join(absent)} ({'neither is' if len(absent) == 2 else 'none is' if len(absent) > 2 else 'not'} in the data)"]
    reasons = list(dict.fromkeys(straddle + absent + local + unparsed)) or \
        ["whether a local rule covers this unit (its coverage is unknown)"]
    s = f"Unknown whether {cite} covers this address: depends on {'; and on '.join(reasons[:2])}."
    note = value_note(rule, res, facts, as_of, refs)
    checks = [c for c in dict.fromkeys(checks) if c]
    if checks:
        s += f" Check {_join(checks[:2])}."
    return s + note
