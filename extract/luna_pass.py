"""Per document: one Jev call (bounded labels), one Luna call (free extraction), code checks,
and at most one targeted Luna repair call for the obligations that fail the checks.

Conditions use only the building facts in contracts/facts.json (interface I7). Anything about the
tenant or the lease stays plain text (tenant_conditions, or tenant_note on an alternative amount).
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor

from . import config, llm, jev_pass, jev_check, parts as P
from .corpus import load_text

I7 = json.load(open(config.ROOT / "contracts" / "facts.json"))
FACT_NAMES = [f["name"] for f in I7["facts"]]
CATEGORIES = list(jev_pass.CATEGORIES)[:-1]
EVENT_KINDS = ["enacted", "effective", "operative", "repealed", "introduced", "failed", "struck"]
RELATIVE = ["none", "first_day_of_nth_month_after_enactment", "n_days_after_enactment", "no_date_in_text"]
INTERACTIONS = ["yields_to_local", "coexists", "may_preempt_local"]
REFS = ["local_rent_control", "local_just_cause"]

NODE = {
    "type": "object", "additionalProperties": False,
    "required": ["kind", "children", "fact", "op", "value", "values", "years", "ref", "quote"],
    "properties": {
        "kind": {"type": "string", "enum": ["all", "any", "not", "fact", "age_years", "ref", "always", "never", "unparsed"]},
        "children": {"type": "array", "items": {"$ref": "#/$defs/node"}},
        "fact": {"type": ["string", "null"], "enum": FACT_NAMES + [None]},
        "op": {"type": ["string", "null"], "enum": ["eq", "ne", "lt", "le", "gt", "ge", "in", None]},
        "value": {"type": ["number", "boolean", "string", "null"]},
        "values": {"type": ["array", "null"], "items": {"type": "string"}},
        "years": {"type": ["number", "null"]},
        "ref": {"type": ["string", "null"], "enum": REFS + [None]},
        "quote": {"type": ["string", "null"]},
    },
}


def nullable(t):
    return {"type": [t, "null"]}


OBLIGATION = {
    "type": "object", "additionalProperties": False,
    "required": ["provision", "slug", "title", "category", "effect", "is_headline", "citation", "requirement",
                 "requirement_quote", "key_value", "key_value_quote", "cap_pct_low", "cap_pct_high",
                 "coverage_conditions", "exemptions", "applies_if", "exempt_if", "key_value_conditions",
                 "tenant_conditions", "interactions", "penalty"],
    "properties": {
        "provision": {"type": "string"}, "slug": {"type": "string"}, "title": {"type": "string"},
        "category": {"type": "string", "enum": CATEGORIES},
        "effect": {"type": "string", "enum": ["protection_or_duty", "bars_or_limits_local_rules", "procedure_or_admin"]},
        "is_headline": {"type": "boolean"},
        "citation": {"type": "string"},
        "requirement": {"type": "string"}, "requirement_quote": {"type": "string"},
        "key_value": nullable("string"), "key_value_quote": nullable("string"),
        "cap_pct_low": nullable("number"), "cap_pct_high": nullable("number"),
        "coverage_conditions": nullable("string"), "exemptions": nullable("string"),
        "applies_if": {"$ref": "#/$defs/node"}, "exempt_if": {"$ref": "#/$defs/node"},
        "key_value_conditions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["value", "when", "tenant_note", "quote"],
            "properties": {"value": {"type": "string"}, "when": {"$ref": "#/$defs/node"},
                           "tenant_note": nullable("string"), "quote": {"type": "string"}}}},
        "tenant_conditions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["text", "quote"],
            "properties": {"text": {"type": "string"}, "quote": {"type": "string"}}}},
        "interactions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["type", "target_category", "quote"],
            "properties": {"type": {"type": "string", "enum": INTERACTIONS},
                           "target_category": {"type": "string", "enum": CATEGORIES},
                           "quote": {"type": "string"}}}},
        "penalty": nullable("string")},
}

SCHEMA = {
    "type": "object", "additionalProperties": False, "$defs": {"node": NODE},
    "required": ["document_status", "status_quote", "events", "obligations"],
    "properties": {
        "document_status": {"type": "string", "enum": ["enacted", "pending", "failed", "struck", "unclear"]},
        "status_quote": nullable("string"),
        "events": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["kind", "date", "precision", "relative_rule", "n", "applies_to", "quote"],
            "properties": {
                "kind": {"type": "string", "enum": EVENT_KINDS},
                "date": nullable("string"),
                "precision": {"type": ["string", "null"], "enum": ["day", "month", "year", None]},
                "relative_rule": {"type": "string", "enum": RELATIVE},
                "n": nullable("number"),
                "applies_to": {"type": "string"},
                "quote": {"type": "string"}}}},
        "obligations": {"type": "array", "items": OBLIGATION},
    },
}
REPAIR_SCHEMA = {"type": "object", "additionalProperties": False, "$defs": {"node": NODE},
                 "required": ["obligations"], "properties": {"obligations": {"type": "array", "items": OBLIGATION}}}


def fact_doc():
    lines = []
    for f in I7["facts"]:
        vals = f" values: {f['values']}." if f.get("values") else ""
        lines.append(f"- {f['name']} ({f['type']}, ops {f['ops']}, compare with {f['value_type']}).{vals} {f['source']}")
    return "\n".join(lines)


SYSTEM = f"""You turn housing-law documents into obligation records. Read the whole document.

