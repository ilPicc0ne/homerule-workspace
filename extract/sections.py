"""Recover the legal structure of a document as nested sections with character offsets.

Offsets are Unicode code points into the full document text (header included), end-exclusive.
Enumerated labels are only recognised at the start of a line, so references such as
"paragraph (5)" inside a sentence never open a section. Text that no enumerated section
covers is split into paragraph blocks, so every substantive character belongs to some section.
"""
import re

PAREN = re.compile(r"\(([0-9]{1,3}|[a-z]{1,2}|[A-Z]{1,2}|[ivxlc]{1,6}|[IVXLC]{1,6})\)")
DOT_LOWER = re.compile(r"([a-z])\.\s+")
HEADINGS = [
    re.compile(r"(?:SECTION|Section|SEC\.|Sec\.)\s+([0-9]+[A-Za-z½]*(?:\.[0-9]+[A-Za-z]*)*)\.?"),
    re.compile(r"§+\s*([0-9][0-9.]*[A-Za-z]?)"),
    re.compile(r"([0-9]{2,6}(?:\.[0-9]+)+)\.?(?=\s+[A-Z]|\s*$)"),   # 16729.  /  13.63.010 Findings
    re.compile(r"([0-9]{1,3})\.(?=\s{2,}|\t)"),                     # NJ bills: "6.    a.  This act"
]
ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
FIRST = {"digit": "1", "lower": "a", "upper": "A", "rlower": "i", "rupper": "I", "dlower": "a"}


def roman_value(s):
    s = s.lower()
    if not s or any(ch not in ROMAN for ch in s):
        return None
    total = 0
    for a, b in zip(s, s[1:] + " "):
        v = ROMAN[a]
        total += -v if b != " " and ROMAN.get(b, 0) > v else v
    return total


def next_alpha(s):
    if s.lower() == "z" * len(s):
        return ("a" if s.islower() else "A") * (len(s) + 1)
    return s[:-1] + chr(ord(s[-1]) + 1)


