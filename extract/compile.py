"""Compile extracted records into the interface files (I2 rules, I8 findings).

out/extracted/*.json -> out/rules.compiled.json (I2), out/rules.json (starter schema), out/findings.json (I8).
Supplemental sources (Sxxx) compile to separate *.supplemental.json files until the organisers confirm they
count for citations. One headline rule per document unit and category; jurisdiction strings map to the IDs in
contracts/jurisdictions.json (I1).
"""
import datetime as dt
import json
import re

from . import config, status as S

AS_OF = config.DEFAULT_AS_OF
JUR = json.load(open(config.ROOT / "contracts" / "jurisdictions.json"))["jurisdictions"]
BY_SCHEMA = {j["schema_name"]: j for j in JUR if j.get("schema_name")}
CAT_CODE = {"rent_increase_limits": "RENT", "just_cause_eviction": "EVICT", "security_deposits": "DEP",
            "application_screening_fees": "FEE", "screening_restrictions": "SCREEN", "algorithmic_rent_setting": "ALG"}


def _first_day_after_months(d, n):
    d = dt.date.fromisoformat(d)
    m = d.month - 1 + n
    return dt.date(d.year + m // 12, m % 12 + 1, 1).isoformat()


def effective(events, jurisdiction, provision=None):
    """from (operative, else effective; explicit or derived), until (repeal), precision, derivation.
    Events scoped to the obligation's own provision (or a parent of it) win over act-level events.
    jurisdiction: a schema name ("CA", "Jersey City, NJ"); statutory defaults depend on state and level."""
    state = jurisdiction.split(", ")[-1]
    city = ", " in jurisdiction
    if provision:
        def related(e):
            a = e.get("applies_to") or "act"
            return a == "act" or provision.startswith(a) or a.startswith(provision)
        own = [e for e in events if (e.get("applies_to") or "act") != "act" and related(e)]
        if any(e["kind"] in ("operative", "effective") for e in own):
            events = own + [e for e in events if e["kind"] in ("enacted", "repealed")]
        else:   # act-level dates only; a date scoped to another provision says nothing about this one
            events = [e for e in events if related(e)]
    enacted = next((e["date"] for e in events if e["kind"] == "enacted" and e.get("date")), None)
    out = {"from": None, "until": None, "precision": "day", "derived": None}
    for kind in ("operative", "effective"):
        cands = []
        for e in events:
            if e["kind"] != kind:
                continue
            d = e.get("date")
            if d and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
                cands.append((d, "the later of the published dates (open question)" if e.get("open_question") else None,
                              "day"))
            elif d and re.fullmatch(r"\d{4}-\d{2}", d):
                cands.append((d + "-01", None, "month"))
            elif e.get("relative_rule") == "first_day_of_nth_month_after_enactment" and enacted and e.get("n"):
                cands.append((_first_day_after_months(enacted[:7] + "-01", int(e["n"])),
                              f"first day of month {int(e['n'])} after enactment {enacted}", "day"))
            elif e.get("relative_rule") == "no_date_in_text" and enacted and state == "CA" and not city:
                cands.append((f"{int(enacted[:4]) + 1}-01-01",
                              f"California default: January 1 after enactment {enacted} (Cal. Const. art. IV § 8(c))", "day"))
            elif e.get("relative_rule") == "no_date_in_text" and enacted and state == "NJ" and city:
                d = (dt.date.fromisoformat(enacted) + dt.timedelta(days=20)).isoformat()
                cands.append((d, f"New Jersey municipal default: 20 days after final passage {enacted} (N.J.S.A. "
                                 "40:49-2(d), 40:69A-181(b)); mayoral approval or publication may make it later", "day"))
        if cands:
            # the version in force now: the latest start on or before as-of, else the earliest future start
            past = sorted(c for c in cands if c[0] <= AS_OF)
            pick = past[-1] if past else sorted(cands)[0]
            out["from"], out["derived"], out["precision"] = pick
            break
    repeals = sorted(e["date"] for e in events if e["kind"] == "repealed" and e.get("date")
                     and re.fullmatch(r"\d{4}-\d{2}-\d{2}", e["date"]))
    out["until"] = repeals[0] if repeals else None
    return out


def status(doc_status, eff, as_of=AS_OF):
    if doc_status in ("failed", "struck"):
        return "failed"
    if doc_status == "pending":
        return "pending"
    if eff["until"] and eff["until"] <= as_of:
        return "repealed"
    if eff["from"] and eff["from"] > as_of:
        return "enacted_not_effective"
    return "in_force"


def to_node(n):
    """Internal condition node -> I7/I2 compact Node."""
    k = n["kind"]
    if k == "always":
        return True
    if k == "never":
        return False
    if k in ("all", "any"):
        return {k: [to_node(c) for c in n["children"]]}
    if k == "not":
        return {"not": to_node(n["children"][0])}
    if k == "fact":
        return {"fact": n["fact"], "op": n["op"], "value": n["values"] if n["op"] == "in" else n["value"]}
    if k == "age_years":
        return {"age_years": {"op": n["op"], "n": n["years"]}}
    if k == "ref":
        return {"ref": n["ref"]}
    return {"unparsed": n.get("quote") or ""}


def _core(citation):
    m = re.search(r"\d+[A-Za-z]?(?:[.:-]\d+[A-Za-z½]*)*", citation or "")
    return m.group(0) if m else re.sub(r"\W+", "", (citation or "x"))[:12]


_TEXT = {}


def source_span(span):
    """The verbatim source text at a located span (never the model's copy)."""
    vid = span["version_id"]
    if vid not in _TEXT:
        _TEXT[vid] = (config.VERSIONS / f"{vid.split(':', 1)[1]}.txt").read_bytes().decode("utf-8")
    return _TEXT[vid][span["start"]:span["end"]]


def open_questions():
    """(schema jurisdiction, category) -> open-question findings from extract/open_questions.py."""
    path = config.OUT / "open_questions.json"
    out = {}
    for f in json.load(open(path)) if path.exists() else []:
        name = next((k for k, j in BY_SCHEMA.items() if j["id"] == f["jurisdiction"]), f["jurisdiction"])
        out.setdefault((name, f["category"]), []).append(f)
    return out


def internal_rules(extracted_dir=None, as_of=AS_OF):
    """Headline rules in the internal format the reference evaluator and the tests use."""
    rules, seen = [], {}
    oq = open_questions()
    for f in sorted((extracted_dir or config.EXTRACTED).glob("*.json")):
        r = json.load(open(f))
        jur = r["jurisdiction"]
        state = jur.split(", ")[-1] if ", " in jur else jur
        lu = r["luna"]
        for n, o in enumerate(lu["obligations"]):
            if not o["is_headline"] or o["effect"] == "procedure_or_admin":
                continue
            key = (jur, o["category"], _core(o["citation"]), o["effect"])
            if key in seen:      # same citation: one record, the other headline provisions kept as its details
                span = r["spans"].get(f".obligations[{n}].requirement_quote")
                seen[key]["details"].append({"provision": o["provision"], "requirement": o["requirement"],
                                             "key_value": o["key_value"], "source_doc_id": span["doc_id"] if span else None,
                                             "quote": source_span(span) if span else None})
                continue
            span = r["spans"].get(f".obligations[{n}].requirement_quote")
            doc_status, status_evidence, events = lu["document_status"], None, lu["events"]
            questions = oq.get((jur, o["category"]), [])
            if doc_status == "pending" and ", " in jur and not o.get("stub"):     # a city ordinance read as a draft
                said = [f"{q['note']} " + "; ".join(f"{c['value']} ({c['source']})" for c in q["claims"]) for q in questions]
                verdict, evidence, _ = S.corroborate(r["doc_ids"][0], jur, o["citation"], o["title"], r["source_urls"][0],
                                                     said)
                status_evidence = {"verdict": verdict, **evidence}
                if verdict == "adopted":
                    doc_status = "enacted"
            dated = sorted(c["iso_date"] for q in questions if q["question_kind"] == "dates_disagree"
                           for c in q["claims"] if c["iso_date"])
            if doc_status == "pending" and len(dated) >= 2 and status_evidence:
                # two sources each publish an effective date: the law was adopted, whichever date is right
                doc_status = "enacted"
                status_evidence["verdict"] = "adopted"
                status_evidence["basis"] = "published effective dates (open question): " + ", ".join(dated)
            if dated and doc_status == "enacted" and not effective(events, jur, o["provision"])["from"]:
                # the text gives no date; published dates disagree: the later one, flagged as an open question
                events = events + [{"kind": "effective", "date": dated[-1], "precision": "day", "relative_rule": "none",
                                    "n": None, "applies_to": "act", "quote": "open question: published dates disagree",
                                    "open_question": True}]
            rules.append({
                "id": f"{r['doc_id']}:{n}:{o['slug']}", "unit": r["doc_id"], "jurisdiction": jur, "state": state,
                "category": o["category"], "citation": o["citation"], "effect": o["effect"], "title": o["title"],
                "requirement": o["requirement"], "provision": o["provision"],
                "requirement_quote": source_span(span) if span else None,    # verbatim from the pinned source
                "quote_located": bool(span),
                "source_doc_id": span["doc_id"] if span else r["doc_ids"][0],
                "source_url": r["source_urls"][r["doc_ids"].index(span["doc_id"])] if span else r["source_urls"][0],
                "retrieved": r["retrieved"][0], "document_status": doc_status, "status_evidence": status_evidence,
                "events": events,
                "key_value": o["key_value"], "cap_low": o["cap_pct_low"], "cap_high": o["cap_pct_high"],
                "coverage_conditions": o["coverage_conditions"], "exemptions": o["exemptions"],
                "applies_if": o["applies_if"], "exempt_if": o["exempt_if"],
                "key_value_conditions": o["key_value_conditions"], "tenant_conditions": o["tenant_conditions"],
                "interactions": o["interactions"], "parse_status": o.get("parse_status", "ok"),
                "checks": o.get("checks", []) + o.get("gate_flags", []), "gate_flags": o.get("gate_flags", []),
                "gate_status": r.get("gate_status"), "stub": o.get("stub", False),
                "enacting_level": o.get("enacting_level"),
                "origin": {"S": "supplemental", "X": "ingested"}.get(r["doc_id"][0], "starter"), "details": []})
            seen[key] = rules[-1]
    return attribute(rules)


def attribute(rules):
    """Gate G5 (which government made the rule) decides where a rule belongs. A federal law is not a rule of any
    jurisdiction here; a statewide state law described on a city's page is the state's rule: dropped when the
    state rule is already extracted (same category and citation), else filed under the state."""
    out = []
    for r in rules:
        lvl = r.get("enacting_level")
        if lvl == "federal":
            continue
        if lvl == "state_statewide" and ", " in r["jurisdiction"]:
            if any(x["jurisdiction"] == r["state"] and x["category"] == r["category"]
                   and _core(x["citation"]) == _core(r["citation"]) and x["effect"] == r["effect"] for x in rules):
                continue
            r = {**r, "jurisdiction": r["state"], "refiled_from": r["jurisdiction"]}
        out.append(r)
    return out


def compiled(rule):
    j = BY_SCHEMA.get(rule["jurisdiction"], {})
    eff = effective(rule["events"], rule["jurisdiction"], rule.get("provision"))
    inter = rule["interactions"][0] if rule["interactions"] else None
    return {
        "team_rule_id": f"{j.get('id', rule['jurisdiction'])}-{CAT_CODE[rule['category']]}-{_core(rule['citation'])}",
        "jurisdiction": j.get("id", rule["jurisdiction"]), "level": j.get("level", "state"),
        "category": rule["category"], "status": status(rule["document_status"], eff), "effective": eff,
        "applies_if": to_node(rule["applies_if"]), "exempt_if": to_node(rule["exempt_if"]),
        "tenant_conditions": [t["text"] for t in rule["tenant_conditions"]],
        "key_value": rule["key_value"],
        "key_value_conditions": [{"value": b["value"], "when": to_node(b["when"]), "tenant_note": b.get("tenant_note")}
                                 for b in rule["key_value_conditions"]],
        "interaction": ({"type": inter["type"], "target_category": inter["target_category"], "quote": inter["quote"]}
                        if inter else {"type": "none"}),
        "interactions": [{"type": i["type"], "target_category": i["target_category"], "quote": i["quote"]}
                         for i in rule["interactions"]],
        "retrieved_at": rule["retrieved"], "parse_status": rule["parse_status"], "checks": rule["checks"],
        "x_source": {"unit": rule["unit"], "source_doc_id": rule["source_doc_id"], "citation": rule["citation"],
                     "effect": rule["effect"], "cap_pct_low": rule["cap_low"], "cap_pct_high": rule["cap_high"],
                     "status_evidence": rule.get("status_evidence"),
                     "origin": rule["origin"], "stub": rule["stub"]},
        "details": rule.get("details", []),   # other headline provisions under the same citation
    }


STARTER_STATUS = {"in_force": "in_force", "enacted_not_effective": "not_yet_effective", "pending": "pending",
                  "failed": "failed"}


def starter_record(rule, comp):
    if comp["status"] == "repealed" or not rule["requirement_quote"]:     # no verbatim quote: compiled only
        return None
    j = BY_SCHEMA.get(rule["jurisdiction"], {})
    return {
        "team_rule_id": comp["team_rule_id"], "jurisdiction": rule["jurisdiction"], "level": j.get("level", "state"),
        "category": rule["category"], "status": STARTER_STATUS[comp["status"]], "title": rule["title"],
        "requirement": rule["requirement"], "key_value": rule["key_value"],
        "coverage_conditions": rule["coverage_conditions"], "exemptions": rule["exemptions"],
        "overrides": [], "interaction": comp["interaction"]["type"] if comp["interaction"]["type"] != "none" else None,
        "effective_date": comp["effective"]["from"], "citation": rule["citation"],
        "source_doc_id": rule["source_doc_id"], "source_url": rule["source_url"],
        "quoted_span": rule["requirement_quote"],
        "confidence": 0.9 if rule["parse_status"] == "ok" and not rule.get("gate_flags") else 0.5,
        "conflict_flag": comp["interaction"]["type"] == "may_preempt_local", "conflict_note": None,
    }


def findings(rules):
    """I8: bans on local rules from the extracted text, and jurisdiction x category cells with no text at all."""
    out = []
    for r in rules:
        if r["effect"] == "bars_or_limits_local_rules":
            out.append({"jurisdiction": BY_SCHEMA.get(r["jurisdiction"], {}).get("id", r["jurisdiction"]),
                        "category": r["category"], "kind": "barred_by_law", "citation": r["citation"],
                        "quote": r["requirement_quote"], "source_doc_ids": [r["source_doc_id"]],
                        "note": "Bars or limits local rules on this topic in this state."})
    links = config.OUT / "link_findings.json"         # manifest links classified by extract/links.py
    if links.exists():
        for f in json.load(open(links)):
            out.append({**f, "citation": f"manifest link: {f['url']}"})
    for qs in open_questions().values():            # the guide's open questions, with both sources
        out += qs
    inv = json.load(open(config.OUT / "inventory.json"))
    for name, info in inv.items():
        if not info["has_text"]:
            j = BY_SCHEMA.get(name, {})
            for cat in CAT_CODE:
                out.append({"jurisdiction": j.get("id", name), "category": cat, "kind": "not_in_corpus",
                            "citation": None, "quote": None,
                            "source_doc_ids": [d["doc_id"] for d in info["documents"]],
                            "note": "Only manifest links (no supplied text) for this jurisdiction."})
    return out


def build(extracted_dir=None, suffix=""):
    rules = internal_rules(extracted_dir)
    comps = [compiled(r) for r in rules]
    seen = {}
    for c in comps:          # team_rule_id must be unique: a repeat gets a deterministic suffix, never aborts a run
        n = seen.get(c["team_rule_id"], 0)
        seen[c["team_rule_id"]] = n + 1
        if n:
            print(f"warning: duplicate team_rule_id {c['team_rule_id']} -> suffix -{n + 1}")
            c["team_rule_id"] = f"{c['team_rule_id']}-{n + 1}"
    starter = [rec for rec in (starter_record(r, c) for r, c in zip(rules, comps)) if rec]   # starter, supplemental, ingested
    (config.OUT / f"rules.compiled{suffix}.json").write_text(json.dumps(comps, indent=1, ensure_ascii=False))
    (config.OUT / f"rules{suffix}.json").write_text(json.dumps({"rules": starter}, indent=1, ensure_ascii=False))
    finds = findings(rules)
    (config.OUT / f"findings{suffix}.json").write_text(json.dumps(finds, indent=1, ensure_ascii=False))
    from . import audit                    # curated per-rule trail for the rule page, and one line per build
    trail = audit.build(rules, comps, finds, open_questions())
    (config.OUT / f"audit{suffix}.json").write_text(json.dumps(trail, indent=1, ensure_ascii=False))
    audit.log_build(len(comps), len(finds))
    return rules, comps


if __name__ == "__main__":
    rules, comps = build()
    from collections import Counter
    print(len(comps), "compiled rules;", Counter(c["status"] for c in comps), Counter(c["parse_status"] for c in comps))
