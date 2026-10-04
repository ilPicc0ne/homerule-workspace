"""Renter impact per rule (layer 1): does the rule protect renters or limit a protection, and how strong is it?

Added to every record of out/rules.compiled.json as `renter_impact`:
  {"direction": "protects" | "limits" | "neutral", "decided_by": "code" | "model_override", "how": "...",
   "confidence": float, "inputs": {effect, category, citation, quote_chars},
   "strength": {"value": float, "unit": str, "lower_is_better": bool} | null}

- direction: code from what extraction already decided (effect: a rule that bars or limits local rules limits a
  protection; a protection or duty protects). One batched Jev call reviews every protecting rule with its quote
  ("for tenants, does this provision add a protection, take one away or limit it, or neither?") and overrides the
  code default only at p >= 0.9, e.g. an exemption from a rent cap filed as a protection.
- kind (eviction, algorithmic pricing): a Jev label in the same call - does the rule limit the reasons for ending a
  tenancy (grounds) or only procedure; is it a ban or only a disclosure duty. Presence alone overstates a notice rule.
- strength: code only, from fields extraction already filled (cap percentages) or parsed from the key value
  (months of rent, dollars). Not parseable means null ("strength unknown"), never a guess.
The score (engine/score.py) and the better/worse verdict of a change (engine/impact.py) are built on this.
"""
import re

from . import llm

DIRECTION = {
    "protects": "It gives tenants or applicants a right or protection, or limits what landlords may do or charge.",
    "limits": "It removes or narrows a protection: an exemption or carve-out from a tenant protection, or a bar "
              "on local tenant protections.",
    "neutral": "Neither: a procedure, a notice to an agency, a definition or an administrative duty.",
}
KIND = {   # topics where a protection's presence is not enough: what kind of protection is it?
    "just_cause_eviction": {
        "grounds": "It limits the reasons for which a landlord may end a tenancy or evict (just or good cause).",
        "procedure": "It only sets notice periods, forms, filings, timing or relocation payments, not the reasons.",
    },
    "algorithmic_rent_setting": {
        "ban": "It prohibits using or providing algorithmic or coordinated rent-setting.",
        "disclosure": "It only requires disclosure, notice or reporting about such software.",
    },
}
OVERRIDE = 0.9
UNITS = {"rent_increase_limits": ("%/year", True), "security_deposits": ("months of rent", True),
         "application_screening_fees": ("$", True)}
WORDS = {"one-half": 0.5, "one and one-half": 1.5, "one": 1, "first": 1, "two": 2, "three": 3}


def _months(text):
    t = (text or "").lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:times|x)\s+(?:the\s+)?(?:one\s+)?month", t) or \
        re.search(r"(\d+(?:\.\d+)?)\s+months?'?s?\s+rent", t)
    if m:
        return float(m.group(1))
    for w in sorted(WORDS, key=len, reverse=True):
        if re.search(rf"\b{w}\b\s+(?:times\s+)?(?:the\s+)?(?:one\s+)?months?['’]?s?\s+rent", t) or \
                re.search(rf"\b{w}\s+month['’]?s?\b", t):
            return float(WORDS[w])
    return None


def strength(comp):
    cat = comp["category"]
    if cat not in UNITS:
        return None
    unit, lower = UNITS[cat]
    key = comp.get("key_value") or ""
    x = comp.get("x_source") or {}
    value = None
    if cat == "rent_increase_limits":
        value = x.get("cap_pct_high") if x.get("cap_pct_high") is not None else x.get("cap_pct_low")
        if value is None:
            pct = [float(p) for p in re.findall(r"(\d+(?:\.\d+)?)\s*%", key)]
            value = max(pct) if pct else None
    elif cat == "security_deposits":
        value = _months(key)
    elif cat == "application_screening_fees":
        m = re.search(r"\$\s?(\d+(?:\.\d+)?)", key)
        value = float(m.group(1)) if m else None
    return None if value is None else {"value": float(value), "unit": unit, "lower_is_better": lower}


def annotate(rules, comps):
    """rules: internal records (quotes); comps: the compiled records, annotated in place."""
    qs, idx = {}, {}
    for i, (r, c) in enumerate(zip(rules, comps)):
        if (c.get("x_source") or {}).get("effect", r.get("effect")) == "protection_or_duty":
            quote = " ".join((r.get("requirement_quote") or r.get("requirement") or "").split())[:400]
            qs[f"r{i}"] = {"type": "choice", "criteria": DIRECTION,
                           "instructions": f'For tenants, what does this provision do: "{quote}" '
                                           f'(cited as {r["citation"]}, topic {r["category"]})?'}
            idx[f"r{i}"] = i
            if r["category"] in KIND:
                qs[f"k{i}"] = {"type": "choice", "criteria": KIND[r["category"]],
                               "instructions": f'What kind of tenant protection is this provision: "{quote}" '
                                               f'(cited as {r["citation"]})?'}
    answers = {}
    if qs:
        state = "\n".join(f"- {r['citation']}: {r['requirement']}" for r in rules)
        answers, _ = llm.jev(state[:60000], qs, stage="jev_renter_impact", ref="rules")
    for i, (r, c) in enumerate(zip(rules, comps)):
        effect = (c.get("x_source") or {}).get("effect", r.get("effect"))
        direction = "limits" if effect == "bars_or_limits_local_rules" else "protects"
        how, conf, decided_by = f"code: effect {effect}", 1.0, "code"
        a = answers.get(f"r{i}")
        if a:
            p = a.get("probabilities", {})
            if a["choice"] != direction and p.get(a["choice"], 0) >= OVERRIDE:
                direction, how, conf = a["choice"], f"jev review (p={p[a['choice']]:.2f}) over code ({effect})", p[a["choice"]]
                decided_by = "model_override"
            else:
                conf = p.get(direction, a["confidence"])
                how += f"; jev agrees or unsure (p={conf:.2f})"
        k = answers.get(f"k{i}")
        kind = k["choice"] if k and direction == "protects" else None
        c["renter_impact"] = {"direction": direction, "decided_by": decided_by, "how": how, "confidence": round(conf, 3),
                              "inputs": {"effect": effect, "quote_chars": 400, "category": r["category"],
                                         "citation": r["citation"]},
                              "strength": strength(c) if direction == "protects" else None,
                              "kind": kind, "kind_confidence": round(k["confidence"], 3) if kind else None}
    return comps
