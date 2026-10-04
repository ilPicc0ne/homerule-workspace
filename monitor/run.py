"""One bounded poll cycle and optional isolated extraction of queued versions."""
import datetime as dt
import json
import re
from pathlib import Path

from . import adapters
from .http import Client, permitted
from .pipeline import clock_changes, preview
from .store import Store, locked, stamp

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "monitor/sources.json"
DEFAULT_STATE = ROOT / "build/source-monitor"


def config(path, today):
    data = json.loads(Path(path).read_text())
    sources = data["sources"]
    ids = set()
    jurisdictions = {j["id"] for j in json.loads((ROOT / "contracts/jurisdictions.json").read_text())["jurisdictions"]}
    for s in sources:
        if not re.fullmatch(r"[a-z0-9-]{1,64}", s["id"]) or s["id"] in ids:
            raise ValueError("Invalid/duplicate source id")
        ids.add(s["id"])
        if s["jurisdiction"] not in jurisdictions or s["kind"] not in ("legistar", "document"):
            raise ValueError("Unknown jurisdiction or adapter")
        for field, default, maximum in (("interval_seconds", 21600, 604800), ("max_documents", 12, 100),
                                        ("page_size", 50, 100), ("max_pages", 4, 20), ("lookback_days", 90, 365)):
            v = s.setdefault(field, default)
            if not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= maximum:
                raise ValueError("Invalid bound: " + field)
        if s["interval_seconds"] < 60:
            raise ValueError("Polling interval must be at least 60 seconds")
        if not s.get("scopes"):
            raise ValueError("Source needs reviewed routes")
        for scope in s["scopes"]:
            if not scope["host"] or not scope["path"].startswith("/") or "*" in scope["host"]:
                raise ValueError("Invalid route scope")
        for url in s.get("urls", []) + [s[k] for k in ("base_url", "index_url") if k in s]:
            if not permitted(url, s["scopes"]):
                raise ValueError("Configured URL outside source scope")
        if s["kind"] == "legistar" and not re.fullmatch(r"https://webapi\.legistar\.com/v1/[a-z0-9-]+/matters", s["base_url"]):
            raise ValueError("Legistar base must be an official matters endpoint")
        if s.get("index_url"):
            re.compile(s["link_pattern"])
    return sources


def access_problem(source, today):
    a = source.get("access", {})
    if not source.get("enabled") or a.get("status") != "reviewed":
        return "Source disabled or access not reviewed"
    try:
        age = (today - dt.date.fromisoformat(a["reviewed_at"])).days
        if not 0 <= age <= 30 or not a.get("reference") or not a.get("note"):
            return "Source access review missing, future-dated or over 30 days old"
    except (KeyError, ValueError):
        return "Invalid source access review"
    return None


def run(config_path=DEFAULT_CONFIG, state_dir=DEFAULT_STATE, *, as_of=None, process=False,
        max_jobs=2, force=False, now=None, client_factory=Client):
    now = now or stamp()
    when = dt.datetime.fromisoformat(now)
    today = when.date()
    as_of = as_of or today.isoformat()
    dt.date.fromisoformat(as_of)
    sources = config(config_path, today)
    with locked(state_dir):
        store = Store(state_dir)
        try:
            for source in sources:
                key = "source:" + source["id"]
                state = store.get(key, {})
                reason = access_problem(source, today)
                if reason:
                    state.update(status="blocked", error=reason, last_attempt=now)
                    store.put(key, state)
                    continue
                last = state.get("last_attempt")
                if not force and last and (when - dt.datetime.fromisoformat(last)).total_seconds() < source["interval_seconds"]:
                    continue
                state["last_attempt"] = now
                try:
                    client = client_factory(store, source["scopes"])
                    docs, errors = getattr(adapters, source["kind"])(source, state, client, now)
                    for doc, text, metadata in docs:
                        store.observe(source["id"], doc, text, metadata, now)
                    state.update(status="partial" if errors else "ok", error="; ".join(errors) or None,
                                 requests=client.count, observed_documents=len(docs))
                    if not errors:
                        state["last_success"] = now
                except Exception as e:
                    state.update(status="failed", error=str(e))
                store.put(key, state)
            by_id = {s["id"]: s for s in sources}
            if process:
                # Try each queued event once per run; failures are retained for retry.
                eligible = [e for e in store.events(pending=True)
                            if e["source"] in by_id and not access_problem(by_id[e["source"]], today)
                            and (not e.get("retry_after") or dt.datetime.fromisoformat(e["retry_after"]) <= when)]
                for event in sorted(eligible, key=lambda e: (e["attempts"], e["created_at"], e["id"]))[:max_jobs]:
                    s = by_id[event["source"]]
                    try:
                        report = preview(store, event, s, as_of)
                        store.finish(event["id"], "review_required", report=report, now=now)
                    except Exception as e:
                        store.finish(event["id"], "failed", error=str(e), now=now)
            clock_changes(store, as_of)
            return summary(store, sources, as_of, now)
        finally:
            store.close()


def summary(store, sources, as_of, now):
    return {"not_legal_advice": True, "as_of": as_of, "generated_at": now,
            "sources": [{"id": s["id"], "jurisdiction": s["jurisdiction"], **store.get("source:" + s["id"], {})}
                        for s in sources], "events": store.events(), "clock": store.get("clock_report"),
            "note": "Snapshots are observations, not declarations of current law. Impact previews require review. No emails sent."}
