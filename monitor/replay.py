"""Offline transport replay. --extract uses the real extractor, not invented rule records."""
import datetime as dt
import json
from pathlib import Path

from .run import ROOT, run
from .report import write


def replay(root, extract=False):
    root = Path(root)
    if (root / "monitor.sqlite3").exists():
        raise ValueError("Replay needs a fresh state directory to preserve its history")
    root.mkdir(parents=True, exist_ok=True)
    source = {"id": "fictional-replay", "kind": "document", "jurisdiction": "MA-CAMBRIDGE", "enabled": True,
              "access": {"status": "reviewed", "reviewed_at": dt.datetime.now(dt.timezone.utc).date().isoformat(),
                         "reference": "local:tests/fixtures/synthetic/X001.txt", "note": "Offline fictional fixture; no source requests"},
              "scopes": [{"host": "example.invalid", "path": "/fictional.txt"}],
              "urls": ["https://example.invalid/fictional.txt"], "interval_seconds": 60, "max_documents": 1}
    cfg = root / "replay-sources.json"
    cfg.write_text(json.dumps({"sources": [source]}))
    original = (ROOT / "tests/fixtures/synthetic/X001.txt").read_text()
    # Two explicit synthetic source versions. No rules or results are hardcoded here.
    versions = [original, original.replace("six or more dwelling units", "eight or more dwelling units")]
    for text in versions:
        class ReplayClient:
            def __init__(self, *args):
                self.count = 0

            def get(self, url):
                self.count += 1
                return text.encode(), "text/plain"
        data = run(cfg, root, process=extract, max_jobs=2, force=True, client_factory=ReplayClient)
    data["note"] = "REPLAY: fictional ordinance, offline source transport. " + (
        "Real model extraction and existing address engine used; candidate results require review."
        if extract else "Extraction NOT RUN. This replay only demonstrates discovery, snapshots and queueing.") + " Not legal advice. No emails sent."
    write(data, root)
    return data