Output one obligation per distinct duty, limit, prohibition or right that a landlord, tenant or other party has
(e.g. a deposit cap, a deduction rule and a return deadline in the same section are three obligations).
For a document that only announces or summarises a law, extract the obligations it states. For a bill that is
not enacted, extract the obligations it would create (document_status records that it is pending).

Quotes: every *_quote and every condition's "quote" must be copied character for character from the document,
one contiguous passage, at most 300 characters. Never paraphrase or join passages in a quote.

Conditions (applies_if, exempt_if, key_value_conditions[].when) may use ONLY these building facts:
{fact_doc()}
Condition nodes:
- all / any / not with at least one child; always / never for trivial conditions.
- fact: compare one of the facts above with op and value (op "in" uses values). Dates as YYYY-MM-DD.
  "on or before <date>" is le, "after <date>" is gt, "no more than N" is le, "more than N" is gt.
- age_years: the building's age (from built) compared with years; "within the previous 15 years" is lt 15.
- ref: whether local rent control (local_rent_control) or local just-cause rules (local_just_cause) cover the
  building. Only state rules may use ref; a city's own ordinance never refers to itself (write its coverage).
- unparsed: a building or owner property the facts cannot express; put its text in quote.
Housing restricted or subsidised as affordable housing is subsidised = true. Single-family homes and condos (units
sold separately) are use_class single_family / condo. A condition on how many units or properties the OWNER owns
uses units: a building's own unit count is a lower bound on what its owner owns (e.g. "owner has no more than four
units" becomes units le 4).
Every address we evaluate is a residential rental building, so never encode the law's general scope
("residential property", "a rental agreement", "a landlord") as a condition: use always.
Conditions about the tenant, the lease, an agreement or how the tenancy ends are not building facts: write them
as tenant_conditions (plain text), or as tenant_note on an alternative amount.
The coverage of a local ordinance (which buildings it covers, e.g. by construction or certificate date, unit
count or building type) goes into applies_if/exempt_if of every obligation that ordinance imposes, even when the
coverage is stated in another sentence or another document of the same bundle.
exempt_if: the cases where the obligation does not apply; never if there are none. Do not write always.

key_value_conditions: alternative amounts of key_value and the building/owner condition for each. A provision
that sets a different amount "notwithstanding" the main one (e.g. a higher cap for small landlords) is an
alternative amount of the main obligation, not a separate obligation.

