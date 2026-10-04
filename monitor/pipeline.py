"""Existing extractor/engine integration: before/after previews, never automatic legal promotion."""
import copy
import datetime as dt
import difflib
import json
import subprocess
import sys
from pathlib import Path

from .store import digest

ROOT = Path(__file__).resolve().parents[1]


def extract_snapshot(store, snapshot, jurisdiction):
    out = store.root / "extractions"
    out.mkdir(exist_ok=True)
    # Cache keyed to source AND extractor revision; source freshness is not extraction freshness.
    files = sorted((ROOT / "extract").glob("*.py")) + sorted((ROOT / "contracts").glob("*.json")) + [ROOT / "monitor/worker.py", ROOT / "engine/rules.py", ROOT / "data/supplemental-legal/manifest.json"]
    version = digest(jurisdiction.encode() + b"".join(f.read_bytes() for f in files))[:16]
    result = out / f"{snapshot['id']}-{version}.json"
    if not result.exists():
        source = out / f"{snapshot['id']}.json"
        source.write_text(json.dumps(snapshot))
        log = out / f"{snapshot['id']}.log"
        with log.open("w") as stream:
            proc = subprocess.run([sys.executable, "-m", "monitor.worker", str(source.resolve()),
                                   str(result.resolve()), jurisdiction], cwd=ROOT, stdout=stream, stderr=stream,
                                  timeout=900)
        if proc.returncode:
            raise RuntimeError(f"Extraction failed; inspect {log}")
    return json.loads(result.read_text())


def semantic(rule):
    fields = ("jurisdiction", "jurisdiction_id", "level", "state", "effect", "category", "citation", "document_status", "eff", "applies_if", "exempt_if", "key_value",
              "key_value_conditions", "tenant_conditions", "interactions", "requirement_quote", "cap_low", "cap_high")
    return {k: rule.get(k) for k in fields}


def impact(before_rules, after_rules, addresses, d0, d1):
    """Include changed amounts/quotes even when coverage stays 'applies'. Both address sets are evaluated."""
    from engine.build import build_lookups
    before = build_lookups(before_rules, addresses, d0)
    after = build_lookups(after_rules, addresses, d1)
    br, ar = ({r["id"]: r for r in rules} for rules in (before_rules, after_rules))
    changed = {}
    for aid in sorted(addresses):
        b, a = ({r["team_rule_id"]: r for r in rows.get(aid, [])} for rows in (before, after))
        changes = []
        for rid in sorted(set(b) | set(a)):
            old, new = b.get(rid), a.get(rid)
            if old == new and semantic(br.get(rid, {})) == semantic(ar.get(rid, {})):
                continue
            changes.append({"rule_id": rid, "before": old, "after": new,
                            "before_rule": semantic(br[rid]) if rid in br else None,
                            "after_rule": semantic(ar[rid]) if rid in ar else None})
        if changes:
            changed[aid] = changes
    return {"before_as_of": d0, "after_as_of": d1, "affected_address_ids": sorted(changed), "addresses": changed}


def align_ids(candidate, previous):
    """Reuse identity only for unique exact citations in an explicitly linked document."""
    def key(r):
        return r.get("jurisdiction_id"), r.get("category"), " ".join((r.get("citation") or "").split()).casefold()
    groups = {}
    for r in previous:
        groups.setdefault(key(r), []).append(r)
    counts = {}
    for r in candidate:
        counts[key(r)] = counts.get(key(r), 0) + 1
    mapping = {r["id"]: groups[key(r)][0]["id"] for r in candidate
               if len(groups.get(key(r), [])) == 1 and counts[key(r)] == 1 and key(r)[2]}
    def remap(v):
        if isinstance(v, list):
            return [remap(x) for x in v]
        if isinstance(v, dict):
            return {k: mapping.get(x, x) if k in ("id", "ref") and isinstance(x, str) else remap(x) for k, x in v.items()}
        return v
    return remap(copy.deepcopy(candidate))


