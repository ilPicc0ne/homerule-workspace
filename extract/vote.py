"""Majority vote over extraction samples: the model's output varies between runs, so each document is extracted
several times (out/extracted_s0, _s1, _s2: same code and prompts, different samples) and merged here into
out/extracted.

Versions of one rule across samples are matched by jurisdiction, category and effect plus overlapping quotes in the
same document (or citations where one is a prefix of the other). For every rule:
- a rule found in fewer than half of the samples is dropped (the model's one-off reading);
- the kept version is the medoid of the samples' versions by behaviour: the one whose results on all sample
  addresses at several dates differ least from the other versions (two identical versions always win).
Behaviour is computed with the same evaluator the engine uses; no test fixture or expected answer is involved.
The merged record is the first sample's, with headlines replaced by the chosen versions (quotes, gate answers and
gate start dates carried over). out/vote.json reports, per key, which samples had it and whether they agreed.
Run: python3 -m extract.vote s0 s1 s2
"""
import copy
import json
import re
import sys
from collections import defaultdict

from . import config, compile as C

DATES = ["2025-12-31", "2026-10-01", "2027-07-02", "2030-01-02"]


def _signatures(sample, addresses, facts_for, evaluate, normalise):
    rules = normalise(C.internal_rules(config.OUT / f"extracted_{sample}"))
    sig = defaultdict(list)
    for aid in sorted(addresses):
        f = facts_for(addresses[aid])
        for d in DATES:
            res = evaluate(rules, f, d)
            for r in rules:
                sig[r["id"]].append((res.get(r["id"]) or {}).get("result"))
    return rules, {k: tuple(v) for k, v in sig.items()}


def _key(r):
    return (r["jurisdiction"], r["category"], r["effect"])


def _span(sample, r):
    rec = json.load(open(config.OUT / f"extracted_{sample}" / f"{r['unit']}.json"))
    sp = rec["spans"].get(f".obligations[{r['id'].split(':')[1]}].requirement_quote")
    return (sp["doc_id"], sp["start"], sp["end"]) if sp else None


def _same(a, b):
    """Two samples' versions of one rule: overlapping quotes in the same document, or citations where one core is
    a prefix of the other (the model writes "13.76.110A" in one run and "13.76.110" in another)."""
    if a["span"] and b["span"] and a["span"][0] == b["span"][0] and \
            a["span"][1] < b["span"][2] + 200 and b["span"][1] < a["span"][2] + 200:
        return True
    ca, cb = C._core(a["citation"]), C._core(b["citation"])
    return bool(re.search(r"\d", ca)) and (ca.startswith(cb) or cb.startswith(ca))


def _reindex(d, n, m):
    """Spans / gate answers keyed by obligation index n -> m."""
    out = {}
    for k, v in d.items():
        if re.search(rf"(\[{n}\]|_{n})$|\[{n}\]\.", k):
            out[re.sub(rf"\[{n}\]", f"[{m}]", re.sub(rf"_{n}$", f"_{m}", k))] = v
    return out


