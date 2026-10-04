"""Independent offline adversarial tests for the source monitor.

Run: .venv/bin/python -m unittest tests.test_monitor_pressure -v
Network and model calls are never needed; production adapters/store/engine run directly.
"""
import copy
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from monitor import adapters
from monitor.http import Client, LIMIT
from monitor.pipeline import align_ids, clock_changes, preview
from monitor.report import render
from monitor.run import access_problem, run
from monitor.store import Store

NOW = "2026-10-04T10:00:00+00:00"
URL = "https://example.invalid/law.txt"
TEXT = "Fictional legal source for independent offline pressure testing. " * 4


def source():
    return {"id": "sample", "kind": "document", "jurisdiction": "MA-CAMBRIDGE", "enabled": True,
            "access": {"status": "reviewed", "reviewed_at": "2026-10-04", "reference": "offline:test", "note": "fictional"},
            "scopes": [{"host": "example.invalid", "path": "/", "prefix": True}],
            "urls": [URL], "interval_seconds": 60, "max_documents": 2}


def legislation():
    return {"id": "newark", "base_url": "https://webapi.legistar.com/v1/newark/matters",
            "known_matters": [], "lookback_days": 90, "max_pages": 2, "page_size": 1,
            "max_documents": 2, "title_terms": ["rent"]}


def row(mid):
    return {"MatterId": mid, "MatterTypeName": "Ordinance", "MatterTitle": "Rent rules",
            "MatterLastModifiedUtc": "2026-09-01T00:00:00"}


