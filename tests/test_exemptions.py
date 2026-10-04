"""extract/exemptions.py: code-only normalisations of text conditions."""
import unittest

from extract import exemptions as X

BASE = X.BASE


def fact(f, op, v):
    return {**BASE, "kind": "fact", "children": [], "fact": f, "op": op, "value": v}


class Unless(unittest.TestCase):
    def test_unless_clause_is_negated(self):
        clause = {**BASE, "kind": "unparsed", "children": [], "quote": "unless the housing is a mobilehome"}
        node = {**BASE, "kind": "all", "children": [{**BASE, "kind": "age_years", "children": [], "op": "lt", "years": 15}, clause]}
        out, n = X.negate_unless(node)
        self.assertEqual(n, 1)
        self.assertEqual(out["children"][1]["kind"], "not")
        self.assertEqual(X.negate_unless(out)[1], 0)          # idempotent

    def test_guarded_clause_is_negated_as_a_whole(self):
        clause = {**BASE, "kind": "unparsed", "children": [], "quote": "unless the housing is a mobilehome"}
        guarded = X._wrap(dict(clause), "no", 0.9)              # false for 5+ unit apartments
        out, n = X.negate_unless({**BASE, "kind": "all", "children": [fact("units", "ge", 1), guarded]})
        self.assertEqual((n, out["children"][1]["kind"], out["children"][1]["children"][0] is guarded), (1, "not", True))

    def test_clause_the_model_already_negated_is_left_alone(self):
        clause = {**BASE, "kind": "unparsed", "children": [], "quote": "unless the housing is a mobilehome"}
        node = {**BASE, "kind": "all", "children": [fact("units", "ge", 1), {**BASE, "kind": "not", "children": [clause]}]}
        self.assertEqual(X.negate_unless(node)[1], 0)

    def test_other_text_untouched(self):
        clause = {**BASE, "kind": "unparsed", "children": [], "quote": "the tenant shares a kitchen with the owner"}
        self.assertEqual(X.negate_unless(clause)[1], 0)


if __name__ == "__main__":
    unittest.main()
