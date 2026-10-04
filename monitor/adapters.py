"""Finite discovery plus exact-source revisits; no recursive web crawl."""
import copy
import datetime as dt
import json
import re
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urljoin

from .http import permitted


class Visible(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.stack = [], [], []
        self.feed(html)
        self.text = "\n".join(s.strip() for s in "".join(self.parts).splitlines() if s.strip())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self.stack.append(tag)
        if not self.stack:
            if tag == "a" and attrs.get("href"):
                self.links.append(attrs["href"])
            if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "section", "tr"):
                self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.stack and tag == self.stack[-1]:
            self.stack.pop()
        if not self.stack and tag in ("p", "div", "li", "section", "tr"):
            self.parts.append("\n")

    def handle_data(self, text):
        if not self.stack:
            self.parts.append(text)


def text_of(body, kind):
    if kind == "application/pdf":
        with tempfile.TemporaryDirectory(prefix="monitor-pdf-") as tmp:
            p = Path(tmp) / "source.pdf"
            p.write_bytes(body)
            result = subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, timeout=30, check=True)
            text = result.stdout.decode("utf-8", errors="strict")
    elif kind in ("text/html", "application/xhtml+xml"):
        text = Visible(body.decode("utf-8", errors="strict")).text
    elif kind == "text/plain":
        text = body.decode("utf-8", errors="strict")
    else:
        raise ValueError("Unsupported document content type: " + kind)
    if len(text.strip()) < 80:
        raise ValueError("Empty/short source: JS, scanned PDF or removed content requires review")
    if "\ufffd" in text:
        raise ValueError("Replacement characters in source; preserve raw response and review encoding")
    return text.strip()


def legistar(source, state, client, now):
    """Discovery cursor advances only after a complete bounded pass; known matters revisited."""
    base = source["base_url"]
    window = copy.deepcopy(state.get("discovery_window"))
    if not window:
        start = dt.datetime.fromisoformat(state.get("watermark") or now) - dt.timedelta(
            days=1 if state.get("watermark") else source["lookback_days"])
        window = {"start": start.replace(tzinfo=None).isoformat(timespec="seconds"),
                  "end": dt.datetime.fromisoformat(now).replace(tzinfo=None).isoformat(timespec="seconds"),
                  "started_at": now, "cursor": None}
    known = set(source.get("known_matters", [])) | set(state.get("known_matters", []))
    found, complete = set(), False
    for page in range(source["max_pages"]):
        condition = f"MatterLastModifiedUtc ge datetime'{window['start']}' and MatterLastModifiedUtc le datetime'{window['end']}'"
        if window["cursor"]:
            modified, mid = window["cursor"]
            condition += (f" and (MatterLastModifiedUtc gt datetime'{modified}' or "
                          f"(MatterLastModifiedUtc eq datetime'{modified}' and MatterId gt {mid}))")
        query = urlencode({"$filter": condition, "$orderby": "MatterLastModifiedUtc asc,MatterId asc",
                           "$top": source["page_size"]})
        rows = client.json(base + "?" + query)
        if not isinstance(rows, list):
            raise ValueError("Legistar returned a non-list index")
        for row in rows:
            if (row.get("MatterTypeName") or "").lower() != "ordinance":
                continue
            title = (row.get("MatterTitle") or "").lower()
            if any(re.search(r"\b" + re.escape(term) + r"\w*", title) for term in source["title_terms"]):
                found.add(int(row["MatterId"]))
        if rows:
            cursor = [rows[-1]["MatterLastModifiedUtc"], int(rows[-1]["MatterId"])]
            # Reject an endpoint ignoring our cursor rather than repeatedly fetching the same page.
            if window["cursor"] and tuple(cursor) <= tuple(window["cursor"]):
                raise ValueError("Discovery cursor did not advance")
            window["cursor"] = cursor
        if len(rows) < source["page_size"]:
            complete = True
            break
    # Round-robin known records; pending discoveries have priority but never disappear on failure.
    pending = set(state.get("pending_matters", [])) | (found - known)
    known |= found
    last = state.get("last_matter_check", {})
    selected = sorted(known, key=lambda mid: (last.get(str(mid), ""), mid not in pending, mid))[:source["max_documents"]]
    docs, errors = [], []
    for mid in selected:
        try:
            meta = client.json(f"{base}/{mid}")
            versions = client.json(f"{base}/{mid}/versions")
            if not versions:
                raise ValueError("Matter has no text versions")
            version = max(versions, key=lambda v: int(v["Key"]))
            url = f"{base}/{mid}/texts/{int(version['Key'])}"
            record = client.json(url)
            text = record.get("MatterTextPlain")
            if not isinstance(text, str) or len(text.strip()) < 80:
                raise ValueError("Missing/short MatterTextPlain")
            if "\ufffd" in text:
                raise ValueError("Matter text has replacement characters; review original RTF")
            content = (f"File: {meta['MatterFile']}\nTitle: {meta['MatterTitle']}\n"
                       f"Legislative status: {meta['MatterStatusName']}\nVersion: {version['Value']}\n\n{text.strip()}")
            docs.append((f"{source['id']}:{mid}", content, {"url": url, "title": meta["MatterTitle"],
                         "matter_id": mid, "legislative_status": meta["MatterStatusName"],
                         "publisher_modified_at": meta.get("MatterLastModifiedUtc"),
                         "baseline_units": source.get("baseline_units", {}).get(str(mid), [])}))
            last[str(mid)] = now
            pending.discard(mid)
        except Exception as e:
            errors.append(f"Matter {mid}: {e}")
            # Failed matter rotates to the back so one failure cannot starve the rest.
            last[str(mid)] = now
    state.update(known_matters=sorted(known), pending_matters=sorted(pending), last_matter_check=last)
    if pending:
        errors.append(f"{len(pending)} discovered matter(s) await a successful text fetch")
    if complete:
        state["watermark"] = window["started_at"]
        state.pop("discovery_window", None)
    else:
        state["discovery_window"] = window
        errors.append("Discovery page limit reached; cursor saved for next run (coverage incomplete)")
    return docs, errors


def document(source, state, client, now):
    urls = set(source.get("urls", [])) | set(state.get("known_urls", []))
    errors = []
    if source.get("index_url"):
        try:
            body, kind = client.get(source["index_url"])
            if kind != "text/html":
                raise ValueError("Discovery index must be HTML")
            for link in Visible(body.decode("utf-8")).links:
                url = urljoin(source["index_url"], link).split("#")[0]
                if permitted(url, source["scopes"]) and re.search(source["link_pattern"], url):
                    urls.add(url)
        except Exception as e:
            errors.append(f"Discovery index: {e}")
    state["known_urls"] = sorted(urls)
    last = state.get("last_url_check", {})
    selected = sorted(urls, key=lambda url: (last.get(url, ""), url))[:source["max_documents"]]
    docs = []
    for url in selected:
        try:
            body, kind = client.get(url)
            docs.append((source["id"] + ":" + url, text_of(body, kind), {"url": url, "title": source["id"], "baseline_units": []}))
        except Exception as e:
            errors.append(f"{url}: {e}")
        last[url] = now
    state["last_url_check"] = last
    return docs, errors
