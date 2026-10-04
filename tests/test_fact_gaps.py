"""Counterfactual planning must not turn a hypothesis into a building fact."""
import copy
import unittest

from engine import fact_gaps as G, enrich_nj as N, facts as F, rules as R


def fixture():
    rec = copy.deepcopy(F.load()['A0001'])
    rule = copy.deepcopy(next(r for r in R.load() if r['id'] == 'CA-RENT-1947.12'))
    rule.update(id='synthetic', applies_if={'kind': 'always'}, exempt_if={'kind': 'never'},
                interactions=[], tenant_conditions=[], key_value_conditions=[],
                document_status='enacted', events=[], eff={'from': None, 'until': None, 'precision': 'day'})
    return rec, rule


class Plans(unittest.TestCase):
    def test_boundary_inside_known_year_and_inputs_unchanged(self):
        rec, rule = fixture()
        rec['facts']['built'] = {'from': '1978-01-01', 'to': '1978-12-31'}
        rule['applies_if'] = {'kind': 'date_fact', 'fact': 'built', 'op': 'le', 'date': '1978-10-01'}
        original = copy.deepcopy(rec)
        p = G.plan_address([rule], rec, '2026-10-01')
        self.assertEqual(rec, original)
        q = p['questions'][0]
        self.assertEqual(q['fact'], 'built')
        self.assertEqual(q['resolution_count'], {'minimum': 1, 'maximum': 1})
        self.assertEqual({b['resolved'][0]['result'] for b in q['branches']}, {'applies', 'not_applicable'})
        self.assertTrue(all('1978-' in b['value']['from'] for b in q['branches']))

    def test_masked_unknown_does_not_create_question(self):
        rec, rule = fixture()
        rule['applies_if'] = {'kind': 'any', 'children': [
            {'kind': 'always'}, {'kind': 'fact', 'fact': 'owner_occupied', 'op': 'eq', 'value': True}]}
        self.assertEqual(G.plan_address([rule], rec, '2026-10-01')['questions'], [])

    def test_multiple_unknowns_do_not_promise_resolution(self):
        rec, rule = fixture()
        rule['applies_if'] = {'kind': 'all', 'children': [
            {'kind': 'fact', 'fact': 'owner_occupied', 'op': 'eq', 'value': True},
            {'kind': 'unparsed', 'quote': 'A condition needing review'}]}
        p = G.plan_address([rule], rec, '2026-10-01')
        self.assertEqual(p['questions'][0]['resolution_count'], {'minimum': 0, 'maximum': 1})
        yes = next(b for b in p['questions'][0]['branches'] if b['value'] is True)
        self.assertEqual(yes['resolved'], [])
        self.assertEqual(p['blockers'][0]['unparsed_conditions'], ['A condition needing review'])

    def test_conditional_value_is_a_separate_reason_to_ask(self):
        rec, rule = fixture()
        rule['key_value_conditions'] = [{'value': 'a conditional amount', 'tenant_note': None,
                                        'when': {'kind': 'fact', 'fact': 'owner_occupied', 'op': 'eq', 'value': True}}]
        p = G.plan_address([rule], rec, '2026-10-01')
        self.assertEqual(p['questions'][0]['resolution_count']['minimum'], 1)
        self.assertEqual(p['blockers'][0]['aspect'], 'value')

    def test_tenant_conditions_survive_known_building_coverage(self):
        rec, rule = fixture()
        rule['tenant_conditions'] = ['Depends on length of tenancy.']
        p = G.plan_address([rule], rec, '2026-10-01')
        self.assertEqual(p['questions'], [])
        self.assertEqual(p['tenant_notes'][0]['conditions'], rule['tenant_conditions'])

    def test_score_is_context_not_an_uplift_claim(self):
        rec, rule = fixture()
        rec['facts']['units'] = None
        rule['applies_if'] = {'kind': 'fact', 'fact': 'units', 'op': 'gt', 'value': 4}
        score = {'score': 50, 'low': 50, 'high': 75, 'unknown_topics': ['rent_increase_limits']}
        p = G.plan_address([rule], rec, '2026-10-01', score_context=score)
        self.assertEqual(p['questions'][0]['unsettled_score_topics'], ['rent_increase_limits'])
        self.assertEqual(p['score_context'], score)
        self.assertEqual(p['score_effect'], 'not_calculated')

    def test_effective_window_is_not_solved_by_building_fact(self):
        rec, rule = fixture()
        rec['facts']['built'] = None
        rule['eff'] = {'from': '2026-01-01', 'until': None, 'precision': 'year'}
        rule['events'] = [{'kind': 'effective', 'date': '2026-01-01'}]
        rule['applies_if'] = {'kind': 'date_fact', 'fact': 'built', 'op': 'lt', 'date': '2000-01-01'}
        p = G.plan_address([rule], rec, '2026-10-01')
        q = p['questions'][0]
        self.assertEqual(q['resolution_count']['minimum'], 0)
        self.assertTrue(p['blockers'][0]['effective_date_uncertainty'])

    def test_partitions_preserve_eq_ne_and_open_ended_ranges(self):
        rec, rule = fixture()
        rec['facts']['units'] = {'min': 2, 'max': None}
        rule['applies_if'] = {'kind': 'fact', 'fact': 'units', 'op': 'eq', 'value': 4}
        self.assertEqual([b['value'] for b in G.partitions('units', rec, [rule], '2026-10-01')],
                         [{'min': 2, 'max': 3}, {'min': 4, 'max': 4}, {'min': 5, 'max': None}])


class Evidence(unittest.TestCase):
    def setUp(self):
        self.rec = copy.deepcopy(next(r for r in F.load().values() if r['jurisdictions']['city'] == 'NJ-HOBOKEN'))
        self.rec['facts']['built'] = None
        self.row = {'OBJECTID': 1, 'PAMS_PIN': 'test', 'MUN_NAME': 'HOBOKEN CITY',
                    'PROP_LOC': self.rec['input']['street_address'], 'YR_CONSTR': 1980, 'DWELL': 6}

    def match(self, rows):
        return N.match(self.rec, {'features': [{'attributes': r} for r in rows]}, N.API, '2026-10-04', 'sha')

    def test_exact_match_is_only_a_lead(self):
        result = self.match([self.row])
        self.assertEqual(result['match'], 'exact_address')
        self.assertEqual(result['leads'][0]['comparison'], 'fills_missing')
        self.assertFalse(result['leads'][0]['automatic_promotion'])
        self.assertIsNone(self.rec['facts']['built'])

    def test_duplicates_and_wrong_municipality_not_promoted(self):
        self.assertEqual(self.match([self.row, self.row])['leads'], [])
        self.row['MUN_NAME'] = 'ANOTHER CITY'
        self.assertEqual(self.match([self.row])['match'], 'none')

    def test_zero_year_and_units_are_missing_not_false_facts(self):
        self.row.update(YR_CONSTR=0, DWELL=0)
        self.assertEqual(self.match([self.row])['leads'], [])

    def test_unexpected_private_fields_and_truncation_rejected(self):
        with self.assertRaises(ValueError):
            N.validate_response({'features': [], 'exceededTransferLimit': True})
        self.row['OWNER_NAME'] = 'must never be requested'
        with self.assertRaises(ValueError):
            self.match([self.row])


if __name__ == '__main__':
    unittest.main()
