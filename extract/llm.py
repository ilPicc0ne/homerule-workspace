"""OpenRouter client for Luna (structured chat completions) and Jev (decisions).

Every call is cached by request hash under build/cache and logged to audit/calls.jsonl.
Pass a different `run` value to force a fresh call for the same request (stability tests); EXTRACT_RUN in the
environment does the same for a whole command (make rerun).
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request

from . import config


def _post(path, body, timeout=600):
    req = urllib.request.Request(f"{config.OPENROUTER}{path}", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {config.openrouter_key()}",
                                          "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:500]
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt * 3)
                continue
            raise RuntimeError(f"{path} {e.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError):
            if attempt < 3:
                time.sleep(2 ** attempt * 3)
                continue
            raise


def _cached(kind, body, run, stage, ref, call):
    run = os.environ.get("EXTRACT_RUN") or run
    digest = hashlib.sha256((json.dumps(body, sort_keys=True) + f"|run={run}").encode()).hexdigest()
    path = config.CACHE / kind / f"{digest}.json"
    if path.exists():
        return json.loads(path.read_text())
    t0 = time.time()
    resp = call()
    elapsed = round(time.time() - t0, 2)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(resp, ensure_ascii=False))
    config.AUDIT.mkdir(exist_ok=True)
    usage = resp.get("usage", {})
    with open(config.AUDIT / "calls.jsonl", "a") as f:
        f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "kind": kind, "stage": stage,
                            "ref": ref, "model": resp.get("model"), "request_hash": digest, "seconds": elapsed,
                            "cost": usage.get("cost"), "usage": usage}) + "\n")
    return resp


FALLBACK_LUNA = "openai/gpt-5.6-luna"


def luna(messages, schema, name, stage, ref, run=0, max_tokens=32000, reasoning="medium", model=None):
    try:
        return _luna(messages, schema, name, stage, ref, run, max_tokens, reasoning, model or config.LUNA)
    except RuntimeError as e:
        if "content_filter" in str(e) and (model or config.LUNA) != FALLBACK_LUNA:
            return _luna(messages, schema, name, stage + "_fallback_model", ref, run, max_tokens, reasoning, FALLBACK_LUNA)
        raise


def _luna(messages, schema, name, stage, ref, run, max_tokens, reasoning, model):
    body = {"model": model, "messages": messages, "max_tokens": max_tokens,
            "reasoning": {"effort": reasoning},
            "response_format": {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}}}
    resp = _cached("luna", body, run, stage, ref, lambda: _post("/v1/chat/completions", body))
    choice = resp["choices"][0]
    if choice.get("finish_reason") not in ("stop", None):
        raise RuntimeError(f"Luna stopped with {choice.get('finish_reason')} on {ref}")
    return json.loads(choice["message"]["content"]), resp.get("usage", {})


JEV_MAX = 130000     # characters of state Jev accepts (its limit is ~135k); every caller passes full context through fit()


def fit(text, at=None):
    """Full context for Jev: the whole text when it fits, else a JEV_MAX window centred on position `at` (the
    provision asked about) or, without one, the start and end of the text."""
    if len(text) <= JEV_MAX:
        return text
    if at is None:
        return text[:JEV_MAX // 2] + "\n...\n" + text[-JEV_MAX // 2:]
    a = max(0, min(at - JEV_MAX // 2, len(text) - JEV_MAX))
    return text[a:a + JEV_MAX]


def jev(state, questions, stage, ref, run=0):
    body = {"model": config.JEV, "state": state, "questions": questions}
    resp = _cached("jev", body, run, stage, ref, lambda: _post("/alpha/decisions", body))
    return resp["answers"], resp.get("usage", {})
