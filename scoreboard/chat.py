"""HomeRule chatbot: answers a renter's question for a city and date only from HomeRule's extracted law.

Retrieval is code, not a model: the city's jurisdiction stack (state + city) from contracts/jurisdictions.json,
the rules for the question's topic from out/rules.compiled.json + out/rules.json, each with its status on the
asked date (in force / not yet effective / pending / repealed), and the findings for that topic (barred by
state law, failed measure, open legal question, no text in the corpus). The model only writes the answer from
those records and cites them. The plain chatbot gets the same question and model without the records.

python3 -m scoreboard.chat "Boston, MA" 2026-10-01 "How much can my rent go up?"
"""
import json
import re
import sys
from pathlib import Path

from extract import config, llm

ROOT = Path(__file__).resolve().parent.parent
MODEL = "openai/gpt-6-luna"
CARD_CATEGORY = {
    "How much can my rent go up?": "rent_increase_limits",
    "When can they end my tenancy?": "just_cause_eviction",
    "How much deposit can they ask?": "security_deposits",
    "What can they charge me to apply?": "application_screening_fees",
    "What can they check about me?": "screening_restrictions",
    "Can rent-setting software be used on my rent?": "algorithmic_rent_setting",
}
SYSTEM = (
    "You are HomeRule. You answer a renter's question about the law for one city on one date, using ONLY the "
    "records below, which HomeRule extracted from official law texts. Rules: say what applies on that date "
    "(in force, not yet effective with its start date, pending bill, struck or failed measure); when a rule "
    "depends on the building (age, size, type), say what it depends on instead of guessing; when a higher law "
    "may override a local one, say so; cite each rule you use by its citation; if the records don't cover the "
    "question, say HomeRule doesn't have that law, never fill in from memory. Plain language, at most 120 words. "
    "This is information, not legal advice.\n\n"
    "Record format: rules[].status_on_date is computed for the asked date: in_force, not_yet_effective (starts "
    "on effective_from), pending (a bill, not law), repealed, failed. relation_to_local_rules: yields_to_local = "
    "gives way where a local rule covers the unit; may_preempt_local = a state law that bars or may override "
    "local rules. findings[].kind: barred_by_law = state law bars local rules on this topic; measure_failed = a "
    "ballot question or bill on this topic failed or was struck (its citation link says which); open_question = "
    "published sources disagree or a higher law may override, with both claims; not_in_corpus = a law or news "
    "item is listed but HomeRule has no text for it. If no rule is in force for this city and topic on the date, "
    "say plainly that HomeRule's records show no such limit or ban in force then."
)


def _jurisdictions():
    return json.load(open(ROOT / "contracts" / "jurisdictions.json"))["jurisdictions"]


def stack(city):
    """'Jersey City, NJ' -> ['NJ', 'NJ-JERSEY-CITY'] (state first; counties carry no rules)."""
    by_name = {j.get("schema_name"): j for j in _jurisdictions()}
    by_id = {j["id"]: j for j in _jurisdictions()}
    j = by_name[city]
    out = [j["id"]]
    while j.get("parent"):
        j = by_id[j["parent"]]
        if j.get("rules", True) and j.get("level") != "county":
            out.insert(0, j["id"])
    return out


def status_on(comp, date):
    st = comp["status"]
    if st in ("pending", "failed"):
        return st
    eff = comp["effective"]
    if eff.get("until") and eff["until"] <= date:
        return "repealed"
    if eff.get("from") and eff["from"] > date:
        return "not_yet_effective"
    return "in_force"


def _source_text(doc_id):
    for path in (ROOT / "data" / "realpage-starter" / "corpus" / "text" / f"{doc_id}.txt",
                 ROOT / "data" / "supplemental-legal" / "text" / f"{doc_id}.txt"):
        if path.exists():
            return path.read_text(encoding="utf-8")
    return None


def excerpt(doc_id, quote, after=700):
    """The quote and the text that follows it in the pinned source (lists and definitions often follow)."""
    text = _source_text(doc_id) if doc_id and quote else None
    if not text:
        return None
    words = quote.split()
    pattern = r"\s+".join(re.escape(w) for w in words)
    m = re.search(pattern, text)
    if not m:
        return None
    return " ".join(text[m.start():m.end() + after].split())


