"""Per document: one Jev call (bounded labels), then one Luna call (free extraction).

Luna returns obligations in the extended record: starter-schema fields plus checkable
conditions, value branches, tenancy conditions, interactions and dated events, each with
quotes. Code then locates every quote in the pinned document version.
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor

from . import config, llm, jev_pass
from .corpus import load_text

FACTS = {
    "building.year_built": "Year the building was built (integer).",
    "building.certificate_date": "Date the building's certificate of occupancy was issued (date). Use this when the text says certificate of occupancy.",
    "building.built_date": "Date the building was first built or completed (date). Use this when the text says built or constructed.",
    "building.units": "Number of dwelling units in the building (integer).",
    "building.use_class": "Kind of building: apartment, single_family, condo, tic, mixed_use, dormitory, mobilehome, elderly, other.",
    "building.affordable_restricted": "Unit is deed- or agreement-restricted affordable housing (boolean).",
    "building.separately_alienable": "Unit can be sold separately from the other units, like a single-family home or condo (boolean).",
    "building.government_regulated_rent": "Rent is regulated by another government agency (boolean).",
    "landlord.owner_type": "natural_person, llc_natural_persons, corporation, reit, llc_with_corporate_member, public_entity, other.",
    "landlord.portfolio_units": "Total dwelling units the landlord owns across properties (integer).",
    "landlord.portfolio_properties": "Number of residential rental properties the landlord owns (integer).",
    "landlord.owner_occupied": "The owner lives in the building (boolean).",
    "tenant.service_member": "The tenant or prospective tenant is a service member (boolean).",
    "tenancy.months": "How long the tenant has occupied the unit, in months (integer).",
    "tenancy.deposit_collected": "Date the security deposit was collected or demanded (date).",
    "tenancy.start": "Date the tenancy began (date).",
}
CATEGORIES = list(jev_pass.CATEGORIES)[:-1]
EVENT_KINDS = ["enacted", "effective", "operative", "repealed", "introduced", "failed", "struck"]
RELATIVE = ["none", "first_day_of_nth_month_after_enactment", "n_days_after_enactment", "no_date_in_text"]
INTERACTIONS = ["exempt_where_local_rule_stricter", "yields_to_local", "preempts_local",
                "possible_conflict_with_local", "coexists_with_local"]

NODE = {
    "type": "object", "additionalProperties": False,
    "required": ["kind", "children", "fact", "op", "value", "values", "date", "years", "quote"],
    "properties": {
        "kind": {"type": "string", "enum": ["all", "any", "not", "fact", "date_fact", "age_years", "always", "never", "unparsed"]},
        "children": {"type": "array", "items": {"$ref": "#/$defs/node"}},
        "fact": {"type": ["string", "null"], "enum": list(FACTS) + [None]},
        "op": {"type": ["string", "null"], "enum": ["eq", "ne", "lt", "le", "gt", "ge", "in", None]},
        "value": {"type": ["number", "boolean", "string", "null"]},
        "values": {"type": ["array", "null"], "items": {"type": "string"}},
        "date": {"type": ["string", "null"]},
        "years": {"type": ["number", "null"]},
        "quote": {"type": ["string", "null"]},
    },
}


def nullable(t):
    return {"type": [t, "null"]}


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
        "obligations": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["provision", "slug", "title", "category", "effect", "is_headline", "citation", "requirement", "requirement_quote",
                         "key_value", "key_value_quote", "cap_pct_low", "cap_pct_high", "coverage_conditions",
                         "exemptions", "applies_if", "exempt_if", "value_branches", "tenancy_conditions",
                         "interactions", "penalty"],
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
                "value_branches": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["value", "when", "quote"],
                    "properties": {"value": {"type": "string"}, "when": {"$ref": "#/$defs/node"}, "quote": {"type": "string"}}}},
                "tenancy_conditions": {"type": "array", "items": {"$ref": "#/$defs/node"}},
                "interactions": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["kind", "target_category", "quote"],
                    "properties": {"kind": {"type": "string", "enum": INTERACTIONS},
                                   "target_category": {"type": "string", "enum": CATEGORIES},
                                   "quote": {"type": "string"}}}},
                "penalty": nullable("string")}}},
    },
}

SYSTEM = f"""You turn housing-law documents into obligation records. Read the whole document.

Output one obligation per distinct duty, limit, prohibition or right that a landlord, tenant or other party has
(e.g. a deposit cap, a deduction rule and a return deadline in the same section are three obligations).
For a document that only announces or summarises a law, extract the obligations it states.

