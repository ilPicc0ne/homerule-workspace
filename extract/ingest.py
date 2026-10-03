"""Hour 16 / any new law: one command from a text file to rules, findings and the affected addresses.

python3 -m extract.ingest <path> --jurisdiction "Cambridge, MA" [--id X001]

Pins and indexes the document, runs the same extraction (Jev labels, Luna, checks, repair, gate) as the
corpus, compiles, and compares every sample address before vs after the document at its effective date.
No prompt or code change is needed for a new document.
"""
import argparse
import hashlib
import json
import time

from . import config, corpus, luna_pass, gate, compile as C


def index_file(path, doc_id, jurisdiction):
    raw = open(path, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    (config.VERSIONS / f"{sha}.txt").write_bytes(raw)
    text = raw.decode("utf-8")
    head, body = corpus.parse_header(text)
    entry = {"doc_id": doc_id, "version_id": f"sha256:{sha}", "manifest_sha256_matches": None,
             "jurisdiction": jurisdiction, "url": head.get("source", f"local:{path}"), "source_type": "official",
             "evidence_tier": "primary_text", "corpus_origin": "ingested", "retrieved": head.get("retrieved"),
             "length": len(text), "body_start": body, "sections": corpus.parse_sections(text, body),
             "dates": corpus.date_candidates(text, body), "boundaries": corpus.boundary_candidates(text, body)}
    (config.INDEX / f"{doc_id}.json").write_text(json.dumps(entry, indent=1, ensure_ascii=False))
    return entry


def ingest(path, jurisdiction, doc_id):
    t0 = time.time()
    rules_before = C.internal_rules()
    index_file(path, doc_id, jurisdiction)
    luna_pass.extract(doc_id)
    gate.run([doc_id])
    rules_after = C.internal_rules()
    new = [r for r in rules_after if r["unit"] == doc_id]
    effs = sorted({C.effective(r["events"], r["state"], r.get("provision"))["from"] for r in new} - {None})
    return {"doc_id": doc_id, "new_rules": new, "effective": effs, "rules_before": rules_before,
            "rules_after": rules_after, "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--jurisdiction", required=True)
    ap.add_argument("--id", default="X001")
    a = ap.parse_args()
    res = ingest(a.path, a.jurisdiction, a.id)
    C.build()
    print(f"{res['doc_id']}: {len(res['new_rules'])} rule(s), effective {res['effective']}, {res['seconds']} s")
    for r in res["new_rules"]:
        print(" ", r["category"], "|", r["citation"], "|", r["requirement"][:100], "| key:", r["key_value"])
