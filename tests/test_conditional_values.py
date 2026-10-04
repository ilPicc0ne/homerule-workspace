"""Real extracted exception -> compiler -> engine; no invented legal records."""
import copy
import json
import unittest

from extract import compile as C
from extract.conditional_values import add_detail, rent_months, scoped_condition
from engine import evaluate as E, facts as F, rules as R, score as S


class ConditionalDeposits(unittest.TestCase):
    def test_actual_compiled_exception_keeps_conditions_and_evidence(self):
        r = next(r for r in json.loads((R.OUT / 'rules.compiled.json').read_text())
                 if r['team_rule_id'] == 'CA-DEP-1950.5')
        branch = r['key_value_conditions'][0]
        self.assertEqual(rent_months(branch['value']), 2)
        self.assertIn('two months', branch['evidence']['quote'])
        self.assertEqual(branch['evidence']['source_doc_id'], 'D025')
        self.assertIn('service member', branch['tenant_note'])
        detail = next(d for d in r['details'] if rent_months(d['key_value']) == 2)
        self.assertIn('applies_if', detail)
        self.assertIn('tenant_conditions', detail)

    def test_a0398_is_covered_but_amount_is_not_settled(self):
        rule = next(r for r in R.load() if r['id'] == 'CA-DEP-1950.5')
        rec = F.load()['A0398']
        for units in (None, {'min': 1, 'max': 1}, {'min': 21, 'max': 21}):
            with self.subTest(units=units):
                rec = copy.deepcopy(rec)
                rec['facts'].update(units=units, owner_type='individual')
                res = E.evaluate([rule], F.address_facts(rec), '2026-10-01')[rule['id']]
                self.assertEqual(res['result'], 'applies')
                self.assertEqual([rent_months(v) for v in res['value']['conditional']], [1, 2])
                self.assertTrue(any('collectively' in q for q in res['value']['qualifications']))
                self.assertTrue(any('service member' in q for q in res['value']['qualifications']))
                self.assertEqual(S.value_levels(rule, res), ('basic', 'strong'))

    def test_building_size_is_not_an_owner_portfolio(self):
        n = {'kind': 'fact', 'fact': 'units', 'op': 'le', 'value': 4,
             'quote': 'collectively include no more than four dwelling units offered for rent'}
        self.assertEqual(scoped_condition(n)['kind'], 'unparsed')
        # Ordinary building-unit predicates still work; no blanket deletion.
        n['quote'] = 'the building contains four or fewer units'
        self.assertEqual(scoped_condition(n), n)

    def test_supporting_deadline_or_other_section_is_not_an_amount_branch(self):
        main = {'category': 'security_deposits', 'key_value': "One month's rent", 'details': [], 'key_value_conditions': []}
        detail = {'key_value': 'Six months of residency', 'requirement': 'Return additional security after six months',
                  'applies_if': {'kind': 'unparsed', 'quote': 'tenant not in arrears'}}
        add_detail(main, detail, {'quote': 'source'}, same_section=True)
        self.assertEqual(main['key_value_conditions'], [])
        detail.update(key_value="Two months' rent", requirement='A landlord may not demand security exceeding two months of rent')
        add_detail(main, detail, {'quote': 'source'}, same_section=False)
        self.assertEqual(main['key_value_conditions'], [])
        add_detail(main, detail, {'quote': 'source'}, same_section=True)
        self.assertEqual(len(main['key_value_conditions']), 1)

    def test_rent_month_amount_grammar(self):
        for value, n in [("One month’s rent", 1), ("two months’ rent", 2), ("1.5 months of rent", 1.5)]:
            self.assertEqual(rent_months(value), n)
        self.assertIsNone(rent_months('six months of residency'))