class Pressure(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root)
        self.cfg = self.root / "sources.json"
        self.cfg.write_text(json.dumps({"sources": [source()]}))
        self.network = patch("socket.getaddrinfo", side_effect=AssertionError("Unexpected real network access"))
        self.network.start()

    def tearDown(self):
        self.network.stop()
        self.store.close()
        self.tmp.cleanup()

    def client(self):
        return Client(self.store, source()["scopes"])

    def test_retry_backoff_survives_reopen_and_serves_other_jobs(self):
        first = self.store.observe("sample", "a", TEXT, {"url": URL}, NOW)
        self.store.finish(first, "failed", error="transient", now=NOW)
        self.store.observe("sample", "b", TEXT, {"url": URL}, NOW)
        self.store.put("source:sample", {"last_attempt": NOW})
        self.store.close()
        self.store = Store(self.root)
        attempted = []
        def process(st, event, *args):
            attempted.append(event["document"])
            return {"ok": True}
        class NoFetch:
            count = 0
            def __init__(self, *args): pass
            def get(self, url): raise RuntimeError("offline fetch unavailable")
        with patch("monitor.run.clock_changes"), patch("monitor.run.preview", side_effect=process):
            run(self.cfg, self.root, now=NOW, process=True, max_jobs=1, client_factory=NoFetch)
            run(self.cfg, self.root, now="2026-10-04T10:01:59+00:00", process=True, max_jobs=1, client_factory=NoFetch)
            self.assertEqual(attempted, ["b"])
            run(self.cfg, self.root, now="2026-10-04T10:02:00+00:00", process=True, max_jobs=1, client_factory=NoFetch)
        self.assertEqual(attempted, ["b", "a"])
        self.assertEqual(self.store.events()[0]["attempts"], 2)

    def test_policy_age_boundaries_and_forced_expired_queue(self):
        today = dt.date(2026, 10, 4)
        for reviewed, blocked in [("2026-09-04", False), ("2026-09-03", True), ("2026-10-05", True)]:
            s = source(); s["access"]["reviewed_at"] = reviewed
            self.assertEqual(bool(access_problem(s, today)), blocked)
        s["access"]["reviewed_at"] = "2026-09-03"
        self.cfg.write_text(json.dumps({"sources": [s]}))
        self.store.observe("sample", "a", TEXT, {"url": URL}, NOW)
        with patch("monitor.run.clock_changes"), patch("monitor.run.preview") as model, patch("monitor.run.Client") as net:
            result = run(self.cfg, self.root, now=NOW, force=True, process=True, client_factory=net)
            model.assert_not_called(); net.assert_not_called()
        self.assertEqual(result["events"][0]["status"], "pending")

    def test_document_redirect_limit_never_fetches_fifth_hop(self):
        client = self.client()
        def response(url, headers=None):
            n = int(url.rsplit("/", 1)[1])
            return 302, {"Location": f"/{n + 1}"}, b""
        with patch.object(client, "robots"), patch.object(client, "_get", side_effect=response) as get:
            with self.assertRaisesRegex(ValueError, "redirect"):
                client.get("https://example.invalid/0")
        self.assertEqual(get.call_count, 4)

    def test_robots_redirect_limit_and_cross_host_block(self):
        client = self.client()
        with patch.object(client, "_get", return_value=(302, {"Location": "https://other.invalid/robots.txt"}, b"")) as get:
            with self.assertRaises(ValueError): client.robots(URL)
            self.assertEqual(get.call_count, 1)
        client = self.client()
        with patch.object(client, "_get", side_effect=[(302, {"Location": f"/robots{i}"}, b"") for i in range(4)]) as get:
            with self.assertRaises(ValueError): client.robots(URL)
            self.assertEqual(get.call_count, 4)

    def test_robots_delay_and_request_rate_limits(self):
        for body in (b"User-agent: *\nCrawl-delay: 61", b"User-agent: *\nRequest-rate: 1/120"):
            client = self.client()
            with patch.object(client, "_get", return_value=(200, {}, body)), patch("monitor.http.time.sleep") as sleep:
                with self.assertRaisesRegex(ValueError, "delay"): client.robots(URL)
                sleep.assert_not_called()

    def test_retry_after_on_document_persists_across_client_restart(self):
        client = self.client()
        with patch.object(client, "robots"), patch.object(client, "_get", return_value=(429, {"Retry-After": "86400"}, b"")):
            with self.assertRaises(RuntimeError): client.get(URL)
        client = self.client()
        with patch.object(client, "robots") as robots, patch.object(client, "_get") as get:
            with self.assertRaisesRegex(RuntimeError, "Retry-After"): client.get(URL)
            robots.assert_not_called(); get.assert_not_called()

    def test_retry_after_on_robots_persists_across_client_restart(self):
        client = self.client()
        with patch.object(client, "_get", return_value=(429, {"Retry-After": "86400"}, b"")):
            with self.assertRaises(ValueError): client.get(URL)
        self.assertIsNotNone(self.store.get("backoff:example.invalid"),
                             "robots 429 loses server Retry-After, so the next worker cycle retries early")
        client = self.client()
        with patch.object(client, "_get") as get:
            with self.assertRaisesRegex(RuntimeError, "Retry-After"): client.get(URL)
            get.assert_not_called()

    def test_retry_after_header_is_case_insensitive_in_real_transport(self):
        class Response:
            status = 429
            headers = {"rEtRy-AfTeR": "86400"}
            def __enter__(self): return self
            def __exit__(self, *args): pass
        client = self.client()
        before = dt.datetime.now(dt.timezone.utc)
        with patch("monitor.http.public_url"), patch.object(client, "robots"), patch.object(client.opener, "open", return_value=Response()):
            with self.assertRaises(RuntimeError): client.get(URL)
        until = dt.datetime.fromisoformat(self.store.get("backoff:example.invalid"))
        self.assertGreaterEqual((until - before).total_seconds(), 86400,
                                "HTTP headers are case-insensitive; fallback 1h ignores the requested 24h")

    def test_body_and_request_budgets(self):
        class Response:
            status = 200
            headers = {"Content-Type": "text/plain"}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, n): return b"x" * n
        client = self.client()
        with patch("monitor.http.public_url"), patch.object(client.opener, "open", return_value=Response()):
            with self.assertRaisesRegex(ValueError, "4 MB"): client._get(URL)
        client = Client(self.store, source()["scopes"], max_requests=0)
        with patch("monitor.http.public_url"), patch.object(client.opener, "open") as get:
            with self.assertRaisesRegex(RuntimeError, "budget"): client._get(URL)
            get.assert_not_called()

    def test_304_without_cached_bytes_and_malformed_json_fail_closed(self):
        client = self.client()
        with patch.object(client, "robots"), patch.object(client, "_get", return_value=(304, {}, b"")):
            with self.assertRaisesRegex(ValueError, "304"): client.get(URL)
        for body, kind in [(b"{broken", "application/json"), (b"[]", "text/html"), (b"\xff", "application/json")]:
            with patch.object(client, "get", return_value=(body, kind)):
                with self.assertRaises((ValueError, UnicodeError)): client.json(URL)

    def test_malformed_document_response_preserves_pinned_snapshot(self):
        self.store.observe("sample", "sample:" + URL, TEXT, {"url": URL}, NOW)
        for body, kind in [(b"\xff" * 100, "text/plain"), (b"removed", "text/plain"), (b"x" * 100, "application/octet-stream")]:
            class Fake:
                count = 0
                def __init__(self, *args): pass
                def get(self, url): return body, kind
            with patch("monitor.run.clock_changes"):
                result = run(self.cfg, self.root, now=NOW, force=True, client_factory=Fake)
            self.assertEqual(len(result["events"]), 1)
            self.assertEqual(result["sources"][0]["status"], "partial")
            self.assertNotIn("last_success", result["sources"][0])

    def test_discovery_midpage_failure_keeps_checkpoint_and_recovers_after_reopen(self):
        s = legislation()
        state = {"discovery_window": {"start": "2026-08-01T00:00:00", "end": "2026-10-04T10:00:00",
                                     "started_at": NOW, "cursor": ["2026-09-01T00:00:00", 1]}}
        original = copy.deepcopy(state)
        class Broken:
            n = 0
            def json(self, url):
                self.n += 1
                if self.n == 1: return [row(2)]
                raise RuntimeError("page connection lost")
        with self.assertRaises(RuntimeError): adapters.legistar(s, state, Broken(), NOW)
        self.assertEqual(state, original)
        self.store.put("source:newark", state)
        self.store.close(); self.store = Store(self.root)
        state = self.store.get("source:newark")
        class Recovered:
            queries = []
            def json(self, url):
                if "?" in url:
                    self.queries.append(parse_qs(urlsplit(url).query)["$filter"][0])
                    return [row(2)] if len(self.queries) == 1 else []
                if url.endswith("/versions"): return [{"Key": "1", "Value": "1"}]
                if "/texts/" in url: return {"MatterTextPlain": TEXT}
                return {"MatterFile": "2", "MatterTitle": "Rent rules", "MatterStatusName": "Adopted"}
        client = Recovered()
        docs, errors = adapters.legistar(s, state, client, NOW)
        self.assertFalse(errors); self.assertEqual(len(docs), 1)
        self.assertIn("MatterId gt 1", client.queries[0]); self.assertIn("MatterId gt 2", client.queries[1])
        self.assertNotIn("discovery_window", state)

    def test_duplicate_and_reversion_history_survives_restart(self):
        for text in [TEXT, TEXT + " changed", TEXT, TEXT, TEXT + " changed", TEXT]:
            self.store.observe("sample", "a", text, {"url": URL}, NOW)
            self.store.close(); self.store = Store(self.root)
        events = self.store.events()
        self.assertEqual(len(events), 5)
        self.assertEqual(len({e["id"] for e in events}), 5)
        self.assertEqual(len({e["after_id"] for e in events}), 2)
        self.assertTrue(all(b["before_id"] == a["after_id"] for a, b in zip(events, events[1:])))

    def test_report_escapes_source_error_and_document_text(self):
        payload = '<script>alert("hostile source")</script>'
        report = {"review_reasons": [payload], "issues": [], "impacts": [], "text_diff": payload}
        html = render({"sources": [{"id": payload, "error": payload}], "events": [
            {"document": payload, "status": "review_required", "created_at": NOW, "report": json.dumps(report)}],
            "clock": None, "as_of": "2026-10-04", "generated_at": NOW, "note": "Not legal advice"})
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)


