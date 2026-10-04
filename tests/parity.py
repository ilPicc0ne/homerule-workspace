"""Engine = eval: the evaluator gives the same result per address and rule from the internal records (what
make eval uses) and from the committed interface files through the engine's adapter (what make build uses).

Skips with a note while the engine adapter (engine/rules.py) is not on this branch. Exit 1 on any difference.
Run: python3 -m tests.parity [--as-of 2026-10-01]
"""
import importlib.util
import sys
from collections import Counter

from extract import compile as C, config
from lab.schema_experiment import evaluate as E, facts as FA
from tests import eval_suite as T


def run(as_of="2026-10-01"):
    if importlib.util.find_spec("engine.rules") is None:
        print("parity: skipped (engine/rules.py not on this branch)")
        return 0
    from engine import rules as A
    internal = [r for r in C.internal_rules() if r["origin"] in ("starter", "supplemental")]
    idmap = {r["id"]: c["team_rule_id"] for r, c in zip(internal, (C.compiled(r) for r in internal))}
    internal = T.normalise_dates(internal)
    eng = A.load()
    diff, example = Counter(), {}
    for aid, row in FA.load().items():
        f = FA.address_facts(row)
        a = {idmap[k]: v.get("result") for k, v in E.evaluate(internal, f, as_of).items()}
        b = {k: v.get("result") for k, v in E.evaluate(eng, f, as_of).items()}
        for k in set(a) | set(b):
            if a.get(k) != b.get(k):
                diff[(k, a.get(k), b.get(k))] += 1
                example.setdefault((k, a.get(k), b.get(k)), aid)
    print(f"parity at {as_of}: {sum(diff.values())} differences between eval and engine inputs")
    for k, n in diff.most_common(20):
        print(f"  {n} x {k[0]}: eval {k[1]} / engine {k[2]} (e.g. {example[k]})")
    return 1 if diff else 0


if __name__ == "__main__":
    as_of = sys.argv[sys.argv.index("--as-of") + 1] if "--as-of" in sys.argv else "2026-10-01"
    sys.exit(run(as_of))