interactions: relations between this obligation and local (city) rules on the same topic. If a provision
exempts housing covered by a stricter local rule, do not put that in exempt_if: add yields_to_local. If the act
forbids or limits local ordinances on its topic, add may_preempt_local to the act's main obligations. Use
coexists only when the text says local rules continue to apply alongside.
effect: protection_or_duty for duties, limits and rights; bars_or_limits_local_rules for a provision that forbids
or restricts cities from adopting rules (it protects no tenant by itself); procedure_or_admin for reporting,
enforcement mechanics and administration.
is_headline: true for the main obligation of each law in each topic (the cap, the ban, the core duty), false for
supporting provisions.
cap_pct_low / cap_pct_high: for rent-increase caps only, the lowest and highest annual increase in percent the
cap can allow (e.g. "3% plus CPI, max 8%" gives 3 and 8; "2.5%" gives 2.5 and 2.5). Otherwise null.

events: dates the law was enacted, takes effect, becomes operative, is repealed, introduced, failed or struck.
If the effective date is defined relative to enactment ("the first day of the twelfth month next following
enactment"), set relative_rule and n and leave date null. If the text gives no effective date, add an
"effective" event with relative_rule "no_date_in_text". applies_to is "act" or a provision path.
provision: the section path from the section map, e.g. "1234.5/c/1". citation: the official citation style,
e.g. "Cal. Health & Safety Code § 17920.3", "Phila. Code § 9-804", "N.Y. Real Prop. Law § 235-b"."""


def hints(entry, text, labels):
    lines = []
    for i, path, body in jev_pass.section_targets(entry, text):
        t, c = labels.get(f"s{i}_type"), labels.get(f"s{i}_cat")
        if t:
            lines.append(f"{path} | {t['choice']} | {c['choice']} | {' '.join(body.split())[:90]}")
    return "\n".join(lines)


# ---------- quote location ----------
TRANS = str.maketrans({" ": " ", "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-"})


def _normalise(s):
    out, idx, prev_space = [], [], False
    for i, ch in enumerate(s):
        ch = ch.translate(TRANS)
        if ch.isspace():
            if prev_space:
                continue
            ch, prev_space = " ", True
        else:
            prev_space = False
        out.append(ch)
        idx.append(i)
    return "".join(out), idx


def locate(text, quote):
    """(start, end, method) of quote in text, or None. Exact first, then normalised."""
    if not quote:
        return None
    i = text.find(quote)
    if i >= 0:
        return i, i + len(quote), "exact"
    nt, idx = _normalise(text)
    nq, _ = _normalise(quote.strip())
    j = nt.find(nq) if nq else -1
    if j >= 0:
        return idx[j], idx[j + len(nq) - 1] + 1, "normalised"
    # PDF text often splits words ("t hose", "th e"): compare with all whitespace removed, map back to the source
    st = [(i, ch) for i, ch in enumerate(nt) if not ch.isspace()]
    sq = "".join(ch for ch in nq if not ch.isspace())
    joined = "".join(ch for _, ch in st)
    j = joined.find(sq) if len(sq) >= 20 else -1
    if j >= 0:
        return idx[st[j][0]], idx[st[j + len(sq) - 1][0]] + 1, "whitespace_insensitive"
    return None


def walk_quotes(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if (k == "quote" or k.endswith("_quote")) and isinstance(v, str):
                yield f"{path}.{k}", v
            else:
                yield from walk_quotes(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for n, v in enumerate(obj):
            yield from walk_quotes(v, f"{path}[{n}]")


# ---------- checks ----------
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
PHRASE_OPS = [("on or before", "le"), ("on or after", "ge"), ("no more than", "le"), ("not more than", "le"),
              ("not exceed", "le"), ("in excess of", "gt"), ("more than", "gt"), ("less than", "lt"),
              ("at least", "ge"), ("prior to", "lt"), ("before", "lt"), ("after", "gt")]
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
                "nine": 9, "ten": 10, "twelve": 12, "fifteen": 15, "twenty": 20}


def _value_forms(v):
    if isinstance(v, bool):
        return []
    if isinstance(v, (int, float)):
        n = int(v) if float(v).is_integer() else v
        return [str(n)] + [w for w, k in NUMBER_WORDS.items() if k == n]
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(v))
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return [f"{MONTHS[mo - 1]} {d}, {y}", f"{mo}/{d}/{y}", f"{mo:02d}/{d:02d}/{y}", str(v)]
    return []


def node_problems(n, where):
    k, ch = n["kind"], n.get("children") or []
    out = []
    if k in ("all", "any", "not") and not ch:
        out.append(f"{where}: '{k}' has no children")
    if k == "fact" and (not n.get("fact") or not n.get("op") or (n.get("value") is None and not n.get("values"))):
        out.append(f"{where}: fact node needs fact, op and value")
    if k == "age_years" and (not n.get("op") or n.get("years") is None):
        out.append(f"{where}: age_years needs op and years")
    if k == "ref" and not n.get("ref"):
        out.append(f"{where}: ref node needs ref")
    if k == "unparsed" and not n.get("triaged"):
        out.append(f"{where}: unparsed condition '{(n.get('quote') or '')[:80]}'")
    if k == "fact" and n.get("quote") and n.get("value") is not None:
        forms = _value_forms(n["value"])
        if forms and not any(f.lower() in n["quote"].lower() for f in forms):
            out.append(f"{where}: value {n['value']!r} not found in its quote")
    if k in ("fact", "age_years") and n.get("quote") and n.get("op"):
        q = n["quote"].lower()
        for phrase, op in PHRASE_OPS:
            if phrase in q:
                flipped = {"le": "ge", "lt": "gt", "ge": "le", "gt": "lt"}
                if n["op"] != op and not (k == "age_years" or n["op"] == flipped.get(op)):
                    out.append(f"{where}: op {n['op']} contradicts '{phrase}' in its quote")
                break
    for i, c in enumerate(ch):
        out += node_problems(c, f"{where}.{i}")
    return out


def _has_ref(n):
    return n["kind"] == "ref" or any(_has_ref(c) for c in n.get("children") or [])


def check(doc_out, level="state", labels=None, min_conf=0.8):
    """Problems per obligation index, plus document-level problems."""
    per, doc = {}, []
    obs = doc_out["obligations"]
    if labels:   # completeness: a category Jev sees in rule sections must have an obligation
        seen = {o["category"] for o in obs}
        wanted = {}
        for k, v in labels.items():
            if k.endswith("_cat") and k.split(":")[-1].startswith("s") and v["choice"] != "none" \
                    and v["confidence"] >= min_conf:
                t = labels.get(k[:-4] + "_type")
                if t and t["choice"] in ("rule", "exception_or_scope") and t["confidence"] >= min_conf:
                    wanted.setdefault(v["choice"], 0)
                    wanted[v["choice"]] += 1
        for cat, n in wanted.items():
            if cat not in seen:
                doc.append(f"{n} section(s) state {cat.replace('_', ' ')} rules, but no obligation in that "
                           f"category was extracted")
    if doc_out["document_status"] in ("pending", "enacted") and not obs:
        doc.append(f"document_status is {doc_out['document_status']} but no obligations were extracted")
    for i, o in enumerate(obs):
        p = []
        if o["effect"] == "protection_or_duty":
            if o["exempt_if"]["kind"] == "always":
                p.append("exempt_if is 'always', so the obligation would never apply")
            if o["applies_if"]["kind"] == "never":
                p.append("applies_if is 'never', so the obligation would never apply")
            p += node_problems(o["applies_if"], "applies_if") + node_problems(o["exempt_if"], "exempt_if")
            if level == "city" and (_has_ref(o["applies_if"]) or _has_ref(o["exempt_if"])):
                p.append("a city ordinance's coverage uses ref (circular): write which buildings it covers")
            for j, b in enumerate(o["key_value_conditions"]):
                p += node_problems(b["when"], f"key_value_conditions[{j}].when")
            if o["is_headline"] and o["category"] in ("rent_increase_limits", "security_deposits",
                                                      "application_screening_fees") and not o["key_value"]:
                p.append("headline cap or limit without key_value")
        if p:
            per[i] = p
    return per, doc


REPAIR = """Some obligations you extracted from these documents fail automatic checks. For each obligation below,
re-read the documents and return a corrected version of it (same rules as before; same provision and slug).
- An unparsed coverage condition: find the sentence that says which buildings are covered (possibly elsewhere
  in the documents) and express it with the facts. Keep it unparsed only if the documents truly don't say.
- exempt_if 'always' or applies_if 'never': write the real exemptions, or never/always if there are none.
- A value not found in its quote, or an operator that contradicts the quote: fix the value, operator or quote.
If no obligations were extracted from a bill or law, return the obligations it creates or would create.
Return only the corrected obligations, plus any newly found ones."""


def repair(user, out, per, doc_problems, ref):
    items = [{"index": i, "problems": p, "obligation": out["obligations"][i]} for i, p in per.items()]
    msg = f"{REPAIR}\n\nProblems:\n{json.dumps({'document': doc_problems, 'obligations': items}, indent=1)}"
    fixed, usage = llm.luna([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user},
                             {"role": "assistant", "content": json.dumps(out)}, {"role": "user", "content": msg}],
                            REPAIR_SCHEMA, "repair", stage="luna_repair", ref=ref)
    by_key = {(o["provision"], o["slug"]): o for o in fixed["obligations"]}
    for i in per:
        o = out["obligations"][i]
        if (o["provision"], o["slug"]) in by_key:
            out["obligations"][i] = by_key.pop((o["provision"], o["slug"]))
    out["obligations"] += list(by_key.values())
    return usage


TRIAGE = {
    "no": "This condition cannot be true for an ordinary multifamily apartment building of five or more units that "
          "is not subsidised or affordable housing.",
    "yes": "This condition is always true for such a building.",
    "depends": "It may or may not be true for such a building; it depends on facts about the specific building, "
                "owner or tenancy.",
}
APT5 = {"kind": "all", "children": [
    {"kind": "fact", "children": [], "fact": "use_class", "op": "in", "value": None, "values": ["apartment", "mixed_use"],
     "years": None, "ref": None, "quote": None},
    {"kind": "fact", "children": [], "fact": "units", "op": "ge", "value": 5, "values": None, "years": None,
     "ref": None, "quote": None},
    {"kind": "fact", "children": [], "fact": "subsidised", "op": "eq", "value": False, "values": None, "years": None,
     "ref": None, "quote": None}], "fact": None, "op": None, "value": None, "values": None, "years": None,
    "ref": None, "quote": None}


def _wrap(node, answer, conf):
    """Guard an unparsed node with Jev's judgement: decided for 5+ unit non-subsidised apartments, unknown otherwise."""
    node["triaged"] = {"jev": answer, "confidence": conf}
    base = {k: None for k in ("fact", "op", "value", "values", "years", "ref", "quote")}
    if answer == "no":    # false for APT5: all(not APT5, node)
        return {**base, "kind": "all", "children": [{**base, "kind": "not", "children": [APT5]}, node],
                "triaged_guard": "false for 5+ unit apartments (Jev)"}
    return {**base, "kind": "any", "children": [APT5, node], "triaged_guard": "true for 5+ unit apartments (Jev)"}


TRIAGE_ROLE = {"applies_if": "It is part of the law's coverage: the law covers a building or tenancy when this is true.",
               "exempt_if": "It is part of an exemption: the law does not apply when this is true.",
               "when": "It selects which amount applies."}


def triage_unparsed(state_text, out, ref, min_conf=0.8, veto=0.5):
    """One Jev call per unit for conditions still unparsed after repair. Each condition is asked in two wordings
    (plain, and with its role in the rule); a guard is added only when one answer is confident and the other
    does not confidently disagree."""
    targets = []

    def walk(n, setter, role):
        if n["kind"] == "unparsed" and not n.get("triaged"):
            targets.append((n, setter, role))
        for i, c in enumerate(n.get("children") or []):
            walk(c, lambda new, n=n, i=i: n["children"].__setitem__(i, new), role)

    for o in out["obligations"]:
        if o["effect"] != "protection_or_duty":
            continue
        for key in ("applies_if", "exempt_if"):
            walk(o[key], lambda new, o=o, key=key: o.__setitem__(key, new), key)
        for b in o["key_value_conditions"]:
            walk(b["when"], lambda new, b=b: b.__setitem__("when", new), "when")
    if not targets:
        return None
    questions = {}
    for i, (n, _, role) in enumerate(targets):
        quote = (n.get("quote") or "")[:300]
        questions[f"u{i}"] = {"type": "choice", "criteria": TRIAGE,
                              "instructions": f'Consider this condition from the law: "{quote}". '
                                              "Could it be true for an ordinary multifamily apartment building of five or "
                                              "more units that is not subsidised or affordable housing?"}
        questions[f"v{i}"] = {"type": "choice", "criteria": TRIAGE,
                              "instructions": f'Consider this condition from the law: "{quote}". {TRIAGE_ROLE[role]} '
                                              "Could the condition itself be true for an ordinary multifamily apartment "
                                              "building of five or more residential units rented to tenants, that is not "
                                              "subsidised or affordable housing? Judge the condition as written, not the "
                                              "law as a whole."}
    answers, usage = llm.jev(state_text[:60000], questions, stage="jev_triage", ref=ref)
    for i, (n, setter, _) in enumerate(targets):
        a, b = answers[f"u{i}"], answers[f"v{i}"]
        best, other = (a, b) if a["confidence"] >= b["confidence"] else (b, a)
        vetoed = other["choice"] != best["choice"] and other["confidence"] >= veto
        if best["choice"] in ("no", "yes") and best["confidence"] >= min_conf and not vetoed:
            setter(_wrap(n, best["choice"], best["confidence"]))
        else:
            n["triaged"] = {"jev": [a["choice"], b["choice"]], "confidence": [a["confidence"], b["confidence"]],
                            "kept_unparsed": True}
    return usage


def pending_stub(out, entries, texts, labels):
    """A pending bill with nothing extractable still gets one bill-level record, so it can be listed as pending."""
    if out["obligations"]:
        return None
    d = entries[0]["doc_id"]
    jev_status = labels[d]["doc_status"]["choice"]
    if out["document_status"] != "pending" and jev_status != "pending":
        return None
    text = texts[0]
    m = re.search(r"An Act [^\n]{10,200}", text)
    quote = m.group(0).strip() if m else (out.get("status_quote") or "")
    bill = re.search(r"/Bills/\d+/([HS])(\d+)", entries[0]["url"])
    citation = f"Mass. {bill.group(1)}.{bill.group(2)}" if bill else entries[0]["url"]
    node = {"kind": "always", "children": [], "fact": None, "op": None, "value": None, "values": None,
            "years": None, "ref": None, "quote": None}
    out["document_status"] = "pending"
    out["obligations"].append({
        "provision": "bill", "slug": "pending-bill", "title": quote[:120] or citation,
        "category": labels[d]["doc_category"]["choice"] if labels[d].get("doc_category") else "none",
        "effect": "protection_or_duty", "is_headline": True, "citation": citation,
        "requirement": f"Pending bill: {quote}" if quote else "Pending bill (no provisions in the supplied text)",
        "requirement_quote": quote, "key_value": None, "key_value_quote": None, "cap_pct_low": None,
        "cap_pct_high": None, "coverage_conditions": None, "exemptions": None, "applies_if": node,
        "exempt_if": {**node, "kind": "never"}, "key_value_conditions": [], "tenant_conditions": [],
        "interactions": [], "penalty": None, "stub": True})
    return citation


def _pipeline(user, state, level, ref, repair_on, labels=None):
    """L1 extraction, code checks, J5-J8 cross-checks, L2 repair, overrides, J9 triage for one prompt."""
    out, usage = llm.luna([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                          SCHEMA, "obligations", stage="luna_extract", ref=ref)
    per, doc_problems = check(out, level, labels)
    jev_answers, jev_usage = jev_check.run(state, out, level, ref)          # J5-J8 in parallel
    for i, p in jev_check.disagreements(out, jev_answers).items():
        per.setdefault(i, []).extend(p)
    first = {"obligations": {str(k): v for k, v in per.items()}, "document": doc_problems}
    repair_usage = repair(user, out, per, doc_problems, ref) if repair_on and (per or doc_problems) else None
    overrides = jev_check.apply_overrides(out, jev_answers)
    triage_usage = triage_unparsed(state, out, ref)
    return out, {"first": first, "overrides": overrides,
                 "usage": {"luna": usage, "jev_check": jev_usage, "repair": repair_usage, "triage": triage_usage}}


HEAD = {"type": "choice", "instructions": ""}


def merge_parts(outs, outline_text, ref):
    """Union of part outputs; one headline per category chosen by Jev over the outline when parts disagree."""
    out = {"document_status": outs[0]["document_status"], "status_quote": outs[0]["status_quote"],
           "events": [], "obligations": []}
    seen_events = set()
    for o in outs:
        for e in o["events"]:
            key = (e["kind"], e["date"], e["relative_rule"])
            if key not in seen_events:
                seen_events.add(key)
                out["events"].append(e)
        out["obligations"] += o["obligations"]
        if o["document_status"] in ("pending", "failed", "struck") and out["document_status"] in ("enacted", "unclear"):
            out["document_status"] = o["document_status"]
    by_cat = {}
    for i, o in enumerate(out["obligations"]):
        if o["effect"] == "protection_or_duty" and (o["is_headline"] or o.get("key_value")):
            by_cat.setdefault(o["category"], []).append(i)
    qs = {f"head_{c}": jev_check.head_question(c, out["obligations"], idx) for c, idx in by_cat.items() if len(idx) > 1}
    if qs:
        state = outline_text + "\n\n" + "\n".join(f"- {jev_check._quote(out['obligations'][i], 300)}"
                                                    for idx in by_cat.values() for i in idx)
        answers, _ = llm.jev(state, qs, stage="jev_merge_headline", ref=ref)
        for k, a in answers.items():
            chosen = int(a["choice"][1:])
            for i in by_cat[k[5:]]:
                out["obligations"][i]["is_headline"] = i == chosen
    return out


def extract(doc_id, bundle=None, repair_on=True):
    """Extract one document (split into parts if large), or a bundle of same-city summary documents."""
    ids = bundle or [doc_id]
    entries = [json.load(open(config.INDEX / f"{d}.json")) for d in ids]
    texts = [load_text(e) for e in entries]
    level = "city" if "," in entries[0]["jurisdiction"] else "state"
    ref = "+".join(ids)
    labels = {}
    spans_parts = None
    if not bundle and len(texts[0]) - entries[0]["body_start"] > P.BUDGET:
        e, t = entries[0], texts[0]
        spans_parts = P.split(e, t)
        _, lab, _ = jev_pass.run_focused_parts(doc_id, spans_parts)
        labels[doc_id] = lab

        def one(k_span):
            k, (a, b) = k_span
            part_hints = "\n".join(line for line in hints(e, t, lab).splitlines())
            user = (f"=== DOCUMENT {doc_id} ({e['jurisdiction']}, {e['evidence_tier']}), PART {k + 1} of "
                    f"{len(spans_parts)} ===\nContext from the rest of the document (do not extract obligations "
                    f"from it):\n{P.context_for(e, t, (a, b), lab)}\n\nSection map (path | content type | topic | "
                    f"start), labels from a classifier, may be wrong:\n{part_hints}\n\n=== PART TEXT ===\n{t[a:b]}")
            part_labels = {k2: v for k2, v in lab.items() if k2.startswith("s")
                           and a <= e["sections"][int(k2[1:].split("_")[0])]["start"] < b}
            return _pipeline(user, t[a:b], level, f"{ref}#part{k + 1}", repair_on, part_labels)

        with ThreadPoolExecutor(min(6, len(spans_parts))) as ex:
            results = list(ex.map(one, enumerate(spans_parts)))
        out = merge_parts([r[0] for r in results], P.outline(e), ref)
        meta = {"first": [r[1]["first"] for r in results], "overrides": sum((r[1]["overrides"] for r in results), []),
                "usage": [r[1]["usage"] for r in results]}
    else:
        parts = []
        for d, e, t in zip(ids, entries, texts):
            _, lab, _ = jev_pass.run_focused(d)
            labels[d] = lab
            parts.append(f"=== DOCUMENT {d} ({e['jurisdiction']}, {e['evidence_tier']}) ===\n"
                         f"Section map (path | content type | topic | start), labels from a classifier, may be wrong:\n"
                         f"{hints(e, t, lab)}\n\n{t}")
        merged_labels = {f"{d}:{k}": v for d in ids for k, v in labels[d].items()}
        out, meta = _pipeline("\n\n".join(parts), "\n\n".join(texts), level, ref, repair_on,
                              {k.split(":", 1)[1] if len(ids) == 1 else k: v for k, v in merged_labels.items()})
    usage = meta["usage"]
    first_problems, overrides = meta["first"], meta["overrides"]
    stub = pending_stub(out, entries, texts, labels)
    per, doc_problems = check(out, level)
    text = "\n\n".join(texts)
    spans, failed = {}, []
    for path, q in walk_quotes(out):
        hit = locate(text, q)
        if not hit:
            failed.append({"path": path, "quote": q[:200]})
            continue
        offset = 0
        for d, e, t in zip(ids, entries, texts):
            if offset <= hit[0] < offset + len(t):
                spans[path] = {"doc_id": d, "version_id": e["version_id"], "start": hit[0] - offset,
                               "end": hit[1] - offset, "method": hit[2]}
                break
            offset += len(t) + 2
    for i, o in enumerate(out["obligations"]):
        quote_ok = f".obligations[{i}].requirement_quote" in spans
        problems = per.get(i, []) + ([] if quote_ok else ["requirement_quote not found in the source"])
        o["checks"] = problems
        o["parse_status"] = ("ok" if not problems else
                             "failed" if o["is_headline"] and o["effect"] == "protection_or_duty" else "partial")
    record = {"doc_id": ref, "doc_ids": ids, "version_ids": [e["version_id"] for e in entries],
              "jurisdiction": entries[0]["jurisdiction"], "evidence_tiers": [e["evidence_tier"] for e in entries],
              "source_urls": [e["url"] for e in entries], "retrieved": [e["retrieved"] for e in entries],
              "jev": {d: {"doc_type": labels[d]["doc_type"], "doc_status": labels[d]["doc_status"],
                          "dates": {k: v for k, v in labels[d].items() if k.startswith("d")}} for d in ids},
              "luna": out, "checks_before_repair": first_problems, "jev_overrides": overrides, "pending_stub": stub,
              "parts": spans_parts, "document_problems": doc_problems,
              "spans": spans, "quote_failures": failed, "usage": usage}
    (config.OUT / "extracted").mkdir(parents=True, exist_ok=True)
    (config.OUT / "extracted" / f"{ref}.json").write_text(json.dumps(record, indent=1, ensure_ascii=False))
    return record


def units_for(doc_ids):
    """Primary texts alone; official summaries of the same city together in one bundle."""
    rows = [json.load(open(config.INDEX / f"{d}.json")) for d in doc_ids]
    bundles, singles = {}, []
    for e in rows:
        if e["evidence_tier"] == "official_summary" and "," in e["jurisdiction"]:
            bundles.setdefault(e["jurisdiction"], []).append(e["doc_id"])
        else:
            singles.append([e["doc_id"]])
    return singles + list(bundles.values())


def extract_many(doc_ids, workers=6, repair_on=True):
    """All units; a unit that fails is logged to out/extracted_failures.json and skipped, never aborts the run."""
    units = units_for(doc_ids)
    failures = []

    def one(u):
        try:
            return extract(u[0], u if len(u) > 1 else None, repair_on)
        except Exception as e:                       # noqa: BLE001 - one unit must not stop the corpus
            failures.append({"unit": "+".join(u), "error": str(e)[:500]})
            return None

    with ThreadPoolExecutor(workers) as ex:
        results = [r for r in ex.map(one, units) if r]
    (config.OUT / "extracted_failures.json").write_text(json.dumps(failures, indent=1))
    return results


if __name__ == "__main__":
    import sys
    for r in extract_many(sys.argv[1:]):
        obs = r["luna"]["obligations"]
        first = r["checks_before_repair"]
        flagged = sum(len(f["obligations"]) for f in first) if isinstance(first, list) else len(first["obligations"])
        print(r["doc_id"], f"parts={len(r['parts']) if r['parts'] else 1}", len(obs), "obligations;", "before repair:",
              flagged, "flagged; after:",
              sum(o["parse_status"] == "failed" for o in obs), "failed,",
              sum(o["parse_status"] == "partial" for o in obs), "partial; quote failures", len(r["quote_failures"]))
