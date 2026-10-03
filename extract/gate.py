"""Verification gate: before a main rule is published, check that each value is what its quote says.

G1 claim support: does the quote state the requirement and the key value?
G2 start date:    which date (among dates code found in the text, plus derived ones) does the rule start?
G3 topic coverage: does the provision also regulate other topics, which then need their own rule?
G4 status:        does the text show the law adopted, pending, failed, or only a draft?

All questions are Jev choices with the document text around the quote as state. Results are written into
out/extracted/<unit>.json under "gate"; G2 adds a provision-scoped start event, G3 triggers one targeted Luna
extraction per uncovered topic, G1/G4 disagreements lower confidence and add review flags. Run:
python3 -m extract.gate
"""
import datetime as dt
import json
from concurrent.futures import ThreadPoolExecutor

from . import config, llm, jev_pass
from .corpus import load_text
from . import luna_pass as L

CONF = 0.8
G2_CONF = 0.6      # a date among the real dates in the text
G3_TRIGGER = 0.4   # p(yes) that triggers a targeted extraction; Luna decides whether a rule exists
WINDOW = 40000
SUPPORT = {"supported": "The quoted text states this, directly or in other words.",
           "partial": "The quoted text states part of it, or states it with conditions that are left out.",
           "not_supported": "The quoted text does not state this, or says something different."}
STATUS = {"adopted": "The text shows the law was enacted or adopted (signed, chaptered, codified, certified).",
          "pending": "The text is a bill or proposal that has not been enacted.",
          "failed": "The text shows the measure failed, was struck or withdrawn.",
          "draft": "The text is an ordinance or bill version whose adoption is not shown (blank signature or "
                   "adoption date, first reading only)."}
TOPIC_YES = {"yes": "Yes, the provision itself regulates this topic.", "no": "No."}


def _unit_text(r):
    entries = [json.load(open(config.INDEX / f"{d}.json")) for d in r["doc_ids"]]
    return entries, [load_text(e) for e in entries]