class ImpactPressure(unittest.TestCase):
    setUp = Pressure.setUp
    tearDown = Pressure.tearDown
    @classmethod
    def setUpClass(cls):
        from engine import rules, facts
        cls.rules = rules.load()
        cls.addresses = facts.load()

    def test_partial_extraction_cannot_infer_known_provision_removed(self):
        baseline = copy.deepcopy([r for r in self.rules if r["unit"] == "S018"])
        self.assertEqual(len(baseline), 2)
        candidate = baseline[:1]
        candidate[0]["id"] = "XMON:" + candidate[0]["id"]
        self.store.observe("sample", "a", TEXT, {"url": URL, "baseline_units": ["S018"]}, NOW)
        report = preview(self.store, self.store.events()[0], {"jurisdiction": "NJ-NEWARK"}, "2026-10-04",
                         extractor=lambda *args: {"rules": candidate, "issues": []},
                         base_rules=self.rules, addresses=self.addresses)
        self.assertEqual(len(report["impacts"]), 0,
                         "One valid extracted provision silently removes the other accepted provision")
        self.assertTrue(report["issues"])

    def test_accepted_jurisdiction_change_resets_clock_baseline(self):
        clock_changes(self.store, "2026-10-04", self.rules, self.addresses)
        changed = copy.deepcopy(self.rules)
        target = next(r for r in changed if r["id"] == "CA-DEP-1950.5")
        target.update(jurisdiction="MA", jurisdiction_id="MA", state="MA")
        clock_changes(self.store, "2026-10-05", changed, self.addresses)
        self.assertEqual(self.store.get("clock_report")["mode"], "baseline_reset")

    def test_alignment_preserves_symbolic_engine_refs_and_rejects_ambiguous_identity(self):
        baseline = copy.deepcopy([r for r in self.rules if r["unit"] == "S018"])
        candidates = copy.deepcopy(baseline)
        for r in candidates: r["id"] = "XMON:" + r["id"]
        candidates[0]["applies_if"] = {"kind": "ref", "ref": "local_rent_control"}
        aligned = align_ids(candidates, baseline)
        self.assertEqual([r["id"] for r in aligned], [r["id"] for r in baseline])
        self.assertEqual(aligned[0]["applies_if"]["ref"], "local_rent_control")
        self.assertTrue(candidates[0]["id"].startswith("XMON:"))
        ambiguous = copy.deepcopy(candidates)
        duplicate = copy.deepcopy(ambiguous[0]); duplicate["id"] += "-duplicate"
        ambiguous.append(duplicate)
        aligned = align_ids(ambiguous, baseline)
        self.assertEqual(aligned[0]["id"], ambiguous[0]["id"])
        self.assertEqual(aligned[-1]["id"], ambiguous[-1]["id"])

    def test_later_partial_version_cannot_remove_previously_observed_provision(self):
        baseline = copy.deepcopy([r for r in self.rules if r["unit"] == "S018"])
        self.store.observe("sample", "new-doc", TEXT, {"url": URL}, NOW)
        self.store.observe("sample", "new-doc", TEXT + " revised", {"url": URL}, NOW)
        event = self.store.events()[-1]
        def extract(st, snapshot, jurisdiction):
            return {"rules": baseline if snapshot["id"] == event["before_id"] else baseline[:1], "issues": []}
        report = preview(self.store, event, {"jurisdiction": "NJ-NEWARK"}, "2026-10-04", extractor=extract,
                         base_rules=[], addresses=self.addresses)
        self.assertEqual(len(report["impacts"]), 0, "A subsequent partial extraction must not infer a repeal either")
        self.assertTrue(report["issues"])

    def test_linked_versions_cannot_both_omit_an_accepted_provision(self):
        baseline = copy.deepcopy([r for r in self.rules if r["unit"] == "S018"])
        self.store.observe("sample", "known-doc", TEXT, {"url": URL, "baseline_units": ["S018"]}, NOW)
        self.store.observe("sample", "known-doc", TEXT + " revised", {"url": URL, "baseline_units": ["S018"]}, NOW)
        event = self.store.events()[-1]
        for new_rules in (baseline[:1], baseline):
            with self.subTest(new_is_also_partial=len(new_rules) == 1):
                def extract(st, snapshot, jurisdiction):
                    return {"rules": baseline[:1] if snapshot["id"] == event["before_id"] else new_rules, "issues": []}
                report = preview(self.store, event, {"jurisdiction": "NJ-NEWARK"}, "2026-10-04", extractor=extract,
                                 base_rules=self.rules, addresses=self.addresses)
                self.assertEqual(len(report["impacts"]), 0, "Known baseline omission in the old extraction makes its comparison unreliable")
                self.assertTrue(report["issues"])

    def test_clock_runs_after_all_sources_fail_and_skips_no_effective_boundary(self):
        class Failed:
            count = 0
            def __init__(self, *args): pass
            def get(self, url): raise RuntimeError("offline failure")
        with patch("engine.rules.load", return_value=self.rules), patch("engine.facts.load", return_value=self.addresses):
            run(self.cfg, self.root, now=NOW, as_of="2027-06-30", client_factory=Failed)
            result = run(self.cfg, self.root, now="2026-10-04T10:01:00+00:00", as_of="2027-07-02", client_factory=Failed)
        self.assertEqual(result["sources"][0]["status"], "partial")
        self.assertEqual(result["clock"]["mode"], "accepted_rules_date_change")
        self.assertTrue(result["clock"]["affected_address_ids"])

    def test_duplicate_candidates_and_invalid_dates_publish_no_report(self):
        candidate = copy.deepcopy([r for r in self.rules if r["unit"] == "S018"])
        self.store.observe("sample", "a", TEXT, {"url": URL, "baseline_units": ["S018"]}, NOW)
        event = self.store.events()[0]
        report = preview(self.store, event, {"jurisdiction": "NJ-NEWARK"}, "2026-10-04",
                         extractor=lambda *args: {"rules": [candidate[0], candidate[0]], "issues": []},
                         base_rules=self.rules, addresses=self.addresses)
        self.assertEqual(report["impacts"], []); self.assertIn("Duplicate rule IDs in preview", report["issues"])
        candidate[0]["eff"]["from"] = "2027-99-99"
        with self.assertRaises(ValueError):
            preview(self.store, event, {"jurisdiction": "NJ-NEWARK"}, "2026-10-04",
                    extractor=lambda *args: {"rules": candidate, "issues": []}, base_rules=self.rules, addresses=self.addresses)


if __name__ == "__main__":
    unittest.main()