def preview(store, event, source, as_of, extractor=extract_snapshot, base_rules=None, addresses=None):
    from engine import rules as R, facts as F
    before = store.snapshot(event["before_id"]) if event["before_id"] else None
    after = store.snapshot(event["after_id"])
    jurisdiction = R.JUR[source["jurisdiction"]]["schema_name"]
    new = extractor(store, after, jurisdiction)
    old = extractor(store, before, jurisdiction) if before else {"rules": [], "issues": []}
    issues = old["issues"] + new["issues"]
    base = R.load() if base_rules is None else base_rules
    addresses = F.load() if addresses is None else addresses
    units = set(after["metadata"].get("baseline_units", []))
    baseline = [r for r in base if r.get("unit") in units]
    context = [r for r in base if r.get("unit") not in units]
    old_rules = align_ids(old["rules"], baseline) if before else baseline
    new_rules = align_ids(new["rules"], old_rules or baseline)
    baseline_ids = {r["id"] for r in baseline}
    old_ids, new_ids = ({r["id"] for r in rows} for rows in (old_rules, new_rules))
    missing = ((baseline_ids | old_ids) - new_ids) | (baseline_ids - old_ids)
    if missing:
        issues.append("Previously known provisions absent from extraction; reconcile omission or repeal before impact: " + ", ".join(sorted(missing)))
    # Standalone extraction cannot reconstruct repeal/supersession imposed by another document.
    accepted_ends = {r["id"]: (r.get("eff") or {}).get("until") for r in baseline}
    if any(accepted_ends.values()) and any(r["id"] not in accepted_ends for r in new_rules):
        issues.append("Historical source has unmatched candidate provisions; version-chain review required")
    for r in old_rules + new_rules:
        if accepted_ends.get(r["id"]) and (r.get("eff") or {}).get("until") != accepted_ends[r["id"]]:
            issues.append("Accepted version-chain end date missing or changed; reconcile related enactments before impact: " + r["id"])
    # Conflicting IDs would overwrite engine rows. Reject instead of silently choosing one.
    for rules in (context + old_rules, context + new_rules):
        if len({r["id"] for r in rules}) != len(rules):
            issues.append("Duplicate rule IDs in preview")
    report = {"not_legal_advice": True, "as_of": as_of, "event_id": event["id"],
              "document": event["document"], "source_url": after["metadata"]["url"],
              "observed_at": event["created_at"], "before_snapshot": event["before_id"],
              "after_snapshot": event["after_id"], "mode": "candidate_preview", "promoted": False,
              "review_reasons": ["Source changes require review before replacing the accepted law dataset; amendments may need other documents."],
              "issues": sorted(set(issues)), "text_diff": "".join(difflib.unified_diff(
                  (before["text"] if before else "").splitlines(True), after["text"].splitlines(True),
                  fromfile="previous observed text", tofile="current observed text")), "impacts": []}
    if issues:
        report["review_reasons"].append("Extraction checks failed; no impact estimate published")
        return report
    dates = {as_of}
    for r in old_rules + new_rules:
        for key in ("from", "until"):
            date = (r.get("eff") or {}).get(key)
            if date and len(date) == 10 and date >= as_of:
                dt.date.fromisoformat(date)
                dates.add(date)
    for date in sorted(dates):
        report["impacts"].append(impact(context + old_rules, context + new_rules, addresses, date, date))
    return report


def clock_changes(store, as_of, rules=None, addresses=None):
    """Daily reevaluation of accepted rules works even when every source is unchanged/unavailable."""
    from engine import rules as R, facts as F
    previous = store.get("clock")
    rules = R.load() if rules is None else rules
    addresses = F.load() if addresses is None else addresses
    fingerprint = digest(json.dumps(sorted(rules, key=lambda r: r["id"]), sort_keys=True)
                         + json.dumps(addresses, sort_keys=True))
    if previous and previous["as_of"] > as_of:
        raise ValueError("As-of date moved backwards; use a separate state directory for replay")
    if previous and previous["as_of"] != as_of and previous["fingerprint"] == fingerprint:
        result = impact(rules, rules, addresses, previous["as_of"], as_of)
        result.update(not_legal_advice=True, as_of=as_of, mode="accepted_rules_date_change")
        store.put("clock_report", result)
    elif previous and previous["fingerprint"] != fingerprint:
        store.put("clock_report", {"not_legal_advice": True, "as_of": as_of,
                                  "mode": "baseline_reset", "note": "Accepted rules or building facts changed; date-only comparison reset."})
    store.put("clock", {"as_of": as_of, "fingerprint": fingerprint})
