"""MCP eval: ask a real model (headless Claude Code) renter questions with only HomeRule's MCP connected,
record tool calls, tool-result bytes, tokens and the answer, and check the expected facts.

  python3 -m scoreboard.mcp_eval --url https://yourhomerule.com/api/mcp --label baseline
  python3 -m scoreboard.mcp_eval --url http://localhost:3075/api/mcp --label branch [--only X1-boston-to-sf]

Cases: web/tests/mcp-cases.json. Output: scoreboard/results/mcp-<label>.json (+ a summary on stdout).
Needs the `claude` CLI logged in. Each case is one fresh session; no other tools, no settings, no CLAUDE.md.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "web" / "tests" / "mcp-cases.json"
OUT = ROOT / "scoreboard" / "results"
DISTRUST = re.compile(r"prompt injection|injected instruction|embedded (tool-result )?instruction|instructions? (inside|in|within) (the )?tool result|treat .* as data|suspicious instruction", re.I)


def run_case(case: dict, mcp_config: str, model: str, cwd: str) -> dict:
    cmd = [
        "claude", "-p", case["question"],
        "--mcp-config", mcp_config, "--strict-mcp-config",
        "--tools", "", "--allowedTools", "mcp__homerule__*",
        "--output-format", "stream-json", "--verbose",
        "--model", model, "--no-session-persistence", "--setting-sources", "",
    ]
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=600)
    calls, result_bytes, texts, thinking, usage, turns = [], 0, [], [], {}, None
    for line in p.stdout.splitlines():
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        if o.get("type") == "assistant":
            for c in o["message"]["content"]:
                if c["type"] == "tool_use":
                    calls.append({"tool": c["name"].replace("mcp__homerule__", ""), "input": c["input"]})
                elif c["type"] == "text":
                    texts.append(c["text"])
                elif c["type"] == "thinking":
                    thinking.append(c.get("thinking", ""))
        elif o.get("type") == "user":
            for c in o["message"]["content"]:
                if isinstance(c, dict) and c.get("type") == "tool_result":
                    content = c.get("content")
                    if isinstance(content, list):
                        result_bytes += sum(len(x.get("text", "").encode()) for x in content if isinstance(x, dict))
                    elif isinstance(content, str):
                        result_bytes += len(content.encode())
        elif o.get("type") == "result":
            usage = o.get("usage") or {}
            turns = o.get("num_turns")
    answer = texts[-1] if texts else ""
    low = answer.lower()
    hits = [any(alt.lower() in low for alt in group) for group in case["facts"]]
    return {
        "id": case["id"],
        "question": case["question"],
        "calls": calls,
        "n_calls": len(calls),
        "tool_result_bytes": result_bytes,
        "input_tokens": (usage.get("input_tokens") or 0) + (usage.get("cache_creation_input_tokens") or 0) + (usage.get("cache_read_input_tokens") or 0),
        "output_tokens": usage.get("output_tokens"),
        "turns": turns,
        "seconds": round(time.time() - t0, 1),
        "facts_hit": sum(hits),
        "facts_total": len(hits),
        "facts_detail": hits,
        "says_not_legal_advice": "not legal advice" in low,
        "has_quote": bool(re.search(r"[\"“][^\"”]{25,}[\"”]", answer)),
        "has_date": bool(re.search(r"\b(19|20)\d\d\b", answer)),
        "distrust": bool(DISTRUST.search(answer + " ".join(thinking))),
        "answer": answer,
        "stderr": p.stderr[-500:] if p.returncode else "",
    }


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if r["answer"]]
    fh = sum(r["facts_hit"] for r in ok)
    ft = sum(r["facts_total"] for r in rows)
    return {
        "cases": len(rows),
        "answered": len(ok),
        "median_calls": statistics.median(r["n_calls"] for r in rows),
        "mean_calls": round(statistics.mean(r["n_calls"] for r in rows), 2),
        "max_calls": max(r["n_calls"] for r in rows),
        "median_result_kb": round(statistics.median(r["tool_result_bytes"] for r in rows) / 1000, 1),
        "total_result_kb": round(sum(r["tool_result_bytes"] for r in rows) / 1000, 1),
        "median_input_tokens": statistics.median(r["input_tokens"] for r in rows),
        "fact_hit_rate": round(fh / ft, 3) if ft else None,
        "all_facts_cases": sum(1 for r in rows if r["facts_hit"] == r["facts_total"]),
        "not_legal_advice": sum(r["says_not_legal_advice"] for r in rows),
        "quote": sum(r["has_quote"] for r in rows),
        "dated": sum(r["has_date"] for r in rows),
        "distrust": sum(r["distrust"] for r in rows),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--jobs", type=int, default=5)
    a = ap.parse_args()
    cases = json.loads(CASES.read_text())["cases"]
    if a.only:
        cases = [c for c in cases if c["id"] in a.only]
    tmp = tempfile.mkdtemp(prefix="mcp-eval-")
    cfg = os.path.join(tmp, "mcp.json")
    Path(cfg).write_text(json.dumps({"mcpServers": {"homerule": {"type": "http", "url": a.url}}}))
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        rows = list(ex.map(lambda c: run_case(c, cfg, a.model, tmp), cases))
    out = {"label": a.label, "url": a.url, "model": a.model, "run_at": time.strftime("%Y-%m-%d %H:%M"), "summary": summarize(rows), "rows": rows}
    OUT.mkdir(exist_ok=True)
    (OUT / f"mcp-{a.label}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    for r in rows:
        print(f"{r['id']:<22} calls={r['n_calls']:<2} kb={r['tool_result_bytes']/1000:6.1f} facts={r['facts_hit']}/{r['facts_total']} nla={int(r['says_not_legal_advice'])} q={int(r['has_quote'])} distrust={int(r['distrust'])}  {' > '.join(c['tool'] for c in r['calls'])}")
    print(json.dumps(out["summary"], indent=1))


if __name__ == "__main__":
    main()
