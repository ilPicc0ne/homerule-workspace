"""Deterministic evaluation of extended rule records against address facts at an as-of date.

Three-valued logic (True / False / None = unknown) over fact ranges. Pure: no I/O, no model calls.
"""
import datetime as dt

T, F, U = True, False, None


def _num(x):
    if isinstance(x, str):
        try:
            return dt.date.fromisoformat(x[:10]).toordinal()
        except ValueError:
            return None
    return x


def compare(lo, hi, op, v, values=None):
    """Truth of (fact op v) when the fact lies somewhere in [lo, hi] (None = unbounded)."""
    lo, hi, v = _num(lo), _num(hi), _num(v)
    lo_ = float("-inf") if lo is None else lo
    hi_ = float("inf") if hi is None else hi
    if op == "le":
        return T if hi_ <= v else F if lo_ > v else U
    if op == "lt":
        return T if hi_ < v else F if lo_ >= v else U
    if op == "ge":
        return T if lo_ >= v else F if hi_ < v else U
    if op == "gt":
        return T if lo_ > v else F if hi_ <= v else U
    if op == "eq":
        return T if lo_ == hi_ == v else F if v < lo_ or v > hi_ else U
    if op == "ne":
        r = compare(lo, hi, "eq", v)
        return None if r is None else not r
    return U


class Ctx:
    def __init__(self, facts, as_of):
        self.facts, self.as_of = facts, as_of
        self.used_assumptions, self.missing, self.invalid = set(), set(), []


def ev(node, ctx):
    k = node.get("kind")
    ch = node.get("children") or []
    if k == "always":
        return T
    if k == "never":
        return F
    if k in ("all", "any", "not") and not ch:
        ctx.invalid.append(f"empty {k}")
        return U
    if k == "all":
        vals = [ev(c, ctx) for c in ch]
        return F if F in vals else U if U in vals else T
    if k == "any":
        vals = [ev(c, ctx) for c in ch]
        return T if T in vals else U if U in vals else F
    if k == "not":
        v = ev(ch[0], ctx)
        return None if v is None else not v
    if k == "unparsed":
        ctx.missing.add("unparsed: " + (node.get("quote") or "")[:60])
        return U
    key, op = node.get("fact"), node.get("op")
    if not key or not op or (k == "age_years" and node.get("years") is None):
        ctx.invalid.append(f"{k} without fact/op")
        return U
    fact = ctx.facts.get(key)
    if fact is None or not fact.known:
        ctx.missing.add(key)
        return U
    if fact.assumption:
        ctx.used_assumptions.add(fact.assumption)
    if fact.values is not None:   # enum / boolean fact
        want = node.get("values") if op == "in" else [node.get("value")]
        hit = any(v in fact.values for v in want)
        exact = len(fact.values) == 1
        if op in ("eq", "in"):
            return T if hit and exact else F if not hit else U
        if op == "ne":
            return F if hit and exact else T if not hit else U
        ctx.invalid.append(f"op {op} on enum fact {key}")
        return U
    target = node.get("value") if k == "fact" else node.get("date") if k == "date_fact" else None
    if k in ("fact", "date_fact"):
        try:
            if _num(target) is None:
                raise TypeError("no comparison value")
            return compare(fact.lo, fact.hi, op, target)
        except TypeError as e:
            ctx.invalid.append(f"{key} {op} {target!r}: {e}")
            return U
    if k == "age_years":
        # age < N years  <=>  date > as_of - N years
        a = dt.date.fromisoformat(ctx.as_of)
        cutoff = a.replace(year=a.year - int(node["years"])).isoformat()
        flipped = {"lt": "gt", "le": "ge", "gt": "lt", "ge": "le"}[op]
        return compare(fact.lo, fact.hi, flipped, cutoff)
    return U


