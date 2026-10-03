"""J5-J8: Jev cross-checks of the closed fields Luna filled, one kind of question per call, run in parallel.

Every call gets the full document (or bundle) as state; each question quotes the obligation or clause it
is about. Disagreements with Luna become check problems for the repair step; after repair, a confident Jev
answer (>= OVERRIDE) wins for effect and headline, and every override is recorded.
"""
from concurrent.futures import ThreadPoolExecutor

from . import llm

OVERRIDE = 0.9
EFFECT = {
    "protection_or_duty": "Gives tenants or applicants a right or protection, or puts a duty or limit on landlords or "
                          "owners for the benefit of tenants (a cap, a ban, a notice requirement, a deadline).",
    "bars_or_limits_local_rules": "Forbids, limits or sets conditions on what cities or towns may enact or enforce; "
                                  "protects no tenant by itself.",
    "procedure_or_admin": "Enforcement mechanics, reporting, rulemaking, fees, or duties of public bodies "
                          "(including what a city must pay or do if it adopts a program).",
}
INTERACTION = {
    "yields_to_local": "It does not apply, or gives way, where a (stricter) local city rule on the same topic covers the unit.",
    "may_preempt_local": "It forbids or limits local ordinances on the same topic, or may override them.",
    "coexists": "The text says local rules on the same topic continue to apply alongside it.",
    "none": "The text says nothing about local city rules on this topic.",
}
FACT_CHOICES = {
    "built": "The date the building was built or got its certificate of occupancy.",
    "units": "The number of dwelling units (in the building, or owned by the owner).",
    "use_class": "The kind of building: apartment, condo, co-op, two-family, single-family, mixed-use, subsidised.",
    "subsidised": "Whether the housing is subsidised or restricted as affordable housing.",
    "owner_type": "What kind of owner: an individual person, a corporation, a REIT, a public body.",
    "owner_occupied": "Whether the owner lives in the building.",
    "not_expressible": "None of these: it is about the tenant, the lease, an agreement, or something else.",
}
OP_CHOICES = {
    "le": "on or before / no more than / at most / not exceeding", "lt": "before / less than / under",
    "ge": "on or after / at least / or more", "gt": "after / more than / in excess of / over",
    "eq": "equal to / is", "ne": "is not", "in": "is one of several kinds",
}


MAIN_SLOT = {
    "rent_increase_limits": "the cap on how much rent may be increased",
    "just_cause_eviction": "the rule that a landlord needs one of the listed causes to evict",
    "security_deposits": "the maximum security deposit a landlord may charge",
    "application_screening_fees": "the cap or ban on application or screening fees",
    "screening_restrictions": "the restriction on how applicants may be screened",
    "algorithmic_rent_setting": "the ban or restriction on algorithmic rent-setting",
}


def head_question(cat, obs, idx):
    crit = {f"o{i}": _quote(obs[i], 150) + (f" [stated limit: {obs[i]['key_value']}]" if obs[i].get("key_value") else "")
            for i in idx}
    return {"type": "choice", "criteria": crit,
            "instructions": f"Which of these provisions states {MAIN_SLOT.get(cat, 'the main rule')}? "
                            "Pick the provision that states it directly, not a supporting duty."}


def _quote(o, n=220):
    return " ".join((o.get("requirement_quote") or o.get("requirement") or "").split())[:n]


def _leaves(node, path):
    if node["kind"] == "fact" and node.get("quote"):
        yield path, node
    for i, c in enumerate(node.get("children") or []):
        yield from _leaves(c, f"{path}.{i}")


def questions(out, level):
    obs = out["obligations"]
    j5, j6, j7, j8 = {}, {}, {}, {}
    for i, o in enumerate(obs):
        j5[f"o{i}_effect"] = {"type": "choice", "criteria": EFFECT,
                              "instructions": f'Consider only the provision "{_quote(o)}". What does it do?'}
        if level == "state" and o["is_headline"] and o["category"] in (
                "rent_increase_limits", "just_cause_eviction", "algorithmic_rent_setting"):
            j7[f"o{i}_interaction"] = {"type": "choice", "criteria": INTERACTION,
                                       "instructions": f'Consider the rule "{_quote(o)}". How does this law relate to '
                                                       "local city rules on the same topic?"}
        for key in ("applies_if", "exempt_if"):
            for path, leaf in _leaves(o[key], key):
                q = " ".join(leaf["quote"].split())[:250]
                j8[f"o{i}|{path}|fact"] = {"type": "choice", "criteria": FACT_CHOICES,
                                           "instructions": f'The condition "{q}" is about which property?'}
                j8[f"o{i}|{path}|op"] = {"type": "choice", "criteria": OP_CHOICES,
                                         "instructions": f'In the condition "{q}", which comparison is stated?'}
    by_cat = {}
    for i, o in enumerate(obs):
        if o["effect"] == "protection_or_duty":
            by_cat.setdefault(o["category"], []).append(i)
    for cat, idx in by_cat.items():
        if len(idx) > 1:
            j6[f"head_{cat}"] = head_question(cat, obs, idx)
    return {"J5": j5, "J6": j6, "J7": j7, "J8": j8}


