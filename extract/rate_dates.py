"""A rule's start date that only starts a new amount, rate, formula or wording of a rule already in force.

A rent board's yearly notice ("the allowable increase from March 1, 2026 is 1.6%") or a new formula for an old
ordinance gives a date that extraction reads as the rule's start, so a rent-control law in force for decades looks
new (and every address "gains" it on that date in the change log). Jev answers, with the whole document as context,
what the date starts; code marks it amendment_only, like an amended version's date (compile.amendment_only), so
the rule's start is the next earlier date, or none (in force before the documents we have). Only at p >= CONF.
"""
from concurrent.futures import ThreadPoolExecutor

from . import llm
from .exemptions import _text
from .luna_pass import locate

STARTS = {"rule": "The rule itself: before this date the rule did not exist or did not apply.",
          "update": "Only a new amount, rate, formula or amended wording of a rule that already applied before "
                    "this date."}
CONF = 0.9


def check(rules, effective):
    """In place on internal rules; effective(events, jurisdiction, provision) as in compile. Returns changes."""
    by_doc = {}
    for i, r in enumerate(rules):
        if r["effect"] != "protection_or_duty":
            continue
        d = effective(r["events"], r["jurisdiction"], r.get("provision"))["from"]
        if not d or not any(e.get("date") == d for e in r["events"]):
            continue
        quote = " ".join((r.get("requirement_quote") or r["requirement"]).split())
        by_doc.setdefault(r["source_doc_id"], {})[f"d{i}"] = (d, {
            "type": "choice", "criteria": STARTS,
            "instructions": f'The rule "{quote}" (cited as {r["citation"]}) is dated {d} in HomeRule\'s records. '
                            f"What does {d} start?"})

    def one(item):
        doc_id, qs = item
        text = _text(doc_id)
        first = rules[int(next(iter(qs))[1:])]
        span = locate(text, first.get("requirement_quote") or "") if text else None
        state = llm.fit(text, span[0] if span else None) if text else first["requirement"]
        return qs, llm.jev(state, {k: q for k, (_, q) in qs.items()}, stage="jev_rate_dates", ref=doc_id)[0]

    changes = []
    with ThreadPoolExecutor(8) as ex:
        for qs, answers in ex.map(one, sorted(by_doc.items(), key=lambda x: x[0] or "")):
            for k, (d, _) in qs.items():
                a = answers[k]
                p = a["probabilities"].get("update", 0)
                if a["choice"] != "update" or p < CONF:
                    continue
                r = rules[int(k[1:])]
                r["events"] = [{**e, "amendment_only": True, "rate_only": f"jev p={p:.2f}"} if e.get("date") == d else e
                               for e in r["events"]]
                r["checks"] = r["checks"] + [f"effective: {d} starts a new amount or wording, not the rule (jev p={p:.2f})"]
                changes.append((r["citation"], d, effective(r["events"], r["jurisdiction"], r.get("provision"))["from"], p))
    return changes
