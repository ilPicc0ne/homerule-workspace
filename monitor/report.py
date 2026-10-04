"""Escaped, dependency-free operator view of source freshness and candidate impacts."""
import html
import json
from pathlib import Path


def render(data):
    esc = lambda v: html.escape(str(v if v is not None else "Never"))
    rows = "".join(f'<tr><td>{esc(s["id"])}</td><td>{esc(s.get("status", "not checked"))}</td>'
                   f'<td>{esc(s.get("last_attempt"))}</td><td>{esc(s.get("last_success"))}</td>'
                   f'<td>{esc(s.get("error") or "No fetch error")}</td></tr>' for s in data["sources"])
    events = []
    for e in reversed(data["events"]):
        report = json.loads(e["report"]) if e.get("report") else None
        inner = f'<p>{esc(e.get("error") or "")}</p>'
        if report:
            inner += '<p>' + esc(" ".join(report["review_reasons"] + report["issues"])) + '</p>'
            for impact in report["impacts"]:
                inner += f'<h3>As of {esc(impact["after_as_of"])}: {len(impact["affected_address_ids"])} addresses differ</h3>'
                inner += '<details><summary>Address evidence: previous → candidate</summary><pre>' + esc(json.dumps(impact["addresses"], indent=2, ensure_ascii=False)) + '</pre></details>'
            inner += '<details><summary>Document changes</summary><pre>' + esc(report["text_diff"]) + '</pre></details>'
        events.append(f'<article><h2>{esc(e["document"])}</h2><p>{esc(e["status"])} · observed {esc(e["created_at"])}</p>{inner}</article>')
    clock = esc(json.dumps(data.get("clock"), indent=2, ensure_ascii=False))
    return f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>HomeRule source monitor</title><style>
body{{font:16px system-ui;max-width:1150px;margin:40px auto;padding:0 24px;background:#f4f5f0;color:#172d2a}}
h1{{font-size:36px}}table{{width:100%;border-collapse:collapse}}td,th{{text-align:left;padding:12px;border-bottom:1px solid #ccd4cb}}
article{{background:white;border:1px solid #ccd4cb;border-radius:12px;padding:20px;margin:20px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;max-height:450px;overflow:auto;font-size:13px}}
small{{color:#465c56}}summary{{cursor:pointer;padding:12px 0}}.note{{padding:16px;background:#e1eadc;border-radius:8px}}
</style><h1>HomeRule source monitor</h1><p>As of {esc(data["as_of"])} · Not legal advice</p>
<p class="note">{esc(data["note"])}</p><small>Generated {esc(data["generated_at"])}. Reload after a polling cycle. A successful fetch does not prove complete legal coverage.</small>
<h2>Source freshness</h2><table><tr><th>Source</th><th>Status</th><th>Last attempted</th><th>Last successful pass</th><th>Limits / errors</th></tr>{rows}</table>
<h2>Observed versions and impact previews</h2>{''.join(events) or '<p>No new versions observed.</p>'}
<details><summary>Effective-date changes in accepted rules</summary><pre>{clock}</pre></details></html>'''


def write(data, root):
    root = Path(root)
    for name, content in (("report.html", render(data)), ("report.json", json.dumps(data, indent=2, ensure_ascii=False))):
        temp = root / (name + ".tmp")
        temp.write_text(content, encoding="utf-8")
        temp.replace(root / name)
