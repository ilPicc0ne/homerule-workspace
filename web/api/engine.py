"""Read-only I3 -> engine rows, deployed independently of Next.js by Vercel.

npm run sync refreshes the copied engine and inputs. No model, network, parcel
lookup or output writes occur here. The typed-address caller supplies null facts.
"""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

BUNDLE = Path(__file__).resolve().parent / "_homerule"
sys.path.insert(0, str(BUNDLE))
from engine import build as B, rules as R

RULES = R.load()
RULES_BY_ID = {r["id"]: r for r in RULES}
FACTS = json.loads((BUNDLE / "contracts/facts.json").read_text())["facts"]
STATES = {"CA", "NJ", "MA"}
MAX_BODY = 64 * 1024
_digest = hashlib.sha256()
for _file in sorted(BUNDLE.rglob("*")):
    if _file.suffix in (".json", ".py"):
        _digest.update(str(_file.relative_to(BUNDLE)).encode())
        _digest.update(_file.read_bytes())
ENGINE = _digest.hexdigest()


class InvalidRequest(ValueError):
    pass


def require(condition):
    if not condition:
        raise InvalidRequest("Invalid engine request")


def date(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        raise InvalidRequest("Invalid date") from None
    return value


def state_of(jid):
    while jid in R.JUR:
        if jid in STATES:
            return jid
        jid = R.JUR[jid].get("parent")
    return None


def validate(payload):
    require(isinstance(payload, dict))
    as_of = date(payload.get("as_of"))
    rec = payload.get("record")
    require(isinstance(rec, dict))
    j = rec.get("jurisdictions")
    require(isinstance(j, dict))
    state, city = j.get("state"), j.get("city")
    require(isinstance(state, str) and state in STATES)
    require(city is None or isinstance(city, str))
    if city is not None:
        require(city in R.JUR and R.JUR[city].get("level") == "city"
                and R.JUR[city].get("rules") and state_of(city) == state)

    facts, source, confidence = rec.get("facts"), rec.get("source"), rec.get("confidence")
    require(isinstance(facts, dict) and isinstance(source, dict) and isinstance(confidence, dict))
    require(source.get("jurisdiction") in ("census", "postal_city", "neighbourhood"))
    for key in ("jurisdiction", "built", "units"):
        v = confidence.get(key)
        require(type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1)
    for spec in FACTS:
        key, kind = spec["name"], spec["type"]
        v = facts.get(key)
        if v is None:
            continue
        if key == "built":
            require(isinstance(v, dict))
            require(date(v.get("from")) <= date(v.get("to")))
        elif key == "units":
            require(isinstance(v, dict) and "max" in v and type(v.get("min")) is int and 0 <= v["min"] <= 1000000)
            require(v.get("max") is None or (type(v["max"]) is int and v["min"] <= v["max"] <= 1000000))
        elif kind == "bool":
            require(type(v) is bool)
        elif kind == "enum":
            require(isinstance(v, str) and v in spec["values"])
    detail = rec.get("source_detail", {})
    require(isinstance(detail, dict))
    for key in [s["name"] for s in FACTS]:
        require(source.get(key) is None or (isinstance(source[key], str) and len(source[key]) <= 64))
        require(detail.get(key) is None or (isinstance(detail[key], str) and len(detail[key]) <= 1024))
    assumptions = rec.get("assumptions", [])
    require(isinstance(assumptions, list) and len(assumptions) <= 32
            and all(isinstance(a, str) and len(a) <= 128 for a in assumptions))
    # Only fields read by the engine; street text never reaches evaluation or logs.
    record = {"jurisdictions": {"state": state, "city": city},
              "facts": {s["name"]: facts.get(s["name"]) for s in FACTS},
              "source": source, "source_detail": detail,
              "confidence": confidence, "assumptions": assumptions}
    return as_of, record


def evaluate(payload):
    """The handler's pure entrypoint, also exercised by parity tests."""
    as_of, record = validate(payload)
    return {"as_of": as_of, "not_legal_advice": True, "engine": ENGINE,
            "results": B.evaluate_address(RULES, record, as_of, RULES_BY_ID)}


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Default access logs include the URL; use bounded metadata below.

    def respond(self, status, payload):
        body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        started = time.perf_counter()
        state = city = as_of = None
        status = 400
        try:
            require(urlsplit(self.path).path.rstrip("/") == "/api/engine")
            require(not self.headers.get("Transfer-Encoding"))
            length = self.headers.get("Content-Length", "")
            require(length.isdigit())
            length = int(length)
            if length > MAX_BODY:
                status = 413
                raise InvalidRequest("Request body too large")
            require(length > 0)
            self.connection.settimeout(3)
            raw = self.rfile.read(length)
            require(len(raw) == length)
            payload = json.loads(raw)
            as_of, record = validate(payload)
            state, city = record["jurisdictions"]["state"], record["jurisdictions"]["city"]
            status = 500  # From here, failures are in evaluation, not request validation.
            result = evaluate({"as_of": as_of, "record": record})
            status = 200
        except (InvalidRequest, ValueError, TypeError, RecursionError, TimeoutError):
            result = {"as_of": as_of, "not_legal_advice": True,
                      "error": "engine_unavailable" if status == 500 else "body_too_large" if status == 413 else "invalid_request"}
        except Exception:
            status = 500
            result = {"as_of": as_of, "not_legal_advice": True, "error": "engine_unavailable"}
        finally:
            print(json.dumps({"state": state, "city": city, "as_of": as_of,
                              "ms": round((time.perf_counter() - started) * 1000, 2),
                              "error": status != 200}), flush=True)
        self.respond(status, result)

    def do_GET(self):
        print(json.dumps({"state": None, "city": None, "as_of": None, "ms": 0, "error": True}), flush=True)
        self.respond(405, {"as_of": None, "not_legal_advice": True, "error": "method_not_allowed"})


if __name__ == "__main__":
    # Local-only companion to next dev; Vercel invokes handler directly.
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5328)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
