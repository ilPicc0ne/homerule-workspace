"""Findings from manifest rows that have no supplied text (link-only, check-terms).

One Jev call classifies each row from its URL and source type: what kind of source it is and which topic.
Results become I8 findings with the link as evidence (no quote): a failed measure (T5's IP 25-21), or a law
that exists but whose text is not in the corpus (e.g. Santa Ana's ban). Never turned into rules.
Writes out/link_findings.json.
"""
import csv
import json

from . import config, llm, jev_pass, compile as C

KIND = {
    "law_text": "The official text of a law, code section or ordinance (but not supplied here).",
    "enacted_news": "News or a summary saying a law or ordinance was adopted or is in force.",
    "failed_measure": "News saying a ballot question, bill or measure failed, was struck, withdrawn or rejected.",
    "pending_news": "News or a summary about a bill or proposal not yet enacted.",
    "other": "Something else (litigation, compliance advice, general guidance).",
}


def run():
    rows = [r for r in csv.DictReader(open(config.MANIFEST, encoding="utf-8")) if not r["text_file"]]
    state = "\n".join(f"[{r['doc_id']}] {r['jurisdictions']} | {r['source_type']} | {r['url']}" for r in rows)
    q = {}
    for r in rows:
        q[f"{r['doc_id']}_kind"] = {"type": "choice", "criteria": KIND,
                                    "instructions": f"Judging from its URL and source type, what is source [{r['doc_id']}] ({r['url']})?"}
        q[f"{r['doc_id']}_cat"] = {"type": "choice", "criteria": jev_pass.CATEGORIES,
                                   "instructions": f"Which housing topic is source [{r['doc_id']}] ({r['url']}) about?"}
    answers, _ = llm.jev(state, q, stage="jev_links", ref="manifest_links")
    out = []
    for r in rows:
        k, c = answers[f"{r['doc_id']}_kind"], answers[f"{r['doc_id']}_cat"]
        if c["choice"] == "none" or min(k["confidence"], c["confidence"]) < 0.6:
            continue
        kind = {"failed_measure": "measure_failed", "enacted_news": "not_in_corpus", "law_text": "not_in_corpus"}.get(k["choice"])
        if not kind:
            continue
        j = C.BY_SCHEMA.get(r["jurisdictions"], {})
        out.append({"jurisdiction": j.get("id", r["jurisdictions"]), "category": c["choice"], "kind": kind,
                    "citation": None, "quote": None, "source_doc_ids": [r["doc_id"]], "evidence": "manifest_link",
                    "url": r["url"], "confidence": round(min(k["confidence"], c["confidence"]), 2),
                    "note": f"From the manifest link only ({k['choice']}); no text in the corpus."})
    (config.OUT / "link_findings.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    for f in run():
        print(f["jurisdiction"], f["category"], f["kind"], f["confidence"], f["url"][:90])