def _get(node, path):
    for part in path.split(".")[1:]:
        node = node["children"][int(part)]
    return node


def run(state, out, level, ref):
    groups = {k: v for k, v in questions(out, level).items() if v}
    if not groups:
        return {}, []
    # split very large question sets so each call stays focused
    calls = []
    for name, qs in groups.items():
        items = list(qs.items())
        for k in range(0, len(items), 60):
            calls.append((name, dict(items[k:k + 60])))

    def one(c):
        return llm.jev(state[:100000], c[1], stage=f"jev_{c[0]}", ref=ref)

    answers, usage = {}, []
    with ThreadPoolExecutor(min(8, len(calls))) as ex:
        for a, u in ex.map(one, calls):
            answers.update(a)
            usage.append(u)
    return answers, usage


def disagreements(out, answers, min_conf=0.7):
    """Problems per obligation index where Jev confidently disagrees with Luna."""
    per = {}
    obs = out["obligations"]
    for i, o in enumerate(obs):
        p = []
        a = answers.get(f"o{i}_effect")
        if a and a["confidence"] >= min_conf and a["choice"] != o["effect"]:
            p.append(f"effect: you wrote {o['effect']}, a classifier says {a['choice']} ({a['confidence']:.2f})")
        a = answers.get(f"o{i}_interaction")
        if a and a["confidence"] >= min_conf:
            have = {x["type"] for x in o["interactions"]}
            if (a["choice"] == "none") != (not have) or (a["choice"] != "none" and a["choice"] not in have):
                p.append(f"interactions: you wrote {sorted(have) or 'none'}, a classifier says {a['choice']} ({a['confidence']:.2f})")
        for key in ("applies_if", "exempt_if"):
            for path, leaf in _leaves(o[key], key):
                f = answers.get(f"o{i}|{path}|fact")
                op = answers.get(f"o{i}|{path}|op")
                if f and f["confidence"] >= min_conf and f["choice"] != leaf["fact"]:
                    p.append(f"{path}: fact {leaf['fact']} but the quote is about {f['choice']} ({f['confidence']:.2f})")
                if op and op["confidence"] >= min_conf and leaf.get("op") and op["choice"] != leaf["op"] \
                        and not (op["choice"] == "eq" and leaf["op"] == "in"):
                    p.append(f"{path}: op {leaf['op']} but the quote states {op['choice']} ({op['confidence']:.2f})")
        if p:
            per[i] = p
    for k, a in answers.items():
        if k.startswith("head_") and a["confidence"] >= min_conf:
            chosen = int(a["choice"][1:])
            cat = k[5:]
            for i, o in enumerate(obs):
                if o["category"] == cat and o["effect"] == "protection_or_duty":
                    want = i == chosen
                    if o["is_headline"] != want:
                        per.setdefault(i, []).append(
                            f"is_headline: you wrote {o['is_headline']}, a classifier picks "
                            f"{'this' if want else obs[chosen]['slug']} as the main rule ({a['confidence']:.2f})")
    return per


def apply_overrides(out, answers):
    """After repair: confident Jev answers win for effect and headline. Returns the override log."""
    log = []
    obs = out["obligations"]
    for i, o in enumerate(obs):
        a = answers.get(f"o{i}_effect")
        if a and a["confidence"] >= OVERRIDE and a["choice"] != o["effect"]:
            log.append({"obligation": o["slug"], "field": "effect", "luna": o["effect"], "jev": a["choice"],
                        "confidence": a["confidence"]})
            o["effect"] = a["choice"]
    for k, a in answers.items():
        if k.startswith("head_") and a["confidence"] >= OVERRIDE:
            chosen, cat = int(a["choice"][1:]), k[5:]
            if chosen >= len(obs):
                continue
            for i, o in enumerate(obs):
                if o["category"] == cat and o["effect"] == "protection_or_duty":
                    want = i == chosen
                    if o["is_headline"] != want:
                        log.append({"obligation": o["slug"], "field": "is_headline", "luna": o["is_headline"],
                                    "jev": want, "confidence": a["confidence"]})
                        o["is_headline"] = want
    return log
