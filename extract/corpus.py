"""Index the starter corpus: pinned document versions, headers, evidence tiers, sections, candidates.

No model calls. Writes out/index/<doc_id>.json and out/inventory.json.
"""
import csv
import hashlib
import json
import re
from collections import defaultdict

from . import config
from .sections import parse_sections

# Evidence tier by URL. Official code, statute, bill and ordinance text is primary;
# bill-status pages are official records; other official pages are summaries.
PRIMARY = [r"leginfo\.legislature\.ca\.gov/faces/codes_displaySection", r"leginfo\.legislature\.ca\.gov/faces/bill",
           r"malegislature\.gov/Laws/GeneralLaws", r"malegislature\.gov/Bills/\d+/[HS]\d+$", r"pub\.njleg",
           r"Ordinance", r"municode", r"ordinance-materials", r"cityclerk\.lacity\.org"]
RECORD = [r"BillHistory"]

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
DATE_PATTERNS = [
    (re.compile(rf"\b({MONTHS})\s+(\d{{1,2}}),\s+(\d{{4}})"), "mdy_long"),
    (re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b"), "mdy_slash"),
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), "iso"),
    (re.compile(rf"\b({MONTHS})\s+(\d{{4}})\b"), "my_long"),
]
BOUNDARY = re.compile(
    r"\b(on or before|on or after|prior to|before|after|no more than|not more than|more than|less than|"
    r"in excess of|not exceed|exceeds?|at least|within the previous \d+ years|or more|or fewer|or less)\b",
    re.IGNORECASE)


def tier_for(row):
    if not row["text_file"]:
        return "manifest_only"
    if row["source_type"].startswith("secondary"):
        return "secondary"
    url = row["url"]
    if any(re.search(p, url) for p in RECORD):
        return "official_record"
    if any(re.search(p, url) for p in PRIMARY):
        return "primary_text"
    return "official_summary"


def parse_header(text):
    """SOURCE / RETRIEVED lines at the top of every supplied text file."""
    head = {}
    pos = 0
    for line in text.splitlines(keepends=True)[:3]:
        if line.startswith("SOURCE:"):
            head["source"] = line.split(":", 1)[1].strip()
        elif line.startswith("RETRIEVED:"):
            head["retrieved"] = line.split(":", 1)[1].strip()
        else:
            break
        pos += len(line)
    return head, pos


def date_candidates(text, body_start):
    out = []
    month_no = {m: i + 1 for i, m in enumerate(MONTHS.split("|"))}
    for pat, kind in DATE_PATTERNS:
        for m in pat.finditer(text, body_start):
            g = m.groups()
            try:
                if kind == "mdy_long":
                    iso, precision = f"{int(g[2]):04d}-{month_no[g[0]]:02d}-{int(g[1]):02d}", "day"
                elif kind == "mdy_slash":
                    year = int(g[2]) + (2000 if len(g[2]) == 2 else 0)
                    iso, precision = f"{year:04d}-{int(g[0]):02d}-{int(g[1]):02d}", "day"
                elif kind == "iso":
                    iso, precision = m.group(0), "day"
                else:
                    iso, precision = f"{int(g[1]):04d}-{month_no[g[0]]:02d}", "month"
            except (ValueError, KeyError):
                continue
            out.append({"start": m.start(), "end": m.end(), "text": m.group(0), "iso": iso, "precision": precision})
    # a long-form day date also matches the month-only pattern; keep the more precise one
    out.sort(key=lambda d: (d["start"], -(d["end"] - d["start"])))
    kept, last_end = [], -1
    for d in out:
        if d["start"] >= last_end:
            kept.append(d)
            last_end = d["end"]
    return kept


def boundary_candidates(text, body_start):
    return [{"start": m.start(), "end": m.end(), "text": m.group(0)} for m in BOUNDARY.finditer(text, body_start)]


def index_document(row):
    raw = (config.STARTER / "corpus" / row["text_file"]).read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    pinned = config.VERSIONS / f"{sha}.txt"
    if not pinned.exists():
        pinned.write_bytes(raw)
    elif hashlib.sha256(pinned.read_bytes()).hexdigest() != sha:
        raise RuntimeError(f"pinned version {sha} was modified")
    text = raw.decode("utf-8")
    header, body_start = parse_header(text)
    sections = parse_sections(text, body_start)
    return {
        "doc_id": row["doc_id"],
        "version_id": f"sha256:{sha}",
        "manifest_sha256_matches": row["sha256"] == sha,
        "jurisdiction": row["jurisdictions"],
        "url": row["url"],
        "source_type": row["source_type"],
        "evidence_tier": tier_for(row),
        "retrieved": header.get("retrieved") or row["retrieved_at"],
        "length": len(text),
        "body_start": body_start,
        "sections": sections,
        "dates": date_candidates(text, body_start),
        "boundaries": boundary_candidates(text, body_start),
    }


def load_text(index_entry):
    sha = index_entry["version_id"].split(":", 1)[1]
    return (config.VERSIONS / f"{sha}.txt").read_bytes().decode("utf-8")


def build():
    config.INDEX.mkdir(parents=True, exist_ok=True)
    config.VERSIONS.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(config.MANIFEST, encoding="utf-8")))
    inventory = defaultdict(lambda: {"documents": [], "tiers": defaultdict(int)})
    summary = []
    for row in rows:
        jur = row["jurisdictions"]
        tier = tier_for(row)
        inventory[jur]["documents"].append({"doc_id": row["doc_id"], "tier": tier, "url": row["url"],
                                            "capture": row["capture"], "status": row["status"]})
        inventory[jur]["tiers"][tier] += 1
        if not row["text_file"]:
            continue
        entry = index_document(row)
        (config.INDEX / f"{row['doc_id']}.json").write_text(json.dumps(entry, indent=1, ensure_ascii=False))
        enum = [s for s in entry["sections"] if s["kind"] != "block"]
        summary.append((row["doc_id"], tier, len(enum), sum(s["kind"] == "block" for s in entry["sections"]),
                        len(entry["dates"]), entry["manifest_sha256_matches"]))
    for jur, inv in inventory.items():
        inv["tiers"] = dict(inv["tiers"])
        inv["has_text"] = any(d["tier"] not in ("manifest_only",) for d in inv["documents"])
    (config.OUT / "inventory.json").write_text(json.dumps(inventory, indent=1, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    for line in build():
        print(*line)