Quotes: every *_quote and every condition's "quote" must be copied character for character from the document,
one contiguous passage, at most 300 characters. Never paraphrase or join passages in a quote.

Conditions (applies_if, exempt_if, value_branches[].when, tenancy_conditions) use this language:
- all / any / not with at least one child; always / never for trivial conditions. Every fact, date_fact and
  age_years node needs fact and op (age_years also years).
- fact: compare a fact with op and value (number, boolean or enum string); op "in" uses values.
- date_fact: compare a date fact with date (YYYY-MM-DD). "on or before <date>" is op le, "after <date>" is gt.
- age_years: the fact's date is less/more than N years before the query date ("within the previous 15 years" = lt 15).
- unparsed: a condition the facts can't express; put its text in quote.
Every address we evaluate is a residential rental building, so never encode the law's general scope
("residential property", "a rental agreement", "a landlord") as a condition: use always.
applies_if/exempt_if may use only building.*, landlord.* facts (properties of the building and its owner).
Exceptions that depend on the lease, an agreement, the tenant or how the tenancy ends are not exemptions of the
building: put them in tenancy_conditions or value_branches. Use unparsed in applies_if/exempt_if only for a
building or landlord property the facts cannot express.
The coverage of a local ordinance (which buildings it covers, e.g. by construction or certificate date, unit
count or building type) goes into applies_if/exempt_if of every obligation that ordinance imposes, even when the
coverage is stated in another sentence or in another document of the same bundle.
Conditions about the tenant or the tenancy go into tenancy_conditions, or into value_branches when they change the
amount. value_branches give alternative values of key_value and when each applies: a provision that sets a
different amount "notwithstanding" the main one (e.g. a higher cap for small landlords) is a value branch of the
main obligation, not a separate obligation.
Facts: {json.dumps(FACTS, indent=0)}

interactions: relations between this obligation and local (city) rules in the same topic. If a provision exempts
housing covered by a stricter local rule (e.g. local rent control), do not put that in exempt_if: add an
interaction exempt_where_local_rule_stricter to the main obligation. If the act forbids or limits local
ordinances on its topic, add possible_conflict_with_local (or preempts_local if it expressly voids them) to the
act's main obligations. Use coexists_with_local only when the text says local rules continue to apply alongside.
effect: protection_or_duty for duties, limits and rights; bars_or_limits_local_rules for a provision that forbids
or restricts cities from adopting rules (it protects no tenant by itself); procedure_or_admin for reporting,
enforcement mechanics and administration.
is_headline: true for the main obligation of each law in each topic (the cap, the ban, the core duty), false for
the supporting provisions.
cap_pct_low / cap_pct_high: for rent-increase caps only, the lowest and highest annual increase in percent the
cap can allow (e.g. "3% plus CPI, max 8%" gives 3 and 8; "2.5%" gives 2.5 and 2.5). Otherwise null.

