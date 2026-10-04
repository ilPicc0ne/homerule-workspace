"""Card answers: which provision answers each of the six card questions, per rule. Writes out/cards.json.

A law's "main rule" is chosen at extraction without knowing the card question, so a ceiling or an exception can
end up on the card (Newark's 25% ceiling on Board-granted increases instead of the CPI-capped annual increase).
Here, for every compiled rule, Luna picks which of its provisions (the rule itself or one of its `details`)
answers the card question for a renter, or none. Principle: unknown is fine, wrong is not.

- answered: the card shows the chosen provision's value and verbatim quote
- related:  no provision answers the card question (e.g. interest on a deposit); shown as related law, never hidden
A value that names its period ("July 1, 2025 through June 30, 2026", "for 2026") is not shown as current after the
period ends. A card whose city law is only partly available (held or excluded sources, code-publisher links
without text) gets a note saying so.

python3 -m extract.cards [as_of]
"""
import csv
import datetime as dt
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor

from . import config, llm

CARDS = {
    "rent_increase_limits": "How much can my rent go up?",
    "just_cause_eviction": "When can they end my tenancy?",
    "security_deposits": "How much deposit can they ask?",
    "application_screening_fees": "What can they charge me to apply?",
    "screening_restrictions": "What can they check about me?",
    "algorithmic_rent_setting": "Can rent-setting software be used on my rent?",
}
MAX_CANDIDATES = 40
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
RANGE = re.compile(rf"(?:{MONTHS})\.? \d{{1,2}},? \d{{4}}\s*(?:through|to|until|–|-)\s*((?:{MONTHS})\.? \d{{1,2}},? \d{{4}})")
FOR_YEAR = re.compile(r"\b(?:for|in) (20\d\d)\b(?![-/]\d)")


def value_valid_until(*texts):
    """End of the period a value is stated for, or None."""
    for t in texts:
        if not t:
            continue
        m = RANGE.search(t)
        if m:
            try:
                return dt.datetime.strptime(m.group(1).replace(".", "").replace(",", ""), "%B %d %Y").date().isoformat()
            except ValueError:
                pass
        m = FOR_YEAR.search(t)
        if m:
            return f"{m.group(1)}-12-31"
    return None


def _short(t, n=260):
    return " ".join((t or "").split())[:n]


def candidates(rule, text):
    out = [{"key": "main", "source": "main", "provision": rule["x_source"].get("citation"),
            "requirement": text.get("requirement"), "key_value": rule.get("key_value"),
            "quote": text.get("quoted_span")}]
    details = sorted(rule.get("details", []), key=lambda d: d.get("key_value") is None)
    for i, d in enumerate(details[:MAX_CANDIDATES - 1]):
        out.append({"key": f"d{i}", "source": "detail", "provision": d.get("provision"),
                    "requirement": d.get("requirement"), "key_value": d.get("key_value"), "quote": d.get("quote")})
    return out


PICK_PROMPT = (
    "Pick the provision a renter should see first as the answer: the ordinary rule for a normal tenancy (e.g. the "
    "regular annual limit, the general ban, the general list of allowed reasons), not a ceiling on special or "
    "agency-granted increases, an exception, a procedure, a penalty, or a figure for something else (such as interest "
    "on a deposit). When one provision gives the figure in effect for a period and another gives the maximum that "
    "figure may reach, pick the figure in effect. answers_question: false only if no provision is about what the "
    "renter asks at all.")


def pick(rule, text, name):
    """Luna picks the provision that answers the card question (Jev was tried first: it kept ceilings and hid bans)."""
    cands = candidates(rule, text)
    lines = "\n".join(f"{c['key']}: [{c['provision']}] {_short(c['requirement'], 300)}"
                      + (f" (value: {c['key_value']})" if c["key_value"] else "") for c in cands)
    schema = {"type": "object", "additionalProperties": False, "required": ["choice", "answers_question", "reason"],
              "properties": {"choice": {"type": "string", "enum": [c["key"] for c in cands]},
                             "answers_question": {"type": "boolean"}, "reason": {"type": "string"}}}
    msg = (f"A renter in {name} asks: \"{CARDS[rule['category']]}\"\nBelow are provisions of one law that applies there "
           f"({rule['x_source'].get('citation')}). {PICK_PROMPT}\n\n{lines}")
    out, _ = llm.luna([{"role": "user", "content": msg}], schema, "card_pick", stage="cards", ref=rule["team_rule_id"],
                      max_tokens=4000)
    return cands, out


