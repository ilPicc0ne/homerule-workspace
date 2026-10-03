"""Status corroboration from the manifest, for local ordinances whose supplied text reads as a draft.

Some corpus texts are pre-adoption versions (blank adoption certificate, "passed to print"). Their
enactment is only visible in the manifest: a code-publisher link that contains the section number
(codified), or an agenda item URL for final passage. One Jev call per such document decides from that
evidence; the result is recorded as manifest evidence (no quote), never presented as text.
"""
import csv
import re

from . import config, llm

QUESTION = {
    "adopted": "The sources show the ordinance was finally adopted or codified (e.g. it appears in the published "
               "municipal code, a final-passage / second-reading agenda item, or other sources state the date it "
               "took effect).",
    "not_adopted": "The sources show it was rejected, withdrawn or never adopted.",
    "unclear": "The sources do not show whether it was adopted.",
}


def manifest_rows(jurisdiction):
    return [r for r in csv.DictReader(open(config.MANIFEST, encoding="utf-8")) if r["jurisdictions"] == jurisdiction]


def corroborate(doc_id, jurisdiction, citation, title, own_url, statements=()):
    """('adopted', evidence, adoption_date or None) | ('pending'|'unclear', evidence, None)."""
    rows = manifest_rows(jurisdiction)
    sec = re.search(r"\d+\.\d+(?:\.\d+)?", citation or "")
    codified = [r for r in rows if r["source_type"] == "code publisher" and sec and sec.group(0) in r["url"]]
    lines = [f"- [{r['doc_id']}] {r['source_type']}: {r['url']}" for r in rows]
    state = (f"Ordinance: {title} ({citation}). Its supplied text is document {doc_id}, from {own_url}.\n"
             f"Other sources listed for {jurisdiction}:\n" + "\n".join(lines))
    if statements:                                      # the guide's open questions about this law, if any
        state += "\nOther statements about this law:\n" + "\n".join(f"- {x}" for x in statements)
    a, _ = llm.jev(state, {"adopted": {"type": "choice", "criteria": QUESTION,
                                      "instructions": "Do these sources show that this ordinance was adopted?"}},
                   stage="jev_status_corroboration", ref=doc_id)
    choice, conf = a["adopted"]["choice"], a["adopted"]["confidence"]
    date = None
    m = re.search(r"(20\d\d)-(\d\d)-(\d\d)", own_url)
    if m:
        date = m.group(0)
    evidence = {"jev": choice, "confidence": conf, "codified_links": [r["url"] for r in codified],
                "adoption_date_from_url": date, "statements": list(statements)}
    if codified or (choice == "adopted" and conf >= 0.8):
        return "adopted", evidence, date
    return (choice if conf >= 0.8 else "unclear"), evidence, None
