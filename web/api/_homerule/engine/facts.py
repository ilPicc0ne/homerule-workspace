"""I3 (out/addresses.resolved.json) -> the fact dict engine/evaluate.py expects.

Same keys and semantics as the extraction's test stand-in (lab/schema_experiment/facts.py, no longer used):
`address.city` / `address.state` as rule-schema names, `built` as a date range, `units` as an int range,
`use_class` and `subsidised` as one-value enums. A null I3 fact is left out, so the evaluator records it as
missing and the result is unknown. Each Fact keeps its I3 source string and named assumption, so the
explanation can cite where a deciding fact came from.
"""
import json
from pathlib import Path

from engine.rules import JUR, OUT

# I3 assumption name -> the fact it fills (web/lib/resolve: assumptions on the record)
ASSUMPTION_FACT = {"no_recorded_affordability_restriction": "subsidised",
                   "boston_land_use_A_is_7_plus": "units",
                   "boston_elderly_home_is_apartment": "use_class"}

# I7 has `subsidised_housing` as a use class; no rule tests it, but rules do test use_class in
# [apartment, mixed_use]. A subsidised multi-unit building is an apartment building whose subsidy is carried
# by the `subsidised` fact (the stand-in read Boston "SUBSD HOUSING" the same way). Named, so it is cited.
SUBSIDISED_AS_APARTMENT = "subsidised_housing_counts_as_apartment"


class Fact:
    def __init__(self, lo=None, hi=None, values=None, known=True, source="", assumption=None, confidence=None):
        self.lo, self.hi, self.values, self.known = lo, hi, values, known
        self.source, self.assumption, self.confidence = source, assumption, confidence

    def __repr__(self):
        if not self.known:
            return "unknown"
        return f"{self.values}" if self.values is not None else f"[{self.lo}, {self.hi}]"


UNKNOWN = Fact(known=False)


def load(path=None):
    """address_id -> I3 record, all 500."""
    data = json.loads(Path(path or OUT / "addresses.resolved.json").read_text(encoding="utf-8"))
    return {a["address_id"]: a for a in data["addresses"]}


def _assumption(rec, fact):
    if rec["source"].get(fact) != "assumption" and not any(
            ASSUMPTION_FACT.get(a) == fact for a in rec.get("assumptions", [])):
        return None
    names = sorted(a for a in rec.get("assumptions", []) if ASSUMPTION_FACT.get(a) == fact)
    return names[0] if names else f"{fact}_assumed"


def schema_name(jid):
    return (JUR.get(jid) or {}).get("schema_name") or jid


def address_facts(rec):
    """One I3 record -> {fact name: Fact}."""
    f = {}
    j = rec["jurisdictions"]
    f["address.city"] = Fact(values=[schema_name(j["city"]) if j.get("city") else None],
                             source=f"jurisdiction from {rec['source']['jurisdiction']}",
                             confidence=rec["confidence"]["jurisdiction"])
    f["address.state"] = Fact(values=[schema_name(j["state"])], source="state from the address",
                              confidence=rec["confidence"]["jurisdiction"])
    facts, detail, conf = rec["facts"], rec.get("source_detail", {}), rec.get("confidence", {})
    if facts.get("built"):
        b = facts["built"]
        f["built"] = Fact(b["from"], b["to"], source=detail.get("built") or "year built",
                          assumption=_assumption(rec, "built"), confidence=conf.get("built"))
    if facts.get("units"):
        u = facts["units"]
        f["units"] = Fact(u["min"], u["max"], source=detail.get("units") or "unit count",
                          assumption=_assumption(rec, "units"), confidence=conf.get("units"))
    if facts.get("use_class"):
        uc, a = facts["use_class"], _assumption(rec, "use_class")
        if uc == "subsidised_housing":
            uc, a = "apartment", a or SUBSIDISED_AS_APARTMENT
        f["use_class"] = Fact(values=[uc], source=detail.get("use_class") or "use code", assumption=a)
    if facts.get("subsidised") is not None:
        f["subsidised"] = Fact(values=[facts["subsidised"]], source=detail.get("subsidised") or "use code",
                               assumption=_assumption(rec, "subsidised"))
    for k in ("owner_type", "owner_occupied"):       # always null in I3; kept for when a source exists
        if facts.get(k) is not None:
            f[k] = Fact(values=[facts[k]], source=detail.get(k) or k)
    return f


def city_of(rec):
    return address_facts(rec)["address.city"].values[0]