def add_months_first_day(d, n):
    d = dt.date.fromisoformat(d)
    m = d.month - 1 + n
    return dt.date(d.year + m // 12, m % 12 + 1, 1).isoformat()


def start_date(rule):
    """When the rule starts to govern: operative date, else effective date (explicit or derived)."""
    ev_ = rule["events"]
    enacted = next((e["date"] for e in ev_ if e["kind"] == "enacted" and e.get("date")), None)
    for kind in ("operative", "effective"):
        dates = []
        for e in ev_:
            if e["kind"] != kind:
                continue
            if e.get("date") and len(e["date"]) == 10:
                dates.append((e["date"], None))
            elif e.get("relative_rule") == "first_day_of_nth_month_after_enactment" and enacted and e.get("n"):
                dates.append((add_months_first_day(enacted[:7] + "-01", int(e["n"])), "derived from enactment"))
            elif e.get("relative_rule") == "no_date_in_text" and enacted and rule["state"] == "CA":
                dates.append((f"{int(enacted[:4]) + 1}-01-01", "CA default: Jan 1 after enactment"))
        if dates:
            return min(dates)
    return None, None


def status(rule, as_of):
    if rule["document_status"] in ("failed", "struck"):
        return "failed", None
    if rule["document_status"] == "pending":
        return "pending", None
    repealed = [e["date"] for e in rule["events"] if e["kind"] == "repealed" and e.get("date")]
    if repealed and min(repealed) <= as_of:
        return "repealed", None
    start, how = start_date(rule)
    if start and start > as_of:
        return "not_yet_effective", how
    return "in_force", how


def coverage(rule, ctx):
    a = ev(rule["applies_if"], ctx)
    e = ev(rule["exempt_if"], ctx)
    if a is F or e is T:
        return F
    if a is T and e is F:
        return T
    return U


def evaluate(rules, facts, as_of):
    """Results for every rule whose jurisdiction is in the address's stack."""
    city = facts["address.city"].values[0]
    state = facts["address.state"].values[0]
    stack = [r for r in rules if r["jurisdiction"] in (state, city)]
    out = {}
    cov = {}
    for r in stack:
        ctx = Ctx(facts, as_of)
        st, how = status(r, as_of)
        c = coverage(r, ctx)
        cov[r["id"]] = (st, c, ctx)
    for r in stack:
        st, c, ctx = cov[r["id"]]
        res = {"status": st, "assumptions": set(ctx.used_assumptions), "missing": set(ctx.missing),
               "invalid": list(ctx.invalid), "governed_by": None, "conflict_with": [], "value": None}
        if r.get("effect") == "bars_or_limits_local_rules" or st in ("failed", "repealed"):
            res["result"] = None
        elif st == "pending":
            res["result"] = "pending"
        elif st == "not_yet_effective":
            res["result"] = "not_yet_effective" if c is not F else None
        else:
            res["result"] = {T: "applies", U: "unknown", F: None}[c]
        # interactions with local rules of the same topic
        locals_ = [o for o in stack if o["jurisdiction"] == city and o["id"] != r["id"]
                   and o["category"] == r["category"] and o.get("effect") != "bars_or_limits_local_rules"]
        for inter in r.get("interactions", []):
            if inter["kind"] in ("exempt_where_local_rule_stricter", "yields_to_local") and res["result"] in ("applies", "unknown"):
                truths = []
                for o in locals_:
                    ost, oc, octx = cov[o["id"]]
                    if ost != "in_force":
                        continue
                    stricter = U
                    if inter["kind"] == "yields_to_local":
                        stricter = T
                    elif o.get("cap_high") is not None and r.get("cap_low") is not None:
                        stricter = T if o["cap_high"] < r["cap_low"] else F
                    t = F if F in (oc, stricter) else U if U in (oc, stricter) else T
                    truths.append((t, o, octx))
                if any(t is T for t, _, _ in truths):
                    o = next(o for t, o, _ in truths if t is T)
                    res["result"], res["governed_by"] = "superseded", o["id"]
                    res["assumptions"] |= cov[o["id"]][2].used_assumptions
                elif any(t is U for t, _, _ in truths):
                    res["result"] = "unknown"
                    for t, o, octx in truths:
                        if t is U:
                            res["missing"] |= octx.missing
            if inter["kind"] in ("possible_conflict_with_local", "preempts_local") and locals_:
                res["conflict_with"] = [o["id"] for o in locals_]
        # value: default or a branch
        if res["result"] in ("applies", "unknown", "superseded"):
            vctx = Ctx(facts, as_of)
            branch_truths = [(ev(b["when"], vctx), b["value"]) for b in r.get("value_branches", [])]
            if any(t is T for t, _ in branch_truths):
                res["value"] = next(v for t, v in branch_truths if t is T)
            elif any(t is U for t, _ in branch_truths):
                res["value"] = {"conditional": [r.get("key_value")] + [v for t, v in branch_truths if t is U],
                                "depends_on": sorted(vctx.missing)}
            else:
                res["value"] = r.get("key_value")
            res["assumptions"] |= vctx.used_assumptions
        res["assumptions"] = sorted(res["assumptions"])
        res["missing"] = sorted(res["missing"])
        out[r["id"]] = res
    return out