def vote(samples):
    from lab.schema_experiment import evaluate as E, facts as FA
    from tests.eval_suite import normalise_dates
    addresses = FA.load()
    per, sigs = {}, {}
    for s in samples:
        per[s], sigs[s] = _signatures(s, addresses, FA.address_facts, E.evaluate, normalise_dates)
    clusters = []                           # [{sample: rule}], one per rule across samples
    for s in samples:
        for r in per[s]:
            r = {**r, "span": _span(s, r)}
            home = next((c for c in clusters if s not in c and _key(next(iter(c.values()))) == _key(r)
                         and any(_same(r, x) for x in c.values())), None)
            if home is None:
                clusters.append({s: r})
            else:
                home[s] = r
    chosen, report = defaultdict(list), []  # unit -> [(sample, obligation index)]
    for vs in sorted(clusters, key=lambda c: (_key(next(iter(c.values()))), next(iter(c.values()))["citation"])):
        first = vs[min(vs, key=samples.index)]
        entry = {"jurisdiction": first["jurisdiction"], "category": first["category"], "effect": first["effect"],
                 "citation": {s: vs[s]["citation"] for s in vs}, "samples": sorted(vs)}
        if len(vs) * 2 <= len(samples):
            entry["decision"] = "dropped: found in a minority of samples"
            report.append(entry)
            continue

        def dist(a, b):
            return sum(x != y for x, y in zip(sigs[a][vs[a]["id"]], sigs[b][vs[b]["id"]]))
        order = sorted(vs, key=lambda s: (sum(dist(s, t) for t in vs if t != s), samples.index(s)))
        win = order[0]
        agree = [t for t in vs if dist(win, t) == 0]
        entry.update({"decision": f"kept from {win}", "agreeing_samples": sorted(agree),
                      "unanimous": len(agree) == len(samples)})
        report.append(entry)
        r = vs[win]
        chosen[r["unit"]].append((win, int(r["id"].split(":")[1])))
    return chosen, report


def merge(samples, chosen):
    out_dir = config.OUT / "extracted"
    out_dir.mkdir(exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()
    units = sorted({p.stem for s in samples for p in (config.OUT / f"extracted_{s}").glob("*.json")})
    for u in units:
        recs = {s: json.load(open(config.OUT / f"extracted_{s}" / f"{u}.json")) for s in samples
                if (config.OUT / f"extracted_{s}" / f"{u}.json").exists()}
        base_s = next(s for s in samples if s in recs)
        base = copy.deepcopy(recs[base_s])
        keep = set(chosen.get(u, []))
        obs = base["luna"]["obligations"]
        for i, o in enumerate(obs):
            if o["is_headline"] and (base_s, i) not in keep:
                o["is_headline"], o["vote"] = False, "not kept by the vote"
        answers = (base.get("gate") or {}).setdefault("answers", {}) if base.get("gate") else {}
        for s, n in sorted(keep):
            if s == base_s:
                obs[n]["vote"] = f"kept from {s}"
                continue
            src = recs[s]
            o = copy.deepcopy(src["luna"]["obligations"][n])
            o["vote"] = f"kept from {s}"
            m = len(obs)
            obs.append(o)
            base["spans"].update(_reindex(src["spans"], n, m))
            answers.update(_reindex((src.get("gate") or {}).get("answers", {}), n, m))
            for e in src["luna"]["events"]:      # gate start dates scoped to this provision
                if e.get("gate") and e.get("applies_to") == o["provision"] and e not in base["luna"]["events"]:
                    base["luna"]["events"].append(e)
        base["vote"] = {"samples": samples, "base": base_s}
        (out_dir / f"{u}.json").write_text(json.dumps(base, indent=1, ensure_ascii=False))
    return units


def run(samples):
    chosen, report = vote(samples)
    units = merge(samples, chosen)
    kept = [e for e in report if e["decision"].startswith("kept")]
    summary = {"samples": samples, "units": len(units), "rule_keys": len(report), "kept": len(kept),
               "dropped_minority": len(report) - len(kept),
               "unanimous": sum(e.get("unanimous", False) for e in kept)}
    from .audit import one_per_line           # one rule per line: small diffs between builds
    (config.OUT / "vote.json").write_text(one_per_line(
        {"summary": summary, **{f"{e['jurisdiction']} | {e['category']} | {min(e['citation'].values())}": e for e in report}}))
    return summary, report


if __name__ == "__main__":
    summary, report = run(sys.argv[1:] or ["s0", "s1", "s2"])
    print(json.dumps(summary))
    for e in report:
        if not e.get("unanimous"):
            print(f"  {e['jurisdiction'][:16]:16} {e['category'][:22]:22} {str(list(e['citation'].values())[0])[:28]:28} "
                  f"in {e['samples']} -> {e['decision']}" + (f" (agree: {e.get('agreeing_samples')})" if 'agreeing_samples' in e else ""))
