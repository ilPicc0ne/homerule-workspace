"""Text-only exemptions that stand alone at the top of a rule's exempt_if, after extraction and the vote.

A text-only (unparsed) exemption can't be checked against building data, so a rule with one is unknown at every
address. Two cases leave a rule unknown when it need not be:
- one exemption split into parts: the law requires several things together ("..., provided that both of the
  following apply: (A) ... (B) ..."), but the parts were written as separate exemptions. Code joins them from the
  document's structure: parts whose numbered list item requires its sub-items together become one all node.
- an exemption that holds only when the owner lives in the building (e.g. a tenant sharing the owner's kitchen):
  Jev answers whether it does; code adds owner_occupied = true.
Then Jev's triage (as in extraction: could the condition be true for a 5+ unit non-subsidised apartment building?)
guards each joined or stand-alone exemption. One batched Jev call per source document, only for these nodes, so
every other cached extraction result stays as it was.
"""
import json
import re

from . import config, corpus, llm
from .luna_pass import TRIAGE, _wrap, locate

COMPOUND = re.compile(r"provided that|(?:both|all|each) of the following", re.I)
ITEM = re.compile(r"^\s*\(\d+\)")                  # a numbered list item, e.g. "(8)"; sub-items are "(A)", "(i)"
OWNER = {"yes": "Yes: the exemption applies only when the owner lives in the building or on the property.",
         "no": "No: it can apply whether or not the owner lives there."}
SCOPE = {"le2": "Only a single-family home or a building of two units in which the owner lives.",
         "le4": "Only a building of up to four units in which the owner lives.",
         "shared": "Only a unit where the tenant shares a kitchen or bathroom with the owner.",
         "any": "Any building in which the owner lives, whatever its size."}
SCOPE_UNITS = {"le2": 2, "le4": 4}
MIN_CONF, VETO, OWNER_CONF = 0.8, 0.5, 0.9
BASE = {k: None for k in ("fact", "op", "value", "values", "years", "ref", "quote")}


def item(text, span):
    """(start of the numbered item the quote belongs to, its text through the quote's line), or None."""
    a, b = span
    start = text.rfind("\n", 0, a) + 1
    end = text.find("\n", b)
    end = len(text) if end < 0 else end
    for _ in range(12):
        if ITEM.match(text[start:end]):
            return start, text[start:end]
        if start == 0:
            return None
        start = text.rfind("\n", 0, start - 1) + 1
    return None


def _text(doc_id, cache={}):
    if doc_id not in cache:
        p = config.OUT / "index" / f"{doc_id}.json"
        cache[doc_id] = corpus.load_text(json.loads(p.read_text())) if p.exists() else ""
    return cache[doc_id]


def _bare(rule):
    ex = rule["exempt_if"]
    kids = ex["children"] if ex["kind"] == "any" else [ex]
    return [n for n in kids if n["kind"] == "unparsed" and n.get("quote")]


def join(rule, text):
    """Bare text exemptions under one numbered item that requires its parts together -> one all node."""
    groups = {}
    for n in _bare(rule):
        span = locate(text, n["quote"])
        it = item(text, span[:2]) if span else None
        if it and COMPOUND.search(it[1]):
            groups.setdefault(it[0], []).append(n)
    ex = rule["exempt_if"]
    joined = []
    for parts in groups.values():
        if len(parts) < 2 or ex["kind"] != "any":
            continue
        node = {**BASE, "kind": "all", "children": parts, "joined": "parts of one exemption (document structure)"}
        ex["children"] = [c for c in ex["children"] if all(c is not p for p in parts)] + [node]
        joined.append(node)
    return joined


def _quote(n):
    return " ... ".join(c.get("quote") or "" for c in n["children"]) if n["kind"] == "all" else n.get("quote") or ""


def _is_bare_owner(n):
    return n["kind"] == "fact" and n.get("fact") == "owner_occupied" and n.get("op") == "eq" and n.get("value") is True


