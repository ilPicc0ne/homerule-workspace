"""Renter impact: rule direction, strength and kind (layer 1) and the better/worse verdict of changes (layer 2)
against tests/fixtures/impact.yaml (expected answers written from the law texts before the code)."""
import json
import unittest
from pathlib import Path

import yaml

from engine import build as B, diff as D, facts as F, rules as R, score as S

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
                    whys = [c["renter_impact"]["why"] for c in ch if c["team_rule_id"] == f["rule"]]
                    self.assertEqual(whys, [f["expect_why"]], f["why"])
                else:
                    got = sorted({c["renter_impact"]["verdict"] for c in ch
                                  if self.by_id[c["team_rule_id"]]["category"] == f["category"]})
                    whys = sorted({c["renter_impact"]["why"] for c in ch
                                   if self.by_id[c["team_rule_id"]]["category"] == f["category"]})
                    self.assertEqual(whys, [f["expect_why"]], f["why"])
                self.assertEqual(got, [f["expect"]], f"{f['why']}: {ch and [(c['team_rule_id'], c['change'], c['renter_impact']) for c in ch]}")


class Scores(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = S.build(sorted({f["date"] for f in FX["scores"]} | set(S.CFG["dates"])))

    def test_fixture(self):
        for f in FX["scores"]:
            with self.subTest(address=f["address"], date=f["date"]):
                got = self.res["addresses"][f["address"]][f["date"]]
                self.assertEqual((got["score"], got["high"], got["unknown_topics"]),
                                 (f["score"], f["high"], f["unknown"]), f["why"])

    def test_open_questions(self):
        for f in FX["open_questions"]:
            with self.subTest(address=f["address"], fact=f["fact"], answer=f["answer"]):
                got = self.res["addresses"][f["address"]][f["date"]]["open"][f["topic"]]
                q = next(q for q in got["facts"] if q["fact"] == f["fact"])
                a = q["answers"][json.dumps(f["answer"])]
                self.assertEqual((a["level"], a["score"]), (f["level"], f["score"]), f["why"])

    def test_score_within_range(self):
        for aid, per_date in self.res["addresses"].items():
            for d, x in per_date.items():
                with self.subTest(address=aid, date=d):
                    self.assertTrue(x["low"] <= x["score"] <= x["high"], x)


class RateDates(unittest.TestCase):
    def test_rule_in_force_before_its_rate_date(self):
        comps = {c["team_rule_id"]: c for c in json.loads((ROOT / "out" / "rules.compiled.json").read_text())}
        for f in FX["in_force_before_rate_date"]:
            with self.subTest(rule=f["rule"]):
                eff = comps[f["rule"]]["effective"]
                self.assertTrue(not eff["from"] or eff["from"] <= f["date"], f"{f['why']}: {eff}")

class OwnerScope(unittest.TestCase):
    def test_owner_occupancy_does_not_decide_big_buildings(self):
        import copy
        rules = R.load()
        addresses = F.load()
        for f in FX["owner_scope"]:
            with self.subTest(address=f["address"], rule=f["rule"]):
                got = set()
                for v in (True, False):
                    a = copy.deepcopy(addresses[f["address"]])
                    a["facts"]["owner_occupied"] = v
                    rows = B.build_lookups(rules, {f["address"]: a}, f["date"])[f["address"]]
                    got.add(next(r["result"] for r in rows if r["team_rule_id"] == f["rule"]))
                self.assertEqual(len(got), 1, f["why"])


class Whys(unittest.TestCase):
    """Every change between consecutive score dates: a why of at most WORDS words, no advice words, decided_by."""
    WORDS = 25
    BANNED = ("compliant", "illegal", "you should", "legal advice")

    def test_every_change(self):
        rules = R.load()
        by_id = {r["id"]: r for r in rules}
        addresses = F.load()
        dates = S.CFG["dates"]
        rows = {d: B.build_lookups(rules, addresses, d) for d in dates}
        n = 0
        for d0, d1 in zip(dates, dates[1:]):
            for aid, ch in D.diff_lookups(rows[d0], rows[d1], by_id).items():
                for c in ch:
                    ri = c["renter_impact"]
                    with self.subTest(address=aid, dates=(d0, d1), rule=c["team_rule_id"]):
                        self.assertTrue(ri["why"] and len(ri["why"].split()) <= self.WORDS, ri["why"])
                        self.assertFalse(any(b in ri["why"].lower() for b in self.BANNED), ri["why"])
                        self.assertEqual(ri["decided_by"]["verdict"], "code")
                    n += 1
        self.assertGreater(n, 0)


class Ratings(unittest.TestCase):
    """Positive / neutral / negative: no weights, only which way the topics that surely moved went."""
    @staticmethod
    def _levels(**lv):
        t = {c: {"level": "basic", "at_least": "basic", "at_most": "basic"} for c in S.CFG["weights"]}
        for c, (lo, hi) in lv.items():
            t[c] = {"level": lo if lo == hi else "unknown", "at_least": lo, "at_most": hi}
        return t

    def test_verdict_cases(self):
        cats = list(S.CFG["weights"])
        base = self._levels()
        cases = [({cats[0]: ("strong", "strong")}, "better"),
                 ({cats[0]: ("strong", "strong"), cats[1]: ("basic", "strong")}, "better"),   # + an unclear topic
                 ({cats[0]: ("none", "none"), cats[1]: ("basic", "strong")}, "worse"),
                 ({cats[0]: ("strong", "strong"), cats[1]: ("none", "none")}, "mixed"),
                 ({cats[1]: ("basic", "strong")}, "unclear"),
                 ({}, "unchanged")]
        for after, want in cases:
            with self.subTest(after=after):
                overall, _ = S.verdict(base, self._levels(**after))
                self.assertEqual(overall, want)
                self.assertEqual(S.rating(overall), {"better": "positive", "worse": "negative"}.get(want, "neutral"))

    def test_on_the_sample(self):
        res = S.build(S.CFG["dates"])
        newark = res["addresses"]["A0003"]["2026-10-01"]["change_from_previous"]   # NJ $50 fee cap; rent unclear
        self.assertEqual((newark["overall"], newark["rating"]), ("better", "positive"))
        self.assertIn("rent_increase_limits", newark["unclear_topics"])
        for aid, per_date in res["addresses"].items():
            for d, x in per_date.items():
                c = x.get("change_from_previous")
                if c and c["overall"] == "mixed":
                    with self.subTest(address=aid, date=d):
                        self.assertTrue({"better", "worse"} <= set(c["topics"].values()), c)


if __name__ == "__main__":
    unittest.main()