events: dates the law was enacted, takes effect, becomes operative, is repealed, introduced, failed or struck.
If the effective date is defined relative to enactment ("the first day of the twelfth month next following
enactment"), set relative_rule and n and leave date null. If the text gives no effective date, add an
"effective" event with relative_rule "no_date_in_text". applies_to is "act" or a provision path.
document_status: the legal status of the main law or measure in the document.
provision: the section path from the section map, e.g. "1234.5/c/1". citation: the official citation style,
e.g. "Cal. Health & Safety Code § 17920.3", "Phila. Code § 9-804", "N.Y. Real Prop. Law § 235-b", "Or. Rev. Stat. § 90.323"."""


def hints(entry, text, labels):
    lines = []
    for i, path, body in jev_pass.section_targets(entry, text):
        t, c = labels.get(f"s{i}_type"), labels.get(f"s{i}_cat")
        if not t:
            continue
        snippet = " ".join(body.split())[:90]
        lines.append(f"{path} | {t['choice']} | {c['choice']} | {snippet}")
    return "\n".join(lines)


# ---------- quote location ----------
TRANS = str.maketrans({" ": " ", "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-"})


def _normalise(s):
    out, idx = [], []
    prev_space = False
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
    """Return (start, end, method) of quote in text, or None. Exact first, then normalised."""
    if not quote:
        return None
    i = text.find(quote)
    if i >= 0:
        return i, i + len(quote), "exact"
    nt, idx = _normalise(text)
    nq, _ = _normalise(quote.strip())
    j = nt.find(nq)
    if j >= 0:
        return idx[j], idx[j + len(nq) - 1] + 1, "normalised"
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


TENANCY = ("tenant.", "tenancy.")


def _tenancy_only(n):
    if n["kind"] in ("all", "any", "not"):
        return bool(n["children"]) and all(_tenancy_only(c) for c in n["children"])
    return n["kind"] in ("fact", "date_fact", "age_years") and (n["fact"] or "").startswith(TENANCY)


def move_tenancy_conditions(ob):
    """Coverage decides the address result, so tenant/tenancy conditions move to tenancy_conditions."""
    moved = []
    ex = ob["exempt_if"]
    parts = ex["children"] if ex["kind"] == "any" else [ex]
    keep = [c for c in parts if not _tenancy_only(c)]
    for c in parts:
        if _tenancy_only(c):
            ob["tenancy_conditions"].append({**c, "kind": "not", "children": [c], "fact": None, "op": None,
                                             "value": None, "values": None, "date": None, "years": None,
                                             "quote": c.get("quote")})
            moved.append("exempt_if")
    if len(keep) != len(parts):
        ob["exempt_if"] = ({**ex, "children": keep} if ex["kind"] == "any" and len(keep) > 1 else
                           keep[0] if keep else {**ex, "kind": "never", "children": []})
    ap = ob["applies_if"]
    parts = ap["children"] if ap["kind"] == "all" else [ap]
    keep = [c for c in parts if not _tenancy_only(c)]
    for c in parts:
        if _tenancy_only(c):
            ob["tenancy_conditions"].append(c)
            moved.append("applies_if")
    if len(keep) != len(parts):
        ob["applies_if"] = ({**ap, "children": keep} if ap["kind"] == "all" and len(keep) > 1 else
                            keep[0] if keep else {**ap, "kind": "always", "children": []})
    return moved


def extract(doc_id, bundle=None):
    """Extract one document, or a bundle of same-city summary documents in one Luna call (one Jev call each)."""
    ids = bundle or [doc_id]
    entries = [json.load(open(config.INDEX / f"{d}.json")) for d in ids]
    texts = [load_text(e) for e in entries]
    parts, labels = [], {}
    for d, e, t in zip(ids, entries, texts):
        _, lab, _ = jev_pass.run_single(d)
        labels[d] = lab
        parts.append(f"=== DOCUMENT {d} ({e['jurisdiction']}, {e['evidence_tier']}) ===\n"
                     f"Section map (path | content type | topic | start), labels from a classifier, may be wrong:\n"
                     f"{hints(e, t, lab)}\n\n{t}")
    user = "\n\n".join(parts)
    out, usage = llm.luna([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                          SCHEMA, "obligations", stage="luna_extract", ref="+".join(ids))
    entry, text = entries[0], "\n\n".join(texts)
    for ob in out["obligations"]:
        ob["moved_tenancy_conditions"] = move_tenancy_conditions(ob)
    spans, failed = {}, []
    for path, q in walk_quotes(out):
        hit = locate(text, q)
        if hit:
            spans[path] = {"start": hit[0], "end": hit[1], "method": hit[2]}
        else:
            failed.append({"path": path, "quote": q[:200]})
    for path, sp in spans.items():   # attribute each located quote to its document in the bundle
        offset = 0
        for d, e, t in zip(ids, entries, texts):
            if offset <= sp["start"] < offset + len(t):
                sp.update(doc_id=d, version_id=e["version_id"], start=sp["start"] - offset, end=sp["end"] - offset)
                break
            offset += len(t) + 2
    record = {"doc_id": "+".join(ids), "doc_ids": ids, "version_ids": [e["version_id"] for e in entries],
              "jurisdiction": entry["jurisdiction"], "evidence_tiers": [e["evidence_tier"] for e in entries],
              "source_urls": [e["url"] for e in entries], "retrieved": [e["retrieved"] for e in entries],
              "jev": {d: {"doc_type": labels[d]["doc_type"], "doc_status": labels[d]["doc_status"],
                          "dates": {k: v for k, v in labels[d].items() if k.startswith("d")}} for d in ids},
              "luna": out, "spans": spans, "quote_failures": failed, "luna_usage": usage}
    (config.OUT / "extracted").mkdir(parents=True, exist_ok=True)
    (config.OUT / "extracted" / f"{record['doc_id']}.json").write_text(json.dumps(record, indent=1, ensure_ascii=False))
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


def extract_many(doc_ids, workers=6):
    units = units_for(doc_ids)
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(lambda u: extract(u[0], u if len(u) > 1 else None), units))
