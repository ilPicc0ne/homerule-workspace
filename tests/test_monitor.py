"""Offline transport, lifecycle and real-engine pressure cases for the source monitor."""
import copy
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from monitor import adapters
from monitor.http import Client, permitted, public_url
from monitor.pipeline import clock_changes, impact, preview
from monitor.run import run
from monitor.store import Store, locked

NOW = "2026-10-04T10:00:00+00:00"
URL = "https://example.invalid/law.txt"
TEXT = "A fictional legal document used only as a monitor test fixture. " * 3


def config():
    return {"sources": [{"id": "sample", "kind": "document", "jurisdiction": "MA-CAMBRIDGE", "enabled": True,
                         "access": {"status": "reviewed", "reviewed_at": "2026-10-04", "reference": "test", "note": "fictional"},
                         "scopes": [{"host": "example.invalid", "path": "/", "prefix": True}],
                         "urls": [URL], "interval_seconds": 60, "max_documents": 2}]}


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root)
        self.cfg = self.root / "sources.json"
        self.cfg.write_text(json.dumps(config()))

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_snapshot_dedup_and_revert(self):
        meta = {"url": URL}
        a = self.store.observe("sample", "doc", TEXT, meta, NOW)
        self.assertIsNone(self.store.observe("sample", "doc", TEXT, meta, NOW))
        b = self.store.observe("sample", "doc", TEXT + "changed", meta, NOW)
        c = self.store.observe("sample", "doc", TEXT, meta, NOW)
        self.assertEqual(len(self.store.events()), 3)
        self.assertEqual(len({a, b, c}), 3)
        self.assertEqual(self.store.events()[2]["before_id"], self.store.events()[1]["after_id"])

    def test_lock_excludes_concurrent_worker(self):
        with locked(self.root):
            with self.assertRaises(RuntimeError):
                with locked(self.root):
                    pass

    def test_failed_fetch_preserves_last_success_and_snapshot(self):
        class Fake:
            failure = False
            def __init__(self, *args): self.count = 0
            def get(self, url):
                self.count += 1
                if self.failure: raise RuntimeError("HTTP 429")
                return TEXT.encode(), "text/plain"
        with patch("monitor.run.clock_changes"):
            first = run(self.cfg, self.root, now=NOW, client_factory=Fake)
            Fake.failure = True
            second = run(self.cfg, self.root, now="2026-10-04T11:00:00+00:00", client_factory=Fake)
        self.assertEqual(first["sources"][0]["status"], "ok")
        self.assertEqual(second["sources"][0]["status"], "partial")
        self.assertEqual(second["sources"][0]["last_success"], NOW)
        self.assertEqual(len(second["events"]), 1)

    def test_unreviewed_and_expired_routes_never_fetched(self):
        for change in ({"status": "hold"}, {"reviewed_at": "2020-01-01"}):
            cfg = config(); cfg["sources"][0]["access"].update(change)
            self.cfg.write_text(json.dumps(cfg))
            with patch("monitor.run.clock_changes"), patch("monitor.run.Client") as client:
                data = run(self.cfg, self.root, now=NOW, client_factory=client)
                client.assert_not_called()
            self.assertEqual(data["sources"][0]["status"], "blocked")

    def test_poll_interval_does_not_skip_effective_date_check(self):
        self.store.put("source:sample", {"last_attempt": NOW})
        with patch("monitor.run.clock_changes") as clock, patch("monitor.run.Client") as client:
            run(self.cfg, self.root, now="2026-10-04T10:00:15+00:00", client_factory=client)
            client.assert_not_called()
            clock.assert_called_once()

    def test_document_discovery_stays_in_scope(self):
        source = config()["sources"][0]
        source.update(index_url="https://example.invalid/index", link_pattern=r"\.txt$")
        class Fake:
            def get(self, url):
                if url.endswith("/index"):
                    return b'<a href="/new.txt">New</a><a href="https://evil.invalid/law.txt">Offsite</a>', "text/html"
                return TEXT.encode(), "text/plain"
        state = {}
        docs, errors = adapters.document(source, state, Fake(), NOW)
        self.assertFalse(errors)
        self.assertEqual(len(docs), 2)
        self.assertNotIn("https://evil.invalid/law.txt", state["known_urls"])

    def test_footer_and_scripts_do_not_change_legal_text(self):
        a = adapters.text_of(('<main>' + TEXT + '</main><footer>yesterday</footer>').encode(), "text/html")
        b = adapters.text_of(('<main>' + TEXT + '</main><footer>today</footer><script>alert(1)</script>').encode(), "text/html")
        self.assertEqual(a, b)
        with self.assertRaises(ValueError):
            adapters.text_of(b'<main>Access denied</main>', 'text/html')

    def test_scopes_reject_lookalikes_and_traversal(self):
        scopes = [{"host": "example.gov", "path": "/laws", "prefix": True}]
        for url in ("https://example.gov.evil/laws/a", "https://example.gov/lawsevil", "https://example.gov/laws/%2e%2e/private", "http://example.gov/laws"):
            self.assertFalse(permitted(url, scopes))
        self.assertTrue(permitted("https://example.gov/laws/1?version=2", scopes))

    def test_private_destinations_rejected(self):
        with self.assertRaises(ValueError): public_url("http://example.gov/laws")
        with patch("socket.getaddrinfo", return_value=[(None,None,None,None,("127.0.0.1",443))]):
            with self.assertRaises(ValueError): public_url("https://example.gov/laws")

    def test_conditional_304_uses_exact_prior_bytes(self):
        client = Client(self.store, [{"host": "example.invalid", "path": "/", "prefix": True}])
        with patch.object(client, "robots"), patch.object(client, "_get", side_effect=[
                (200, {"content-type": "text/plain", "etag": '"a"'}, TEXT.encode()), (304, {}, b"")]) as get:
            self.assertEqual(client.get(URL), client.get(URL))
            self.assertEqual(get.call_args.args[1], {"If-None-Match": '"a"'})

    def test_redirect_cannot_leave_allowlist(self):
        client = Client(self.store, [{"host": "example.invalid", "path": "/", "prefix": True}])
        with patch.object(client, "robots"), patch.object(client, "_get", return_value=(302, {"Location": "https://evil.invalid/file"}, b"")) as get:
            with self.assertRaises(ValueError): client.get(URL)
            get.assert_called_once()

    def test_robots_disallow_and_unavailable_are_not_permission(self):
        for code, body in [(200,b"User-agent: *\nDisallow: /"), (403,b"")]:
            c = Client(self.store, [])
            with patch.object(c, "_get", return_value=(code, {}, body)):
                with self.assertRaises(ValueError): c.robots(URL)

    def test_legistar_tracks_status_without_text_change(self):
        s = {"id":"newark", "base_url":"https://webapi.legistar.com/v1/newark/matters", "known_matters":[1],
             "lookback_days":90, "max_pages":2, "page_size":2, "max_documents":2, "title_terms":["rent"]}
        class Fake:
            status = "Pending"
            def json(self, url):
                if '?' in url: return []
                if url.endswith('/versions'): return [{"Key":"3", "Value":"1"}]
                if '/texts/' in url: return {"MatterTextPlain":TEXT}
                return {"MatterFile":"1", "MatterTitle":"Rent rules", "MatterStatusName":self.status}
        f = Fake()
        a, _ = adapters.legistar(s, {}, f, NOW)
        f.status = "Adopted"
        b, _ = adapters.legistar(s, {}, f, NOW)
        self.assertNotEqual(a[0][1], b[0][1])

    def test_truncated_discovery_does_not_claim_complete_coverage(self):
        s = {"id":"newark", "base_url":"https://webapi.legistar.com/v1/newark/matters", "known_matters":[],
             "lookback_days":90, "max_pages":1, "page_size":1, "max_documents":1, "title_terms":["rent"]}
        class Fake:
            def json(self, url): return [{"MatterId":1, "MatterTypeName":"Resolution", "MatterTitle":"Other", "MatterLastModifiedUtc":"2026-09-01T00:00:00"}]
        state={}; _, errors = adapters.legistar(s, state, Fake(), NOW)
        self.assertTrue(errors)
        self.assertNotIn("watermark", state)

    def test_retry_queue_does_not_starve_new_or_eligible_work(self):
        for source, doc in [("removed", "disabled"), ("sample", "bad"), ("sample", "good")]:
            self.store.observe(source, doc, TEXT, {"url": URL}, NOW)
        self.store.put("source:sample", {"last_attempt": NOW})
        attempted = []
        def process(store, event, *args):
            attempted.append(event["document"])
            if event["document"] == "bad": raise RuntimeError("model unavailable")
            return {"ok": True}
        with patch("monitor.run.clock_changes"), patch("monitor.run.preview", side_effect=process):
            for _ in range(3):
                run(self.cfg, self.root, now=NOW, process=True, max_jobs=1)
        self.assertIn("good", attempted)
        self.assertEqual(attempted.count("bad"), 1)
        self.assertNotIn("disabled", attempted)

    def test_discovery_resumes_after_page_limit(self):
        s = {"id":"newark", "base_url":"https://webapi.legistar.com/v1/newark/matters", "known_matters":[],
             "lookback_days":90, "max_pages":1, "page_size":1, "max_documents":1, "title_terms":["rent"]}
        class Fake:
            calls=[]
            def json(self, url):
                self.calls.append(url)
                return [{"MatterId":1, "MatterTypeName":"Resolution", "MatterTitle":"Other", "MatterLastModifiedUtc":"2026-09-01T00:00:00"}] if len(self.calls)==1 else []
        state={}; f=Fake()
        adapters.legistar(s,state,f,NOW)
        self.assertIn("discovery_window",state)
        adapters.legistar(s,state,f,NOW)
        from urllib.parse import unquote
        self.assertIn("MatterId+gt+1", unquote(f.calls[1]))
        self.assertNotIn("discovery_window",state)
        self.assertEqual(state["watermark"], NOW)

    def test_nullable_legistar_index_fields_do_not_block_progress(self):
        source = {"id":"newark", "base_url":"https://webapi.legistar.com/v1/newark/matters", "known_matters":[],
                  "lookback_days":90, "max_pages":1, "page_size":3, "max_documents":1, "title_terms":["rent"]}
        class Fake:
            def json(self, url):
                return [{"MatterId":1, "MatterTypeName":None, "MatterTitle":None, "MatterLastModifiedUtc":"2026-09-01T00:00:00"},
                        {"MatterId":2, "MatterTypeName":"Ordinance", "MatterTitle":None, "MatterLastModifiedUtc":"2026-09-01T01:00:00"}]
        state = {}
        docs, errors = adapters.legistar(source, state, Fake(), NOW)
        self.assertEqual((docs, errors), ([], []))
        self.assertEqual(state["watermark"], NOW)

    def test_failed_extraction_does_not_publish_impact(self):
        self.store.observe("sample", "doc", TEXT, {"url": URL}, NOW)
        event = self.store.events()[0]
        bad = lambda *args: {"rules": [], "issues": ["No located quote"]}
        result = preview(self.store, event, config()["sources"][0], "2026-10-04", extractor=bad, base_rules=[], addresses={})
        self.assertFalse(result["promoted"])
        self.assertEqual(result["impacts"], [])


class RealEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from engine import rules, facts
        cls.rules = rules.load()
        cls.addresses = facts.load()

    def test_value_change_counts_even_when_applicability_same(self):
        before = copy.deepcopy(self.rules)
        after = copy.deepcopy(before)
        target = next(r for r in after if r['id'] == 'CA-DEP-1950.5')
        target["key_value"] = "Fictional changed amount for test"
        out = impact(before, after, self.addresses, "2026-10-01", "2026-10-01")
        self.assertTrue(out["affected_address_ids"])
        self.assertTrue(any(c["before"]["result"] == c["after"]["result"] for cs in out["addresses"].values() for c in cs))

    def test_first_snapshot_id_namespace_does_not_invent_impact(self):
        baseline = [r for r in self.rules if r["unit"] == "S018"]
        candidates = copy.deepcopy(baseline)
        for r in candidates: r["id"] = "XMON:" + r["id"]
        with tempfile.TemporaryDirectory() as tmp:
            st=Store(tmp)
            try:
                st.observe("sample", "doc", TEXT, {"url": URL, "baseline_units":["S018"]}, NOW)
                result=preview(st, st.events()[0], {"jurisdiction":"NJ-NEWARK"}, "2026-10-04",
                               extractor=lambda *a: {"rules":candidates,"issues":[]}, base_rules=self.rules, addresses=self.addresses)
                self.assertEqual(result["issues"], [])
                self.assertTrue(all(not i["addresses"] for i in result["impacts"]))
            finally: st.close()

    def test_historical_source_cannot_silently_lose_end_date(self):
        candidates = copy.deepcopy([r for r in self.rules if r["unit"] == "S021"])
        for r in candidates:
            r["id"] = "XMON:" + r["id"]
            r["eff"]["until"] = None
        with tempfile.TemporaryDirectory() as tmp:
            st=Store(tmp)
            try:
                st.observe("sample", "doc", TEXT, {"url": URL, "baseline_units":["S021"]}, NOW)
                result=preview(st,st.events()[0],{"jurisdiction":"NJ-NEWARK"},"2026-10-04",
                               extractor=lambda *a: {"rules":candidates,"issues":[]},base_rules=self.rules,addresses=self.addresses)
                self.assertTrue(result["issues"])
                self.assertEqual(result["impacts"], [])
            finally: st.close()

    def test_unchanged_rules_produce_no_impact(self):
        self.assertEqual(impact(self.rules, self.rules, self.addresses, "2026-10-01", "2026-10-01")["addresses"], {})

    def test_effective_date_transition_without_source_fetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=Store(tmp)
            try:
                clock_changes(s, "2027-06-30", self.rules, self.addresses)
                clock_changes(s, "2027-07-02", self.rules, self.addresses)
                report=s.get("clock_report")
                self.assertTrue(report["affected_address_ids"])
                self.assertEqual(report["mode"], "accepted_rules_date_change")
                with self.assertRaises(ValueError): clock_changes(s, "2026-01-01", self.rules, self.addresses)
            finally: s.close()


if __name__ == "__main__": unittest.main()
