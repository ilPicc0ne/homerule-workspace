"""Hour 16 asked as a question: "what changes for this address with the new ordinance?", answered the way the demo
answers it - from the engine (the address page and changes.json) - and, second, by the HomeRule chatbot on the same
records.

After `make ingest` (or inside `make rehearse`):
  python3 -m tests.hour16_question X001 [A0123]
Compares every sample address without vs with the document's rules the day after it takes effect (as T6 does),
prints the affected count, then one address (the given one, else the first affected): each change with its result
before -> after, the engine's explanation and the renter verdict with its why; then the chatbot's answer for that
city, topic and date with its status lines.
"""
import datetime as dt
import json
import sys

from engine import build as B, diff as D, facts as F, rules as R
from scoreboard import chat

CARD = {v: k for k, v in chat.CARD_CATEGORY.items()}


def main(doc_id, address_id=None):
    rules = R.load()
    new = [r for r in rules if r.get("source_doc_id") == doc_id]
    if not new:
        sys.exit(f"no compiled rule from {doc_id}: run make ingest first")
    starts = sorted({r["eff"]["from"] for r in new if r["eff"].get("from")})
    if not starts:
        sys.exit(f"{doc_id}: no effective date in its rules")
    day = (dt.date.fromisoformat(starts[0]) + dt.timedelta(days=1)).isoformat()
    before = [r for r in rules if r.get("source_doc_id") != doc_id]
    by_id = {r["id"]: r for r in rules}
    addresses = F.load()
    changes = D.diff_lookups(B.build_lookups(before, addresses, day), B.build_lookups(rules, addresses, day), by_id)
    print(f"{doc_id}: {len(new)} rule(s), effective {starts[0]}; compared on {day}: {len(changes)} address(es) affected")
    aid = address_id or next(iter(sorted(changes)), None)
    if not aid:
        return
    rec = addresses[aid]
    street = rec["input"]["street_address"]
    print(f"\nQ: What changes for {street}, {rec['legal_city']} ({aid}) on {day}?")
    print("A (engine, as on the address page):")
    for c in changes.get(aid, []):
        b, a, ri = c["before"] or {}, c["after"] or {}, c["renter_impact"]
        print(f"- {c['citation']}: {b.get('result', 'not listed')} -> {a.get('result', 'not listed')}. "
              f"{a.get('explanation') or b.get('explanation') or ''}")
        print(f"  For the renter: {ri['verdict']}. {ri['why']}")
    if aid not in changes:
        print("- No change at this address.")
    city = R.JUR.get(rec["jurisdictions"]["city"], {}).get("schema_name")
    topics = sorted({by_id[c["team_rule_id"]]["category"] for c in changes.get(aid, [])}) or [new[0]["category"]]
    for t in topics:
        ans, _, _ = chat.ask_homerule(city, day, CARD[t], ref=f"hour16:{doc_id}:{aid}")
        print(f"\nA (chatbot, {city}, {t}):\n{ans}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
