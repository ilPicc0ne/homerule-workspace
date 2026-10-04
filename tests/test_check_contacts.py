"""Offline regression checks for contact routing and provenance validation."""

import copy
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from tests.check_contacts import ROOT, Fetcher, Page, provenance, resolve, validate


class ContactChecks(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "contracts/contacts.json").read_text())
        self.jurisdictions = {
            j["id"]: j for j in json.loads(
                (ROOT / "contracts/jurisdictions.json").read_text())["jurisdictions"]
        }

    def test_fallback_order_through_county(self):
        jurisdictions = {
            "city": {"level": "city", "parent": "county"},
            "county": {"level": "county", "parent": "state"},
            "state": {"level": "state", "parent": None},
        }
        keys = [("city", "topic"), ("city", "*"),
                ("state", "topic"), ("state", "*")]
        entries = {key: str(key) for key in keys}
        for key in keys:
            self.assertEqual(resolve(entries, jurisdictions, "city", "topic"), entries[key])
            del entries[key]
        self.assertIsNone(resolve(entries, jurisdictions, "city", "topic"))

    def test_invalid_contracts_fail(self):
        self.assertEqual(validate(self.data, self.jurisdictions)[0], [])
        mutations = (
            lambda d: d["entries"].append(copy.deepcopy(d["entries"][0])),
            lambda d: d["entries"][0].update(jurisdiction="CA-FAKE"),
            lambda d: d["entries"][0].update(category="unlisted"),
            lambda d: d["entries"][0]["contacts"][0].update(phone="+18005551234"),
            lambda d: d["entries"].pop(0),  # mandatory state wildcard
        )
        for mutation in mutations:
            data = copy.deepcopy(self.data)
            mutation(data)
            self.assertTrue(validate(data, self.jurisdictions)[0])

    def test_evidence_requires_visible_quote_and_url(self):
        contact = {"source_url": "https://example.gov/office/",
                   "url": "https://example.gov/help", "phone": "+12125550100",
                   "phone_display": "212-555-0100", "source_quote": "Call 212-555-0100"}
        good = Page('<p>Call\n212-555-0100</p><a href="/help">Help</a>')
        self.assertEqual(provenance(contact, good), [])
        hidden = Page('<script>Call 212-555-0100</script><a href="/help">Help</a>')
        self.assertIn("quote not found", provenance(contact, hidden))
        changed = Page('<p>Call 212-555-9999</p><a href="/help">Help</a>')
        self.assertIn("phone digits not found", provenance(contact, changed))
        missing_url = Page('<p>Call 212-555-0100</p>')
        self.assertTrue(provenance(contact, missing_url))

    def test_source_fetched_once_including_failures(self):
        for result in ("<p>Contact</p>", ValueError("unavailable")):
            fetcher = Fetcher()
            kwargs = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
            with patch.object(fetcher, "policy"), patch.object(fetcher, "get", **kwargs) as get:
                first = fetcher.page("https://example.gov/contact")
                self.assertIs(fetcher.page("https://example.gov/contact"), first)
                get.assert_called_once()

    def test_redirect_target_must_pass_robots(self):
        fetcher = Fetcher()
        redirect = HTTPError("https://example.gov/contact", 302, "Found",
                             {"Location": "https://other.gov/contact"}, None)
        with patch.object(fetcher, "get", side_effect=redirect) as get, patch.object(
                fetcher, "policy", side_effect=[None, ValueError("robots disallows this path")]):
            self.assertEqual(fetcher.page("https://example.gov/contact"), "robots disallows this path")
            get.assert_called_once()

    def test_robots_redirects_are_bounded(self):
        fetcher = Fetcher()
        url = "https://example.gov/robots.txt"
        redirect = HTTPError(url, 301, "Moved", {"Location": "/robots-new.txt"}, None)
        with patch.object(fetcher, "get", side_effect=[redirect, "User-agent: *\nDisallow: /private"]):
            self.assertIn("Disallow", fetcher.robots(url))
        loop = HTTPError(url, 301, "Moved", {"Location": url}, None)
        with patch.object(fetcher, "get", side_effect=loop), self.assertRaises(ValueError):
            fetcher.robots(url)


if __name__ == "__main__":
    unittest.main()
