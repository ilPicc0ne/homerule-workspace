"""Renter impact: rule direction, strength and kind (layer 1) and the better/worse verdict of changes (layer 2)
against tests/fixtures/impact.yaml (expected answers written from the law texts before the code)."""
import json
import unittest
from pathlib import Path

import yaml

from engine import build as B, diff as D, facts as F, rules as R

ROOT = Path(__file__).resolve().parent.parent
FX = yaml.safe_load((ROOT / "tests" / "fixtures" / "impact.yaml").read_text(encoding="utf-8"))


class Rules(unittest.TestCase):
    def test_rules(self):
        comps = {c["team_rule_id"]: c for c in json.loads((ROOT / "out" / "rules.compiled.json").read_text())}
        for f in FX["rules"]:
            with self.subTest(rule=f["id"]):
                ri = comps[f["id"]]["renter_impact"]
                self.assertEqual(ri["direction"], f["direction"])
                if "strength" in f:
                    self.assertAlmostEqual(ri["strength"]["value"], f["strength"])
                if "kind" in f:
                    self.assertEqual(ri["kind"], f["kind"])


class Changes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = R.load()
        cls.by_id = {r["id"]: r for r in cls.rules}
        cls.addresses = F.load()

    def test_changes(self):
        for f in FX["changes"]:
            with self.subTest(change=f["id"]):
                one = {f["address"]: self.addresses[f["address"]]}
                before = B.build_lookups(self.rules, one, f["before"])
                after = B.build_lookups(self.rules, one, f["after"])
                ch = D.diff_lookups(before, after, self.by_id).get(f["address"], [])
                if "rule" in f:
                    got = [c["renter_impact"]["verdict"] for c in ch if c["team_rule_id"] == f["rule"]]
                else:
                    got = sorted({c["renter_impact"]["verdict"] for c in ch
                                  if self.by_id[c["team_rule_id"]]["category"] == f["category"]})
                self.assertEqual(got, [f["expect"]], f"{f['why']}: {ch and [(c['team_rule_id'], c['change'], c['renter_impact']) for c in ch]}")


if __name__ == "__main__":
    unittest.main()