DEFINITION = re.compile(r"[“\"]([^”\"]{3,60})[”\"]\s+means\b")


def definitions(doc_id, *texts, limit=3, size=500):
    """Definitions in the same source ('"X" means ...') of terms the rule uses."""
    src = _source_text(doc_id) if doc_id else None
    if not src:
        return []
    used = " ".join(t for t in texts if t).lower()
    out = []
    for m in DEFINITION.finditer(src):
        if m.group(1).lower() in used:
            out.append(" ".join(src[m.start():m.start() + size].split()))
            if len(out) == limit:
                break
    return out


def records(city, category, date):
    """The rules and findings HomeRule has for this city's stack and topic, as of the date."""
    ids = stack(city)
    by_id = {j["id"]: j for j in _jurisdictions()}
    comps = json.load(open(config.OUT / "rules.compiled.json"))
    texts = {r["team_rule_id"]: r for r in json.load(open(config.OUT / "rules.json"))["rules"]}
    rules = []
    for c in comps:
        if c["jurisdiction"] not in ids or c["category"] != category:
            continue
        t = texts.get(c["team_rule_id"], {})
        rules.append({
            "level": c["level"], "jurisdiction": by_id[c["jurisdiction"]].get("schema_name", c["jurisdiction"]),
            "citation": c["x_source"].get("citation") or t.get("citation"),
            "status_on_date": status_on(c, date), "effective_from": c["effective"].get("from"),
            "effective_until": c["effective"].get("until"),
            "requirement": t.get("requirement"), "key_value": c.get("key_value"),
            "who_it_covers": t.get("coverage_conditions"), "exemptions": t.get("exemptions"),
            "relation_to_local_rules": (c.get("interaction") or {}).get("type"),
            "source_excerpt": excerpt(t.get("source_doc_id"), t.get("quoted_span")) or t.get("quoted_span"),
            "source_url": t.get("source_url"),
            "definitions_in_source": definitions(t.get("source_doc_id"), t.get("requirement"), t.get("quoted_span")),
            "more_provisions_of_this_law": [
                {"requirement": d["requirement"], "key_value": d.get("key_value"),
                 "source_excerpt": excerpt(d.get("source_doc_id"), d.get("quote"), 300) or d.get("quote")}
                for d in c.get("details", [])]})
    finds = []
    for f in json.load(open(config.OUT / "findings.json")):
        if f["jurisdiction"] in ids and f["category"] == category:
            finds.append({k: f.get(k) for k in ("jurisdiction", "kind", "note", "citation", "quote", "claims")
                          if f.get(k) is not None})
    return {"city": city, "date": date, "jurisdictions": ids, "topic": category, "rules": rules, "findings": finds}


def _chat(messages, stage, ref, model=MODEL):
    body = {"model": model, "messages": messages, "max_tokens": 4000, "reasoning": {"effort": "medium"}}
    resp = llm._cached("chat", body, 0, stage, ref, lambda: llm._post("/v1/chat/completions", body))
    return resp["choices"][0]["message"]["content"].strip(), resp.get("model")


def question_text(city, date, card):
    return f"As of {date}, for a renter in {city}: {card}"


def ask_homerule(city, date, card, ref="adhoc"):
    recs = records(city, CARD_CATEGORY[card], date)
    msgs = [{"role": "system", "content": SYSTEM + "\n\n=== RECORDS ===\n" + json.dumps(recs, ensure_ascii=False, indent=1)},
            {"role": "user", "content": question_text(city, date, card)}]
    answer, model = _chat(msgs, "scoreboard_homerule", ref)
    return answer, model, recs


def ask_plain(city, date, card, ref="adhoc", model=MODEL):
    answer, used = _chat([{"role": "user", "content": question_text(city, date, card)}], "scoreboard_plain", ref, model)
    return answer, used


if __name__ == "__main__":
    city, date, card = sys.argv[1:4]
    ans, model, recs = ask_homerule(city, date, card)
    print(f"[{len(recs['rules'])} rules, {len(recs['findings'])} findings for {recs['jurisdictions']}]\n{ans}")