def successor(kind, label):
    if kind == "digit":
        return str(int(label) + 1)
    if kind in ("rlower", "rupper"):
        nxt = roman_value(label) + 1
        out = ""
        for val, sym in ((100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
            while nxt >= val:
                out += sym
                nxt -= val
        return out if kind == "rlower" else out.upper()
    return next_alpha(label)


def classify(label, stack, roman_ahead=False):
    """Kind of a parenthesised label, resolving letter/roman ambiguity from the open levels.

    roman_ahead: the next "(ii)" / "(II)" line comes before the next letter that would follow
    this label as a letter, so an ambiguous "(i)" / "(I)" starts a roman level.
    """
    if label.isdigit():
        return "digit"
    lower = label.islower()
    alpha_kind, roman_kind = ("lower", "rlower") if lower else ("upper", "rupper")
    is_alpha = len(label) <= 2 and (len(set(label)) == 1)
    is_roman = roman_value(label) is not None
    if is_alpha and not is_roman:
        return alpha_kind
    if is_roman and not is_alpha:
        return roman_kind
    open_kinds = {e["kind"]: e for e in stack}
    if roman_kind in open_kinds and successor(roman_kind, open_kinds[roman_kind]["label"]) == label:
        return roman_kind
    if label.lower() == "i" and roman_ahead:
        return roman_kind
    if alpha_kind in open_kinds and successor(alpha_kind, open_kinds[alpha_kind]["label"]) == label:
        return alpha_kind
    if label.lower() == "i":
        return roman_kind
    return alpha_kind


def roman_lookahead(text, pos, label):
    """True if a line starting "(ii)" comes before a line starting with the letter after `label`."""
    two, nxt = ("(ii)", "(j)") if label == "i" else ("(II)", "(J)")
    a = re.search(r"^[ \t\u00a0]*" + re.escape(two), text[pos:], re.M)
    b = re.search(r"^[ \t\u00a0]*" + re.escape(nxt), text[pos:], re.M)
    return bool(a) and (not b or a.start() < b.start())


def parse_sections(text, body_start):
    sections, stack = [], []
    seen_paths = {}

    def close_to(depth, pos):
        while len(stack) > depth:
            e = stack.pop()
            sections[e["idx"]]["end"] = pos

    def open_section(kind, label, start, heading, line_end):
        parent = "/".join(e["label"] for e in stack)
        path = f"{parent}/{label}" if parent else label
        n = seen_paths.get(path, 0) + 1
        seen_paths[path] = n
        if n > 1:
            path = f"{path}#{n}"
        sections.append({"path": path, "label": label, "kind": kind, "depth": len(stack),
                         "start": start, "end": None, "heading": heading[:160]})
        stack.append({"kind": kind, "label": label, "idx": len(sections) - 1})

    pos = body_start
    for line in text[body_start:].splitlines(keepends=True):
        line_start, line_end = pos, pos + len(line)
        pos = line_end
        stripped = line.lstrip(" \t ")
        cursor = line_start + (len(line) - len(stripped))
        rest = stripped

        for h in HEADINGS:
            m = h.match(rest)
            if m and not rest[m.end():m.end() + 1] == "%":
                close_to(0, line_start)
                open_section("heading", m.group(1), cursor, rest.strip(), line_end)
                rest = rest[m.end():].lstrip(" \t ")
                cursor = line_start + (len(line) - len(rest))
                break

        while True:
            m = PAREN.match(rest)
            dot = None if m else DOT_LOWER.match(rest)
            if not m and not dot:
                break
            label = m.group(1) if m else dot.group(1)
            ahead = m is not None and label in ("i", "I") and roman_lookahead(text, line_end, label)
            kind = classify(label, stack, ahead) if m else "dlower"
            after = rest[(m or dot).end():].lstrip(" \t ")
            open_kinds = [e["kind"] for e in stack]
            if kind in open_kinds:
                prev = stack[open_kinds.index(kind)]["label"]
                in_sequence = successor(kind, prev) == label
            else:
                in_sequence = label == FIRST[kind]
            starts_like_text = bool(after) and (after[0].isupper() or after[0] in "“\"'(" or after[0].isdigit())
            if not (in_sequence or (starts_like_text and m)):
                break
            if kind in open_kinds:
                close_to(open_kinds.index(kind), line_start if cursor == line_start + (len(line) - len(stripped)) else cursor)
            open_section(kind, label, cursor, rest.strip(), line_end)
            sections[-1]["in_sequence"] = in_sequence
            consumed = (m or dot).end()
            rest = rest[consumed:].lstrip(" \t ")
            cursor = line_start + (len(line) - len(rest))
    close_to(0, len(text))
    return sections + paragraph_blocks(text, body_start, sections)


def paragraph_blocks(text, body_start, sections, max_chars=700):
    """Blocks for text not covered by any top-level enumerated section."""
    covered = sorted((s["start"], s["end"]) for s in sections if s["depth"] == 0)
    gaps, pos = [], body_start
    for a, b in covered:
        if a > pos:
            gaps.append((pos, a))
        pos = max(pos, b)
    if pos < len(text):
        gaps.append((pos, len(text)))
    blocks, n = [], 0
    for a, b in gaps:
        chunk_start, chunk_len = None, 0
        line_pos = a
        for line in text[a:b].splitlines(keepends=True):
            if line.strip():
                if chunk_start is None:
                    chunk_start = line_pos
                chunk_len += len(line)
            if chunk_start is not None and (not line.strip() or chunk_len >= max_chars):
                end = line_pos + len(line)
                n += 1
                blocks.append({"path": f"p{n}", "label": f"p{n}", "kind": "block", "depth": 0,
                               "start": chunk_start, "end": end, "heading": text[chunk_start:end].strip()[:160]})
                chunk_start, chunk_len = None, 0
            line_pos += len(line)
        if chunk_start is not None:
            n += 1
            blocks.append({"path": f"p{n}", "label": f"p{n}", "kind": "block", "depth": 0,
                           "start": chunk_start, "end": b, "heading": text[chunk_start:b].strip()[:160]})
    return blocks