def _window(text, start, size=WINDOW):
    a = max(0, start - size // 2)
    return text[a:a + size], a


def questions_for_rule(i, o, r, entries, texts):
    """Questions about headline obligation i, and the state text they are asked against."""
    span = r["spans"].get(f".obligations[{i}].requirement_quote")
    if not span:
        return None, None, {}
    d = span["doc_id"]
    k = r["doc_ids"].index(d)
    text, entry = texts[k], entries[k]
    state, off = _window(text, span["start"])
    quote = " ".join(text[span["start"]:span["end"]].split())[:400]
    q = {f"g1_req_{i}": {"type": "choice", "criteria": SUPPORT,
                         "instructions": f'Quoted text: "{quote}". Claim: "{o["requirement"]}". Does the quoted text support the claim?'}}
    if o.get("key_value"):
        q[f"g1_key_{i}"] = {"type": "choice", "criteria": SUPPORT,
                            "instructions": f'Quoted text: "{quote}". Claim: the limit or amount is "{o["key_value"]}". '
                                            "Does the quoted text (or the text around it) support this?"}
    dates = sorted(entry["dates"], key=lambda x: abs(x["start"] - span["start"]))[:30]
    crit = {}
    for x in dates:
        if x["precision"] != "day" or not (off <= x["start"] < off + len(state)):
            continue
        ctx = " ".join(text[max(0, x["start"] - 90):x["end"] + 40].split())
        crit[f"date_{x['iso']}"] = f"{x['text']} (in: \"...{ctx}...\")"
    derived = L_derived(r)
    for iso, how in derived:
        crit.setdefault(f"date_{iso}", f"{iso}: {how}")
    crit["none"] = "None of these dates; the text does not say when this rule started to apply."
    if len(crit) > 1:
        q[f"g2_{i}"] = {"type": "choice", "criteria": crit,
                        "instructions": f'From which date does the rule in this provision apply: "{quote[:300]}"? '
                                        "Pick the date this rule (in its current form) started or starts to apply, "
                                        "not the date of an unrelated provision or a later amendment of other parts."}
    for cat, desc in jev_pass.CATEGORIES.items():
        if cat in ("none", o["category"]):
            continue
        q[f"g3_{cat}_{i}"] = {"type": "choice", "criteria": TOPIC_YES,
                              "instructions": f'Does the provision "{quote[:300]}" itself regulate this topic: {desc}'}
    return state, d, q


def L_derived(r):
    """Dates derived from relative effective-date rules in the unit's events."""
    from .compile import effective
    out = []
    eff = effective(r["luna"]["events"], r["jurisdiction"])
    if eff.get("derived") and eff.get("from"):
        out.append((eff["from"], eff["derived"]))
    return out


def gate_unit(path):
    r = json.load(open(path))
    if "gate" in r:                      # idempotent: a unit is gated once per extraction
        return r["doc_id"], r["gate"]["actions"], sum(len(o.get("gate_flags", [])) for o in r["luna"]["obligations"])
    entries, texts = _unit_text(r)
    obs = r["luna"]["obligations"]
    heads = [i for i, o in enumerate(obs) if o["is_headline"] and o["effect"] == "protection_or_duty" and not o.get("stub")]
    calls = []
    for i in heads:
        state, d, q = questions_for_rule(i, obs[i], r, entries, texts)
        if q:
            calls.append((state, q, f"{r['doc_id']}:{i}"))
    # G4 once per unit, on the start and end of the main document (signatures, certifications)
    t0 = texts[0]
    g4_state = t0[:15000] + "\n...\n" + t0[-15000:] if len(t0) > 30000 else t0
    calls.append((g4_state, {"g4": {"type": "choice", "criteria": STATUS,
                                    "instructions": "What does this text show about the legal status of the law it contains?"}},
                  f"{r['doc_id']}:g4"))

    def one(c):
        a, _ = llm.jev(c[0], c[1], stage="gate", ref=c[2])
        return a

    answers = {}
    with ThreadPoolExecutor(8) as ex:
        for a in ex.map(one, calls):
            answers.update(a)
    log = {"answers": answers, "actions": []}
    for i in heads:
        o = obs[i]
        flags = []
        for k in (f"g1_req_{i}", f"g1_key_{i}"):
            a = answers.get(k)
            if a and a["choice"] == "not_supported" and a["confidence"] >= CONF:
                flags.append(f"{k.split('_')[1]} not supported by its quote ({a['confidence']:.2f})")
        a = answers.get(f"g2_{i}")
        if a and a["choice"].startswith("date_") and a["confidence"] >= G2_CONF:
            iso = a["choice"][5:]
            r["luna"]["events"].append({"kind": "operative", "date": iso, "precision": "day", "relative_rule": "none",
                                        "n": None, "applies_to": o["provision"], "quote": "verification gate G2",
                                        "gate": True})
            log["actions"].append({"rule": o["slug"], "action": "start_date", "date": iso, "confidence": a["confidence"]})
        new_topics = [c for c in jev_pass.CATEGORIES if c not in ("none", o["category"])
                      and (answers.get(f"g3_{c}_{i}") or {}).get("probabilities", {}).get("yes", 0) >= G3_TRIGGER
                      and not any(x["category"] == c and x["effect"] == "protection_or_duty" for x in obs)]
        for c in new_topics:
            added = extract_topic(r, texts, o, c)
            log["actions"].append({"rule": o["slug"], "action": "added_topic", "category": c, "added": added})
        o["gate_flags"] = flags
    g4 = answers.get("g4")
    if g4 and g4["confidence"] >= CONF:
        r["gate_status"] = g4["choice"]
        if g4["choice"] == "draft":
            log["actions"].append({"action": "status_flag", "status": "draft"})
    r["gate"] = log
    json.dump(r, open(path, "w"), indent=1, ensure_ascii=False)
    return r["doc_id"], log["actions"], sum(len(obs[i].get("gate_flags", [])) for i in heads)


def extract_topic(r, texts, o, category):
    """One targeted Luna call: the obligation in this topic stated by the same provision."""
    span = r["spans"].get(f".obligations[{r['luna']['obligations'].index(o)}].requirement_quote")
    k = r["doc_ids"].index(span["doc_id"]) if span else 0
    text = texts[k]
    ctx, _ = _window(text, span["start"] if span else 0, 20000)
    msg = (f"From this provision of document {r['doc_ids'][k]}, extract only the obligation(s) in the topic "
           f"{category} - {jev_pass.CATEGORIES[category]} (same rules as before). A provision can belong to more "
           f"than one topic; the same text may already be extracted under {o['category']} as: "
           f"\"{o['requirement']}\". If the text states a rule that fits this topic's definition, extract it with "
           f"category {category}; if it does not, return no obligations.\n\n=== TEXT ===\n{ctx}")
    out, _ = llm.luna([{"role": "system", "content": L.SYSTEM}, {"role": "user", "content": msg}], L.REPAIR_SCHEMA,
                      "topic", stage="gate_topic", ref=f"{r['doc_id']}:{category}")
    added = 0
    for ob in out["obligations"]:
        if ob["category"] != category:
            continue
        ob["is_headline"], ob["gate_added"] = True, True
        hit = L.locate("\n\n".join(texts), ob["requirement_quote"])
        idx = len(r["luna"]["obligations"])
        r["luna"]["obligations"].append(ob)
        if hit:
            offset = 0
            for d, t in zip(r["doc_ids"], texts):
                if offset <= hit[0] < offset + len(t):
                    r["spans"][f".obligations[{idx}].requirement_quote"] = {
                        "doc_id": d, "version_id": json.load(open(config.INDEX / f"{d}.json"))["version_id"],
                        "start": hit[0] - offset, "end": hit[1] - offset, "method": hit[2]}
                    break
                offset += len(t) + 2
        ob["parse_status"] = "ok" if hit else "partial"
        ob["checks"] = [] if hit else ["requirement_quote not found in the source"]
        added += 1
    return added


def run(units=None, workers=6):
    paths = sorted((config.OUT / "extracted").glob("*.json"))
    if units:
        paths = [p for p in paths if p.stem in units]
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(gate_unit, paths))


if __name__ == "__main__":
    import sys
    for unit, actions, flags in run(sys.argv[1:] or None):
        if actions or flags:
            print(unit, "flags:", flags, "actions:", [(a.get("rule", "")[:30], a["action"], a.get("date") or a.get("category") or a.get("status")) for a in actions])
