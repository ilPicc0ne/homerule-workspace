"""python -m monitor poll|watch|replay|serve. No scheduler or email service is installed."""
import argparse
import http.server
import json
import time
from pathlib import Path

from .report import write
from .run import DEFAULT_CONFIG, DEFAULT_STATE, run


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=("poll", "watch", "replay", "serve"))
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--state", type=Path, default=DEFAULT_STATE)
    p.add_argument("--as-of", help="Default: today's UTC date; never inferred from retrieval time")
    p.add_argument("--extract", action="store_true", help="Process queued snapshots with real model calls (credentials/cache required)")
    p.add_argument("--max-jobs", type=int, default=2)
    p.add_argument("--force", action="store_true", help="Bypass source polling intervals for a manual check; robots delays still apply")
    p.add_argument("--tick", type=int, default=60, help="Foreground watch tick; per-source intervals still apply")
    p.add_argument("--port", type=int, default=8766)
    a = p.parse_args()
    if not 1 <= a.max_jobs <= 10 or a.tick < 60:
        p.error("max-jobs must be 1..10 and tick at least 60 seconds")
    if a.command == "serve":
        root = a.state.resolve()
        class ReportOnly(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                name = {"/": "report.html", "/report.json": "report.json"}.get(self.path)
                if not name or not (root / name).exists():
                    self.send_error(404)
                    return
                body = (root / name).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8" if name.endswith("html") else "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
                self.end_headers()
                self.wfile.write(body)
        print(f"Monitor report: http://127.0.0.1:{a.port}/", flush=True)
        http.server.HTTPServer(("127.0.0.1", a.port), ReportOnly).serve_forever()
        return 0
    if a.command == "replay":
        from .replay import replay
        data = replay(a.state, a.extract)
    else:
        while True:
            data = run(a.config, a.state, as_of=a.as_of, process=a.extract, max_jobs=a.max_jobs,
                       force=a.force if a.command == "poll" else False)
            write(data, a.state)
            print(json.dumps({"as_of": data["as_of"], "sources": [{k: s.get(k) for k in ("id", "status", "error")} for s in data["sources"]],
                              "queued_versions": sum(e["status"] in ("pending", "failed") for e in data["events"]),
                              "observed_versions": len(data["events"]), "report": str(a.state / "report.html")}), flush=True)
            if a.command == "poll":
                break
            time.sleep(a.tick)
    return int(any(s.get("status") in ("failed", "partial", "blocked") for s in data["sources"]) or
               any(e["status"] == "failed" for e in data["events"]))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError) as e:
        raise SystemExit(str(e))
