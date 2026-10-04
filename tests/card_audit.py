"""Card audit: does each card show the right main rule? Read-only report, changes no output.

For every city and each of the six card questions, the in-force rules of that topic in the city's stack (state +
city) on the as-of date are candidates, together with their supporting provisions (`details`). Jev picks which
candidate most directly answers the card question for a renter in that city. A card is flagged when Jev picks a
supporting provision over the published main rule, picks a provision of a different main rule, or when a card that
needs a number (rent, deposit, fee) has no key value.

python3 -m tests.card_audit [as_of]   ->   out/eval/card_audit.md, out/eval/card_audit.json
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor

from extract import config, llm

CARDS = {
    "rent_increase_limits": "How much can my rent go up?",
    "just_cause_eviction": "When can they end my tenancy?",
    "security_deposits": "How much deposit can they ask?",
    "application_screening_fees": "What can they charge me to apply?",
    "screening_restrictions": "What can they check about me?",
    "algorithmic_rent_setting": "Can rent-setting software be used on my rent?",
}
NEEDS_NUMBER = {"rent_increase_limits", "security_deposits", "application_screening_fees"}
MAX_CANDIDATES = 40
PICK_CONF = 0.6


def in_force(c, date):
    eff = c["effective"]
    return (c["status"] not in ("pending", "failed") and not (eff.get("until") and eff["until"] <= date)
            and not (eff.get("from") and eff["from"] > date))


def short(text, n=260):
    return " ".join((text or "").split())[:n]


def audit(as_of="2026-10-01"):
    juris = json.load(open(config.ROOT / "contracts" / "jurisdictions.json"))["jurisdictions"]
    by_id = {j["id"]: j for j in juris}
    comps = json.load(open(config.OUT / "rules.compiled.json"))
    texts = {r["team_rule_id"]: r for r in json.load(open(config.OUT / "rules.json"))["rules"]}
    cities = [j for j in juris if j.get("level") == "city" and j.get("rules", True)]
    groups = []
    for city in cities:
        state = city["id"].split("-")[0]
        for cat, card in CARDS.items():
            mains = [c for c in comps if c["jurisdiction"] in (state, city["id"]) and c["category"] == cat
                     and c["x_source"].get("effect", "protection_or_duty") == "protection_or_duty" and in_force(c, as_of)]
            cands = []
            for c in mains:
                t = texts.get(c["team_rule_id"], {})
                cands.append({"key": f"m{len(cands)}", "main": c["team_rule_id"], "is_main": True,
                              "level": by_id[c["jurisdiction"]].get("level"), "citation": c["x_source"].get("citation"),
                              "text": short(t.get("requirement") or t.get("quoted_span")), "key_value": c.get("key_value")})
            extra = []
            for c in mains:
                for d in c.get("details", []):
                    extra.append({"main": c["team_rule_id"], "is_main": False, "citation": d.get("provision"),
                                  "text": short(d.get("requirement")), "key_value": d.get("key_value")})
            extra.sort(key=lambda d: d["key_value"] is None)            # provisions that state a value first
            for d in extra[:max(0, MAX_CANDIDATES - len(cands))]:
                cands.append({**d, "key": f"d{len(cands)}"})
            groups.append({"city": city["schema_name"], "city_id": city["id"], "category": cat, "card": card,
                           "candidates": cands})

    def ask(g):
        if not g["candidates"]:
            return None
        crit = {c["key"]: f"[{c['citation']}] {c['text']}" + (f" (value: {c['key_value']})" if c["key_value"] else "")
                for c in g["candidates"]}
        crit["none"] = "None of these answers the question."
        state = (f"A renter in {g['city']} asks: \"{g['card']}\". These are provisions of the law that applies there "
                 f"(state and city), in force on {as_of}.")
        a, _ = llm.jev(state, {"pick": {"type": "choice", "criteria": crit,
                                        "instructions": "Which provision most directly answers the renter's question: "
                                                        "the general rule a renter would want to know first (e.g. the "
                                                        "ordinary limit), not an exception, procedure or special case?"}},
                       stage="card_audit", ref=f"{g['city_id']}:{g['category']}")
        return a["pick"]

    with ThreadPoolExecutor(8) as ex:
        picks = list(ex.map(ask, groups))
    rows = []
    for g, p in zip(groups, picks):
        mains = [c for c in g["candidates"] if c["is_main"]]
        chosen = next((c for c in g["candidates"] if p and c["key"] == p["choice"]), None)
        flags = []
        if not mains:
            flags.append("no rule in force")
        elif p and p["confidence"] >= PICK_CONF and chosen and not chosen["is_main"]:
            flags.append("a supporting provision answers better than the main rule")
        if g["category"] in NEEDS_NUMBER and mains and not any(c["key_value"] for c in mains):
            flags.append("no value on the main rule")
        rows.append({"city": g["city"], "card": g["card"], "category": g["category"],
                     "main_rules": [{"id": c["main"], "level": c["level"], "citation": c["citation"],
                                     "key_value": c["key_value"], "text": c["text"]} for c in mains],
                     "jev_pick": ({"choice": p["choice"], "confidence": p["confidence"],
                                   "citation": chosen["citation"] if chosen else None,
                                   "text": chosen["text"] if chosen else None,
                                   "key_value": chosen["key_value"] if chosen else None,
                                   "under_main": chosen["main"] if chosen else None,
                                   "is_main": chosen["is_main"] if chosen else None} if p else None),
                     "candidates": len(g["candidates"]), "flags": flags})
    out = config.OUT / "eval"
    out.mkdir(parents=True, exist_ok=True)
    (out / "card_audit.json").write_text(json.dumps({"as_of": as_of, "rows": rows}, indent=1, ensure_ascii=False))
    (out / "card_audit.md").write_text(markdown(rows, as_of))
    return rows


def markdown(rows, as_of):
    flagged = [r for r in rows if r["flags"]]
    L = [f"# Card audit ({as_of})", "",
         f"{len(rows)} cards (10 cities × 6 questions); {len(flagged)} flagged. Main rule = what the card shows; "
         "Jev pick = the provision Jev finds answers the question most directly.", "",
         "| City | Card | Main rule(s) (value) | Jev pick (conf.) | Flags |", "|---|---|---|---|---|"]
    for r in rows:
        mains = "; ".join(f"{m['citation']} ({m['key_value'] or '—'})" for m in r["main_rules"]) or "—"
        p = r["jev_pick"]
        pick = (f"{'main' if p['is_main'] else 'detail'}: {p['citation']} ({p['key_value'] or '—'}) {p['confidence']:.2f}"
                if p and p["citation"] else (f"none {p['confidence']:.2f}" if p else "—"))
        L.append(f"| {r['city']} | {r['card']} | {mains[:160]} | {pick[:120]} | {'; '.join(r['flags'])} |")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    rows = audit(sys.argv[1] if len(sys.argv) > 1 else "2026-10-01")
    for r in rows:
        if r["flags"]:
            p = r["jev_pick"] or {}
            print(f"{r['city']:18} {r['category'][:22]:22} {'; '.join(r['flags'])} | pick: {p.get('citation')} ({p.get('key_value')}) {p.get('confidence', 0):.2f}")
