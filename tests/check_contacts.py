#!/usr/bin/env python3
"""Validate the contact contract and its 78 fallback routes.

Default: one GET per unique source URL (and per-host robots policy), no crawl.
--offline checks structure/coverage only; it never reports provenance as passed.
Quotes match visible HTML text after entity decoding and whitespace folding only.
URLs must occur in the source's text, href, canonical, or og:url metadata
(relative hrefs are resolved against the source URL).
No JS, CAPTCHA bypass, retries, credentials, or phone calls. Failures are reported,
not removed. This checks published evidence, not whether a hotline answers.
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = (
    "rent_increase_limits", "just_cause_eviction", "security_deposits",
    "application_screening_fees", "screening_restrictions", "algorithmic_rent_setting",
)
KINDS = {"rent_board", "housing_department", "civil_rights_agency", "tenant_hotline",
         "legal_aid", "consumer_protection", "court_self_help"}
REQUIRED = {"name", "kind", "what_for", "url", "phone", "phone_display", "eligibility",
            "source_url", "source_quote", "retrieved_at"}
UA = "HomeRuleContactCheck/1.0"


def folded(text):
    return " ".join(text.split())


def phone_digits(text):
    return re.sub(r"\D", "", text)


def http_url(value):
    if not isinstance(value, str):
        return False
    p = urlsplit(value)
    return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.parts, self.urls, self.skip = [], set(), 0
        self.feed(html)
        self.text = folded("".join(self.parts))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style", "noscript"}:
            self.skip += 1
        if tag in {"a", "link"} and attrs.get("href"):
            self.urls.add(attrs["href"])
        if tag == "meta" and attrs.get("property") == "og:url":
            self.urls.add(attrs.get("content", ""))
        if not self.skip:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"}:
            self.skip = max(0, self.skip - 1)
        if not self.skip:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def resolve(entries, jurisdictions, jurisdiction, category):
    """Skip display-only counties when locating the state ancestor."""
    candidates = [(jurisdiction, category), (jurisdiction, "*")]
    current, seen = jurisdiction, set()
    while current and current not in seen:
        seen.add(current)
        node = jurisdictions[current]
        if node["level"] == "state":
            candidates += [(current, category), (current, "*")]
            break
        current = node.get("parent")
    return next((entries[key] for key in candidates if key in entries), None)


def validate(data, jurisdictions):
    errors, entries = [], {}
    if not isinstance(data, dict) or not isinstance(data.get("_comment"), str) or not isinstance(data.get("entries"), list):
        return ["Expected _comment string and entries array"], {}
    for n, entry in enumerate(data["entries"]):
        label = "entry %d" % n
        if not isinstance(entry, dict) or set(entry) != {"jurisdiction", "category", "contacts"}:
            errors.append(label + ": expected jurisdiction, category, contacts")
            continue
        j, cat = entry["jurisdiction"], entry["category"]
        if not isinstance(j, str) or j not in jurisdictions or not jurisdictions[j].get("rules"):
            errors.append(label + ": unknown or display-only jurisdiction")
            continue
        if not isinstance(cat, str) or cat not in (*CATEGORIES, "*"):
            errors.append(label + ": unknown category")
            continue
        key = (j, cat)
        if key in entries:
            errors.append(label + ": duplicate jurisdiction/category")
        entries[key] = entry
        contacts = entry["contacts"]
        if not isinstance(contacts, list) or not 1 <= len(contacts) <= 3:
            errors.append(label + ": need 1-3 contacts")
            continue
        for i, contact in enumerate(contacts):
            at = "%s/%s contact %d" % (j, cat, i)
            if not isinstance(contact, dict) or REQUIRED - set(contact):
                errors.append(at + ": missing required fields")
                continue
            if set(contact) - REQUIRED - {"hours"}:
                errors.append(at + ": unexpected fields")
            for field in REQUIRED - {"eligibility"}:
                if not isinstance(contact[field], str) or not contact[field].strip():
                    errors.append(at + ": invalid " + field)
            if any(not isinstance(contact[k], str) for k in REQUIRED - {"eligibility"}):
                continue
            if contact["kind"] not in KINDS:
                errors.append(at + ": invalid kind")
            if not re.fullmatch(r"\+1[2-9]\d{2}[2-9]\d{6}", contact["phone"]):
                errors.append(at + ": phone must be US E.164")
            # Extensions remain in phone_display; the dialable E.164 field is the base.
            display_base = re.split(r"(?:ext\.?|x)\s*\d+", contact["phone_display"], flags=re.I)[0]
            display_digits = phone_digits(display_base)
            if display_digits not in {contact["phone"][1:], contact["phone"][2:]}:
                errors.append(at + ": phone/display mismatch")
            if folded(contact["phone_display"]) not in folded(contact["source_quote"]):
                errors.append(at + ": source_quote must contain published phone_display")
            if not all(http_url(contact[k]) for k in ("url", "source_url")):
                errors.append(at + ": URLs must be public HTTPS URLs")
            for field in ("eligibility", "hours"):
                if contact.get(field) is not None and (not isinstance(contact[field], str) or not contact[field].strip()):
                    errors.append(at + ": invalid " + field)
            try:
                day = dt.date.fromisoformat(contact["retrieved_at"])
                if day.isoformat() != contact["retrieved_at"] or day > dt.datetime.now(dt.timezone.utc).date():
                    raise ValueError()
            except ValueError:
                errors.append(at + ": invalid/future retrieval date")
    for j, node in jurisdictions.items():
        if node["level"] == "state" and node.get("rules") and (j, "*") not in entries:
            errors.append(j + ": missing state wildcard")
    return errors, entries


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Fetcher:
    """Bounded, cached requests. Check robots before following source redirects."""
    def __init__(self, timeout=15):
        self.timeout, self.policies, self.pages, self.last = timeout, {}, {}, {}
        self.opener = build_opener(NoRedirect())

    def get(self, url):
        with self.opener.open(Request(url, headers={"User-Agent": UA}), timeout=self.timeout) as response:
            if "text/" not in response.headers.get("Content-Type", ""):
                raise ValueError("non-text response")
            raw = response.read(5_000_001)
            if len(raw) > 5_000_000:
                raise ValueError("response exceeds 5 MB limit")
            return raw.decode(response.headers.get_content_charset() or "utf-8", errors="replace")

    def policy(self, url):
        p = urlsplit(url)
        origin = "%s://%s" % (p.scheme, p.netloc)
        if origin not in self.policies:
            policy = RobotFileParser()
            try:
                policy.parse(self.robots(origin + "/robots.txt").splitlines())
                self.policies[origin] = policy
            except HTTPError as exc:
                if exc.code in (404, 410):
                    policy.parse([])
                    self.policies[origin] = policy
                else:
                    self.policies[origin] = "robots unavailable: HTTP %s" % exc.code
            except Exception as exc:
                self.policies[origin] = "robots unavailable: " + str(exc)
        policy = self.policies[origin]
        if isinstance(policy, str):
            raise ValueError(policy)
        if not policy.can_fetch(UA, url):
            raise ValueError("robots disallows this path")
        delay = max(policy.crawl_delay(UA) or 0, 1)
        rate = policy.request_rate(UA)
        if rate:
            delay = max(delay, rate.seconds / rate.requests)
        if delay > 60:
            raise ValueError("robots delay exceeds bounded checker; manual review required")
        time.sleep(max(0, delay - (time.monotonic() - self.last.get(origin, 0))))
        self.last[origin] = time.monotonic()

    def robots(self, url, chain=()):
        """Follow bounded robots redirects; source redirects still need policy checks."""
        if not http_url(url) or url in chain or len(chain) >= 5:
            raise ValueError("invalid robots redirect chain")
        try:
            return self.get(url)
        except HTTPError as exc:
            if exc.code not in (301, 302, 303, 307, 308) or not exc.headers.get("Location"):
                raise
            return self.robots(urljoin(url, exc.headers["Location"]), (*chain, url))

    def page(self, url, chain=()):
        if url in self.pages:
            return self.pages[url]
        try:
            if not http_url(url) or url in chain or len(chain) >= 5:
                raise ValueError("invalid URL or redirect chain")
            self.policy(url)
            try:
                result = Page(self.get(url))
            except HTTPError as exc:
                if exc.code not in (301, 302, 303, 307, 308) or not exc.headers.get("Location"):
                    raise
                result = self.page(urljoin(url, exc.headers["Location"]), (*chain, url))
        except Exception as exc:
            result = str(exc)
        self.pages[url] = result
        return result


def provenance(contact, page):
    if isinstance(page, str):
        return [page]
    errors = []
    if folded(contact["source_quote"]) not in page.text:
        errors.append("quote not found")
    if folded(contact["phone_display"]) not in page.text:
        errors.append("published phone not found")
    if contact["phone"][2:] not in phone_digits(page.text):
        errors.append("phone digits not found")
    urls = {urljoin(contact["source_url"], url) for url in page.urls}
    if contact["url"] not in urls and contact["url"] not in page.text:
        errors.append("exact contact URL not found in text/link/canonical/og:url")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--contacts", type=Path, default=ROOT / "contracts/contacts.json")
    parser.add_argument("--timeout", type=float, default=15)
    args = parser.parse_args()
    try:
        data = json.loads(args.contacts.read_text())
        js = json.loads((ROOT / "contracts/jurisdictions.json").read_text())["jurisdictions"]
        jurisdictions = {j["id"]: j for j in js}
        errors, entries = validate(data, jurisdictions)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print("FAIL loading contract:", exc)
        return 1
    for error in errors:
        print("FAIL schema:", error)
    if errors:
        return 1
    covered = 0
    for j in js:
        if not j.get("rules"):
            continue
        for category in CATEGORIES:
            match = resolve(entries, jurisdictions, j["id"], category)
            if match:
                covered += 1
            else:
                errors.append("uncovered %s/%s" % (j["id"], category))
    print("Schema: PASS; coverage: %d/78" % covered)
    if covered != 78:
        errors.append("expected exactly 13 rule-bearing jurisdictions x 6 topics")
    if args.offline:
        print("Provenance: NOT RUN (--offline)")
    else:
        fetcher, seen, total = Fetcher(args.timeout), set(), 0
        print("Result | Contact | Source | Detail")
        for entry in entries.values():
            for contact in entry["contacts"]:
                identity = tuple(contact[k] for k in ("source_url", "url", "phone", "phone_display", "source_quote"))
                if identity in seen:
                    continue
                seen.add(identity)
                failures = provenance(contact, fetcher.page(contact["source_url"]))
                total += bool(failures)
                print("%s | %s | %s | %s" % ("FAIL" if failures else "PASS", contact["name"], contact["source_url"], "; ".join(failures) or "phone, quote, URL verified"), flush=True)
        print("Provenance: %d/%d contacts passed" % (len(seen) - total, len(seen)))
        if total:
            errors.append("%d provenance failures (entries retained)" % total)
    for error in errors:
        print("FAIL:", error)
    return int(bool(errors))


if __name__ == "__main__":
    sys.exit(main())
