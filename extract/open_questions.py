"""The guide's known open questions (starter README, section "Known open questions") as I8 findings with both sources.

One Luna call reads that section into items: jurisdictions, topic, kind, and the competing claims with who makes
each. Code matches each item to our rules by jurisdiction and category; one Jev call matches each claim's source
to a manifest row of those jurisdictions (e.g. a law-firm alert that is only a link). Each item becomes an
`open_question` finding: our rule's own source (citation, quote, date) next to the other claims and their sources.
Never changes a rule or a result. Writes out/open_questions.json. Run: python3 -m extract.open_questions
"""
import csv
import json
import re

from . import config, llm, jev_pass, compile as C
from .corpus import load_text

KINDS = {"dates_disagree": "sources give different effective dates",
         "may_be_preempted": "a higher law may override it",
         "no_official_value": "no single official figure or value is published",
         "other": "another open question"}

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["items"], "properties": {"items": {
    "type": "array", "items": {"type": "object", "additionalProperties": False,
                               "required": ["jurisdictions", "category", "kind", "summary", "claims"],
                               "properties": {
                                   "jurisdictions": {"type": "array", "items": {"type": "string"}},
                                   "category": {"type": "string", "enum": [c for c in jev_pass.CATEGORIES if c != "none"]},
                                   "kind": {"type": "string", "enum": list(KINDS)},
                                   "summary": {"type": "string"},
                                   "claims": {"type": "array", "items": {
                                       "type": "object", "additionalProperties": False,
                                       "required": ["value", "iso_date", "source"],
                                       "properties": {"value": {"type": "string"},
                                                      "iso_date": {"type": ["string", "null"]},
                                                      "source": {"type": "string"}}}}}}}}}


def section():
    text = (config.STARTER / "README.md").read_text(encoding="utf-8")
    m = re.search(r"^##[^\n]*open questions[^\n]*\n(.*?)(?=^## |\Z)", text, flags=re.S | re.M | re.I)
    return m.group(0).strip() if m else None


def read_items(text, rules):
    names = sorted(C.BY_SCHEMA)
    known = "\n".join(sorted({f"- [{r['source_doc_id']}] {r['jurisdiction']} | {r['category']} | {r['citation']} | "
                               f"{r['requirement'][:120]}" for r in rules}))
    heads = []
    for d in sorted({r["source_doc_id"] for r in rules}):
        e = json.load(open(config.INDEX / f"{d}.json"))
        heads.append(f"[{d}] " + " ".join(load_text(e)[e["body_start"]:e["body_start"] + 900].split()))
    known += "\n\n=== OPENING LINES OF THEIR SOURCES ===\n" + "\n".join(heads)
    msg = ("Below is a section of the challenge guide listing open questions in the law. Return one item per "
           "question. jurisdictions: names exactly from this list (the jurisdictions the question concerns; a "
           f"state law that may override city laws concerns the cities): {names}. category: the housing topic "
           f"({json.dumps({k: v for k, v in jev_pass.CATEGORIES.items() if k != 'none'})}). kind: "
           f"{json.dumps(KINDS)}. claims: each competing statement (a date or a value) with who makes it, "
           "as written; iso_date only when the claim is a date (first day of the month when only a month is "
           "given). summary: one sentence, neutral. Use the rules extracted so far (below) to tell which topic a named law "
           "is about.\n\n=== RULES EXTRACTED SO FAR ===\n" + known + "\n\n=== SECTION ===\n" + text)
    out, _ = llm.luna([{"role": "user", "content": msg}], SCHEMA, "open_questions", stage="open_questions",
                      ref="guide")
    return out["items"]


def match_sources(items, rows):
    """Jev: which manifest row is each claim's source? 'none' when no listed row fits."""
    q = {}
    for i, it in enumerate(items):
        cands = [r for r in rows if r["jurisdictions"] in it["jurisdictions"]]
        if not cands:
            continue
        crit = {r["doc_id"]: f"{r['source_type']}: {r['url']}" for r in cands}
        crit["none"] = "None of these sources."
        for k, c in enumerate(it["claims"]):
            q[f"i{i}_c{k}"] = {"type": "choice", "criteria": crit,
                               "instructions": f'Which listed source is "{c["source"]}", the source of the claim '
                                               f'"{c["value"]}"?'}
    if not q:
        return {}
    state = "\n".join(f"[{r['doc_id']}] {r['jurisdictions']} | {r['source_type']} | {r['url']}" for r in rows)
    answers, _ = llm.jev(state, q, stage="jev_open_question_sources", ref="guide")
    return answers


def run():
    text = section()
    if not text:
        return []
    rules = [r for r in C.internal_rules() if r["effect"] == "protection_or_duty"]
    items = read_items(text, rules)
    rows = list(csv.DictReader(open(config.MANIFEST, encoding="utf-8")))
    by_id = {r["doc_id"]: r for r in rows}
    answers = match_sources(items, rows)
    out = []
    for i, it in enumerate(items):
        mine = [r for r in rules if r["jurisdiction"] in it["jurisdictions"] and r["category"] == it["category"]]
        dates = {C.effective(r["events"], r["state"], r.get("provision")).get("from"): r for r in mine}
        claims = []
        for k, c in enumerate(it["claims"]):
            a = answers.get(f"i{i}_c{k}")
            d = a["choice"] if a and a["choice"] != "none" and a["confidence"] >= 0.6 else None
            how = "jev" if d else None
            if not d and c["iso_date"] and c["iso_date"] in dates:          # the claim is the date our own rule's source gives
                d, how = dates[c["iso_date"]]["source_doc_id"], "same date as our rule"
            claims.append({**c, "source_doc_id": d, "url": by_id[d]["url"] if d in by_id else None,
                           "matched_by": how, "match_confidence": a["confidence"] if a else None})
        for jur in it["jurisdictions"]:
            ours = [r for r in mine if r["jurisdiction"] == jur]
            if it["kind"] == "may_be_preempted":           # the state law that may override this city's rule
                ours += [r for r in rules if r["jurisdiction"] == jur.split(", ")[-1] and r["category"] == it["category"]
                         and r["jurisdiction"] != jur]
            out.append({
                "jurisdiction": C.BY_SCHEMA.get(jur, {}).get("id", jur), "category": it["category"],
                "kind": "open_question", "question_kind": it["kind"], "note": it["summary"],
                "claims": claims, "citation": "guide: known open questions in the law",
                "quote": None, "source_doc_ids": sorted({c["source_doc_id"] for c in claims if c["source_doc_id"]}
                                                        | {r["source_doc_id"] for r in ours}),
                "our_rules": [{"id": r["id"], "citation": r["citation"], "source_doc_id": r["source_doc_id"],
                               "effective": C.effective(r["events"], r["state"], r.get("provision")),
                               "key_value": r.get("key_value"), "quote": r["requirement_quote"]} for r in ours]})
    (config.OUT / "open_questions.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


if __name__ == "__main__":
    for f in run():
        print(f["jurisdiction"], f["category"], f["question_kind"], "| ours:",
              [(r["citation"], r["effective"].get("from")) for r in f["our_rules"]],
              "| claims:", [(c["value"][:40], c["iso_date"], c["source_doc_id"]) for c in f["claims"]])
