"""HTTPS GET only: reviewed route allowlist, robots, bounded bodies and redirects."""
import datetime as dt
from email.utils import parsedate_to_datetime
import ipaddress
import json
import socket
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

from .store import stamp

UA = "HomeRuleSourceMonitor/0.1 (+https://github.com/ilPicc0ne/homerule-workspace)"
LIMIT = 4_000_000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def public_url(url):
    p = urlsplit(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError("Only public HTTPS URLs on port 443 are permitted")
    if p.fragment or "\\" in url or any(ord(c) < 32 for c in url):
        raise ValueError("Invalid URL")
    addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Non-public destination refused")
    return p


def permitted(url, scopes):
    p = urlsplit(url)
    path = unquote(p.path)
    if any(x in (".", "..") for x in path.split("/")) or "\\" in path:
        return False
    return any(p.scheme == "https" and p.netloc == s["host"] and
               (path == s["path"] or (s.get("prefix", False) and path.startswith(s["path"].rstrip("/") + "/")))
               for s in scopes)


class Client:
    def __init__(self, store, scopes, max_requests=80, timeout=20):
        self.store, self.scopes = store, scopes
        self.max_requests, self.timeout = max_requests, timeout
        self.count, self.policies, self.last = 0, {}, {}
        self.opener = build_opener(NoRedirect())

    def _get(self, url, headers=None):
        public_url(url)
        if self.count >= self.max_requests:
            raise RuntimeError("Request budget exhausted; remaining work retries next run")
        self.count += 1
        req = Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity", **(headers or {})})
        try:
            r = self.opener.open(req, timeout=self.timeout)
        except HTTPError as e:
            r = e
        with r:
            if r.status not in (200, 304):
                return r.status, {k.lower(): v for k, v in r.headers.items()}, b""
            body = r.read(LIMIT + 1)
            if len(body) > LIMIT:
                raise ValueError("Response exceeds 4 MB")
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body

    def retry_after(self, url, code, hdr):
        if code in (429, 503):
            origin = urlsplit(url).netloc
            retry = hdr.get("Retry-After", hdr.get("retry-after", "3600"))
            now = dt.datetime.now(dt.timezone.utc)
            try:
                until = now + dt.timedelta(seconds=max(60, int(retry))) if retry.isdigit() else parsedate_to_datetime(retry)
                if until.tzinfo is None:
                    until = until.replace(tzinfo=dt.timezone.utc)
                until = max(until, now + dt.timedelta(seconds=60))
            except (ValueError, TypeError, OverflowError):
                until = now + dt.timedelta(hours=1)
            self.store.put("backoff:" + origin, until.isoformat())

    def robots(self, url):
        p = urlsplit(url)
        origin = f"https://{p.netloc}"
        if origin not in self.policies:
            target, seen = origin + "/robots.txt", set()
            for _ in range(4):
                if target in seen or urlsplit(target).netloc != p.netloc:
                    raise ValueError("Unsupported robots redirect; review required")
                seen.add(target)
                code, headers, body = self._get(target)
                self.retry_after(target, code, headers)
                if code in (301, 302, 303, 307, 308):
                    target = urljoin(target, headers.get("Location", headers.get("location", "")))
                    continue
                if code not in (200, 404, 410):
                    raise ValueError(f"Robots policy unavailable: HTTP {code}")
                policy = RobotFileParser()
                policy.parse(body.decode("utf-8", errors="replace").splitlines() if code == 200 else [])
                self.policies[origin] = policy
                break
            else:
                raise ValueError("Too many robots redirects")
        policy = self.policies[origin]
        if not policy.can_fetch(UA, url):
            raise ValueError("Robots disallows source path")
        delay = max(1, policy.crawl_delay(UA) or 0)
        rate = policy.request_rate(UA)
        if rate:
            delay = max(delay, rate.seconds / rate.requests)
        if delay > 60:
            raise ValueError("Robots delay exceeds worker bound; manual scheduling required")
        time.sleep(max(0, delay - (time.monotonic() - self.last.get(origin, 0))))
        self.last[origin] = time.monotonic()

    def get(self, url, chain=()):
        if not permitted(url, self.scopes) or url in chain or len(chain) >= 4:
            raise ValueError("URL outside reviewed routes or redirect loop")
        origin = urlsplit(url).netloc
        until = self.store.get("backoff:" + origin)
        if until and dt.datetime.now(dt.timezone.utc) < dt.datetime.fromisoformat(until):
            raise RuntimeError("Server Retry-After active until " + until)
        self.robots(url)
        cached = self.store.get("http:" + url, {})
        headers = {}
        if cached.get("etag"):
            headers["If-None-Match"] = cached["etag"]
        if cached.get("modified"):
            headers["If-Modified-Since"] = cached["modified"]
        code, hdr, body = self._get(url, headers)
        if code in (301, 302, 303, 307, 308):
            return self.get(urljoin(url, hdr.get("Location", hdr.get("location", ""))), (*chain, url))
        if code == 304:
            if not cached.get("raw"):
                raise ValueError("304 without a stored response")
            return (self.store.root / "raw" / cached["raw"]).read_bytes(), cached["type"]
        self.retry_after(url, code, hdr)
        if code != 200:
            # Do not retry 429/403 in a tight loop or replace the last successful snapshot.
            raise RuntimeError(f"HTTP {code}; source not refreshed")
        content_type = hdr.get("content-type", "").split(";")[0].lower()
        raw = self.store.raw(body)
        self.store.put("http:" + url, {"etag": hdr.get("etag"), "modified": hdr.get("last-modified"),
                                      "raw": raw, "type": content_type, "checked_at": stamp()})
        return body, content_type

    def json(self, url):
        body, kind = self.get(url)
        if kind not in ("application/json", "text/json"):
            raise ValueError("Expected API JSON, received " + kind)
        return json.loads(body.decode("utf-8"))