def answer(rule, text, name, as_of):
    try:
        cands, p = pick(rule, text, name)
    except Exception as e:                       # noqa: BLE001 - a failed pick falls back to the main rule
        cands, p = candidates(rule, text), {"choice": "main", "answers_question": True, "reason": f"pick failed: {e}"[:200]}
    chosen = next((c for c in cands if c["key"] == p["choice"]), cands[0])
    status = "answered" if p["answers_question"] else "related"     # related: shown as related law, never hidden
    out = {"status": status, "reason": p["reason"], "source": chosen["source"], "provision": chosen["provision"],
           "requirement": chosen["requirement"], "key_value": chosen["key_value"], "quote": chosen["quote"]}
    until = value_valid_until(chosen["key_value"], chosen["requirement"])
    out["value_valid_until"] = until
    out["value_current"] = not (until and until < as_of)
    if until and until < as_of:
        out["note"] = f"{chosen['key_value']} applied until {until}; HomeRule's sources have no value for {as_of}."
    return out


def partial_text_notes():
    """(city schema name, category) -> notes for local law HomeRule has only partly: held/excluded sources, code
    publisher links without text. Skipped where a version chain of the city's own law is in use (Newark)."""
    man = json.load(open(config.ROOT / "data" / "supplemental-legal" / "manifest.json"))["sources"]
    chained = {(s["jurisdiction"], c) for s in man if s.get("use_for_rule_extraction") and s.get("version_chain")
               for c in s.get("category_hints", [])}
    links = {}
    for r in csv.DictReader(open(config.MANIFEST, encoding="utf-8")):
        if r["source_type"] == "code publisher" and not r["text_file"]:
            links.setdefault(r["jurisdictions"], []).append(f"{r['doc_id']} {r['url']}")
    notes = {}
    for s in man:
        # city law only; a source excluded because a better one replaced it leaves nothing missing
        if (s.get("use_for_rule_extraction") or ", " not in s["jurisdiction"]
                or s.get("terms_review_status", "").startswith("excluded_replaced")):
            continue
        for c in s.get("category_hints", []):
            if (s["jurisdiction"], c) in chained:
                continue
            n = notes.setdefault((s["jurisdiction"], c), {"kind": "local_text_partial", "held": [], "links": []})
            n["held"].append(f"{s['source_id']} {s['title']} ({s['terms_review_status']})")
            n["links"] = links.get(s["jurisdiction"], [])
    for (city, c), n in notes.items():
        n["text"] = (f"HomeRule doesn't have the full text of {city.split(',')[0]}'s local law on this topic, so this "
                     "card may be incomplete (e.g. a local cap may apply). Check with the city.")
    return notes


def build(as_of=None):
    as_of = as_of or dt.date(2026, 10, 1).isoformat()
    juris = json.load(open(config.ROOT / "contracts" / "jurisdictions.json"))["jurisdictions"]
    by_id = {j["id"]: j for j in juris}
    comps = json.load(open(config.OUT / "rules.compiled.json"))
    texts = {r["team_rule_id"]: r for r in json.load(open(config.OUT / "rules.json"))["rules"]}
    work = [c for c in comps if c["category"] in CARDS
            and c["x_source"].get("effect", "protection_or_duty") == "protection_or_duty"]

    def one(c):
        name = by_id.get(c["jurisdiction"], {}).get("schema_name") or c["jurisdiction"]
        return c, answer(c, texts.get(c["team_rule_id"], {}), name, as_of)

    with ThreadPoolExecutor(8) as ex:
        done = list(ex.map(one, work))
    cards = {}
    for c, a in done:
        slot = cards.setdefault(c["jurisdiction"], {}).setdefault(c["category"], {"question": CARDS[c["category"]], "rules": [], "notes": []})
        slot["rules"].append({"team_rule_id": c["team_rule_id"], "citation": c["x_source"].get("citation"),
                              "effective": c["effective"], "status": c["status"], "answer": a})
    for (city, cat), n in partial_text_notes().items():
        jid = next((j["id"] for j in juris if j.get("schema_name") == city), city)
        cards.setdefault(jid, {}).setdefault(cat, {"question": CARDS[cat], "rules": [], "notes": []})["notes"].append(n)
    out = {"as_of": as_of, "method": "per rule: Luna picks the provision that answers the card question (or marks the rule related); "
                                     "see extract/cards.py", "cards": cards}
    (config.OUT / "cards.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


if __name__ == "__main__":
    o = build(sys.argv[1] if len(sys.argv) > 1 else None)
    from collections import Counter
    print(Counter(r["answer"]["status"] for j in o["cards"].values() for s in j.values() for r in s["rules"]),
          "| notes:", sum(len(s["notes"]) for j in o["cards"].values() for s in j.values()))
