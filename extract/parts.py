"""Split large documents into parts along their legal structure, with shared context for each part.

A part is a run of whole sections up to BUDGET characters. A section is never cut: an oversized section is
split at its subsections, and only a section with no subsections is split at blank lines or line breaks.
Each part's prompt also carries the document header, an outline, the definition sections and the sections
the part refers to, so a part can be read without the rest of the document.
"""
import re

BUDGET = 30000            # characters per part (Luna latency; Jev's 32k-token state stays far away)
CONTEXT_BUDGET = 12000    # outline + definitions + referenced sections per part


def _children(secs, s):
    """Direct children of section s (by containment and depth)."""
    return [c for c in secs if c is not s and c["kind"] != "block" and c["depth"] == s["depth"] + 1
            and s["start"] <= c["start"] < s["end"]]


def _cut(text, a, b):
    """A span with no structure left: cut at blank lines, else line breaks, into pieces within the budget."""
    out = []
    while b - a > BUDGET:
        window = text[a:a + BUDGET]
        cut = max(window.rfind("\n\n"), window.rfind("\n"))
        cut = a + (cut if cut > BUDGET // 2 else BUDGET)
        out.append((a, cut))
        a = cut
    return out + [(a, b)]


def _units(secs, s, text):
    """Pieces of section s that each fit the budget: whole if it fits, else its lead-in, subsections and gaps."""
    if s["end"] - s["start"] <= BUDGET:
        return [(s["start"], s["end"])]
    kids = sorted(_children(secs, s), key=lambda c: c["start"])
    if not kids:
        return _cut(text, s["start"], s["end"])
    out, pos = [], s["start"]
    for k in kids:
        if k["start"] > pos:
            out += _cut(text, pos, k["start"])
        out += _units(secs, k, text)
        pos = max(pos, k["end"])
    if s["end"] > pos:
        out += _cut(text, pos, s["end"])
    return out


def split(entry, text):
    """[(start, end)] spans covering the body, each at most BUDGET characters, cut only at section edges."""
    secs = entry["sections"]
    top = sorted((s for s in secs if s["depth"] == 0), key=lambda s: s["start"])
    pieces = []
    for s in top:
        pieces += _units(secs, s, text)
    pieces = [p for p in pieces if p[1] > p[0]]
    parts, cur = [], None
    for a, b in pieces:
        if cur and b - cur[0] <= BUDGET:
            cur = (cur[0], b)
        else:
            if cur:
                parts.append(cur)
            cur = (a, b)
    if cur:
        parts.append(cur)
    return parts


def outline(entry, limit=4000):
    lines = [f"{s['path']} | {' '.join(s['heading'].split())[:70]}" for s in entry["sections"]
             if s["kind"] != "block" and s["depth"] <= 1]
    out = "\n".join(lines)
    return out[:limit] + ("\n..." if len(out) > limit else "")


REF = re.compile(r"(?:Section|section|§)\s*([0-9][0-9.]*[0-9A-Za-z]?)")


def context_for(entry, text, part, labels):
    """Header, outline, definition sections and referenced sections outside the part."""
    a, b = part
    secs = entry["sections"]
    chunks = [text[:entry["body_start"]].strip(), "Outline of the whole document:\n" + outline(entry)]
    used = len(chunks[0]) + len(chunks[1])
    wanted = []
    for i, s in enumerate(secs):           # definitions, as labelled by Jev
        lab = labels.get(f"s{i}_type")
        if lab and lab["choice"] == "definition" and not (a <= s["start"] < b):
            wanted.append(s)
    for m in REF.finditer(text, a, b):    # explicit references to sections elsewhere
        target = m.group(1).rstrip(".")
        for s in secs:
            if s["kind"] == "heading" and s["label"] == target and not (a <= s["start"] < b):
                wanted.append(s)
    seen = set()
    for s in wanted:
        if s["path"] in seen:
            continue
        seen.add(s["path"])
        body = text[s["start"]:s["end"]]
        if used + len(body) > CONTEXT_BUDGET:
            continue
        chunks.append(f"[context, section {s['path']}]\n{body}")
        used += len(body)
    return "\n\n".join(chunks)