def scope_owner(rules):
    """An exemption that is only "the owner lives there" (no building type or size) is broader than such
    exemptions are written: they cover an owner-occupied house or small building, or a unit sharing the owner's
    kitchen. Jev answers which buildings it covers, with the whole document as context; code adds the unit
    limit (or the shared-facility condition). Unsure (p < MIN_CONF) or "any": left as extracted."""
    changes = []
    for r in rules:
        ex = r["exempt_if"]
        if r["effect"] != "protection_or_duty" or ex["kind"] != "any":
            continue
        bare = [n for n in ex["children"] if _is_bare_owner(n)]
        if not bare:
            continue
        text = _text(r["source_doc_id"])
        span = locate(text, r.get("requirement_quote") or "")
        q = {"scope": {"type": "choice", "criteria": SCOPE,
                       "instructions": f"This law ({r['citation']}) exempts some owner-occupied housing. Which "
                                       "housing does its owner-occupancy exemption cover?"}}
        a = llm.jev(llm.fit(text, span[0] if span else None), q, stage="jev_owner_scope", ref=r["source_doc_id"])[0]["scope"]
        p = a["probabilities"].get(a["choice"], a["confidence"])
        if a["choice"] == "any" or p < MIN_CONF:
            continue
        if a["choice"] in SCOPE_UNITS:
            extra = {**BASE, "kind": "fact", "children": [], "fact": "units", "op": "le", "value": SCOPE_UNITS[a["choice"]]}
        else:
            extra = {**BASE, "kind": "unparsed", "children": [], "quote": "the tenant shares a kitchen or bathroom with the owner"}
        r["exempt_if"] = ex = json.loads(json.dumps(ex))
        ex["children"] = [{**BASE, "kind": "all", "children": [c, extra]} if _is_bare_owner(c) else c
                          for c in ex["children"]]
        how = f"owner-occupancy exemption scoped: {a['choice']} (jev p={p:.2f})"
        r["checks"] = r["checks"] + [f"exempt_if: 'owner_occupied': {how}"]
        changes.append((r["citation"], "owner_occupied", [how]))
    return changes


def normalize(rules):
    """In place on internal rules (protections only). Returns what changed, for the audit and the log."""
    targets = {}
    for r in rules:
        if r["effect"] != "protection_or_duty" or r["exempt_if"]["kind"] not in ("any", "unparsed"):
            continue
        r["exempt_if"] = json.loads(json.dumps(r["exempt_if"]))       # the extracted records are shared: copy
        text = _text(r["source_doc_id"])
        nodes = join(r, text) + _bare(r)     # joined parts: triage + owner; a single exemption: owner only (it was
                                             # triaged in extraction already)
        for n in nodes:
            targets.setdefault(r["source_doc_id"], []).append((r, n))
    changes = scope_owner(rules)
    for doc_id, items in targets.items():
        qs = {}
        for i, (r, n) in enumerate(items):
            q = _quote(n)
            qs[f"o{i}"] = {"type": "choice", "criteria": OWNER,
                           "instructions": f'Consider this exemption from the law: "{q}". Does it apply only when the '
                                           "owner lives in the building or on the property?"}
            if not n.get("joined"):
                continue
            qs[f"u{i}"] = {"type": "choice", "criteria": TRIAGE,
                           "instructions": f'Consider this exemption from the law: "{q}". Could it be true for an '
                                           "ordinary multifamily apartment building of five or more units that is not "
                                           "subsidised or affordable housing?"}
            qs[f"v{i}"] = {"type": "choice", "criteria": TRIAGE,
                           "instructions": f'Consider this exemption from the law: "{q}". The law does not apply when it '
                                           "is true. Could the exemption itself be true for an ordinary multifamily "
                                           "apartment building of five or more residential units rented to tenants, "
                                           "that is not subsidised or affordable housing? Judge it as written."}
        text = _text(doc_id)
        at = next((s[0] for _, n in items for s in [locate(text, _quote(n))] if s), None)
        answers, _ = llm.jev(llm.fit(text, at), qs, stage="jev_exemptions", ref=doc_id)
        for i, (r, n) in enumerate(items):
            ex = r["exempt_if"]
            kids = ex["children"] if ex["kind"] == "any" else None
            new, how = n, []
            o = answers[f"o{i}"]
            if o["choice"] == "yes" and o["probabilities"].get("yes", 0) >= OWNER_CONF:
                new = {**BASE, "kind": "all", "children": [
                    {**BASE, "kind": "fact", "children": [], "fact": "owner_occupied", "op": "eq", "value": True}, new]}
                how.append(f"owner lives there (jev p={o['probabilities']['yes']:.2f})")
            a, b = answers.get(f"u{i}"), answers.get(f"v{i}")
            best, other = (None, None) if a is None else (a, b) if a["confidence"] >= b["confidence"] else (b, a)
            vetoed = best and other["choice"] != best["choice"] and other["confidence"] >= VETO
            if best and best["choice"] in ("no", "yes") and best["confidence"] >= MIN_CONF and not vetoed:
                new = _wrap(new, best["choice"], best["confidence"])
                how.append(f"{'false' if best['choice'] == 'no' else 'true'} for 5+ unit apartments "
                           f"(jev p={best['confidence']:.2f})")
            if n.get("joined"):
                how.insert(0, n["joined"])
            if new is n and not n.get("joined"):
                continue
            if kids is not None:
                ex["children"] = [new if c is n else c for c in kids]
            else:
                r["exempt_if"] = new
            r["checks"] = r["checks"] + [f"exempt_if: '{_quote(n)[:60]}': " + "; ".join(how)]
            changes.append((r["citation"], _quote(n)[:60], how))
    return changes
