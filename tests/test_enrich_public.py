"""Public records must preserve identity, semantics and uncertainty."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from engine import enrich_public as P, facts as F, fact_gaps as G
from tests.test_fact_gaps import fixture


class PublicEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = json.loads((P.DIRECTORY / 'sources.json').read_text())['sources']
        cls.addresses = F.load()

    def rec(self, city):
        return copy.deepcopy(next(r for r in self.addresses.values() if r['jurisdictions']['city'] == city))

    def leads(self, key, row, rec):
        row = {'OBJECTID': 1, 'row_id': 'fixture', **row}
        return P.make_leads(key, self.sources[key], {'source_url': 'https://example.org/public',
            'sha256': 'fixture', 'retrieved_at': '2026-10-04'}, row, rec)

    def test_normalization_preserves_identity(self):
        self.assertEqual(P.norm('123 MAIN AV.'), P.norm('123 Main Avenue'))
        self.assertNotEqual(P.norm('123 MAIN ST #2'), P.norm('123 MAIN ST'))
        self.assertNotEqual(P.norm('123-125 MAIN ST'), P.norm('123 MAIN ST'))
        self.assertNotEqual(P.norm('123 N MAIN ST'), P.norm('123 MAIN ST'))
        self.assertNotEqual(P.norm('123.5 MAIN ST'), P.norm('123 MAIN ST'))

    def test_la_zip_and_multi_building_lines(self):
        rec = self.rec('CA-LOS-ANGELES')
        row = {'SitusAddress': rec['input']['street_address'], 'SitusZIP': rec['input']['zip'],
               'YearBuilt1': '1950', 'Units1': 8, 'YearBuilt2': '2000', 'Units2': 2}
        self.assertTrue(P.matches('la', row, rec))
        self.assertEqual(self.leads('la', row, rec), [])
        row['SitusZIP'] = '99999'
        self.assertFalse(P.matches('la', row, rec))

    def test_ma_municipality_and_nonresidential_unit_warning(self):
        rec = self.rec('MA-BOSTON')
        row = {'TOWN_ID': 35, 'SITE_ADDR': rec['input']['street_address'], 'YEAR_BUILT': 1900, 'UNITS': 9}
        self.assertTrue(P.matches('ma', row, rec))
        result = self.leads('ma', row, rec)
        self.assertEqual(result[0]['meaning'], 'assessor_construction_year')
        self.assertIn('commercial', result[1]['limitation'])
        self.assertTrue(all(not x['automatic_promotion'] for x in result))
        row['TOWN_ID'] = 49
        self.assertFalse(P.matches('ma', row, rec))

    def test_sf_ranges_and_units_never_become_exact_building(self):
        self.assertEqual(P.sf_address({'property_location': '0000 0022 PRECITA             AV0000'}), ('22 PRECITA AVE', False))
        self.assertTrue(P.sf_address({'property_location': '0028 0022 PRECITA             AV0000'})[1])
        self.assertTrue(P.sf_address({'property_location': '0000 0022 PRECITA             AV0002'})[1])
        self.assertTrue(P.sf_address({'property_location': 'unrecognized'})[1])

    def test_hud_no_negative_inference_and_program_not_occupancy(self):
        rec = self.rec('CA-SAN-DIEGO')
        row = {'TOTAL_UNIT_COUNT': 10, 'TOTAL_ASSISTED_UNIT_COUNT': 0, 'HAS_USE_RESTRICTION_IND': 'N'}
        self.assertEqual([x['fact'] for x in self.leads('hud', row, rec)], ['units'])
        row.update(TOTAL_ASSISTED_UNIT_COUNT=4, OCCUPANCY_DATE=1234)
        facts = {x['fact']: x for x in self.leads('hud', row, rec)}
        self.assertTrue(facts['subsidised']['value'])
        self.assertIn('occupancy_record', facts)
        self.assertNotIn('built', facts)

    def test_hud_wrong_city_and_state_rejected(self):
        rec = self.rec('MA-BOSTON')
        row = {'ADDRESS_LINE1_TEXT': rec['input']['street_address'], 'PLACED_BASE_CITY_NAME_TEXT': 'Boston', 'STD_ST': 'MA'}
        self.assertTrue(P.matches('hud', row, rec))
        row['STD_ST'] = 'CA'
        self.assertFalse(P.matches('hud', row, rec))
        row.update(STD_ST='MA', PLACED_BASE_CITY_NAME_TEXT='Cambridge')
        self.assertFalse(P.matches('hud', row, rec))

    def test_permit_closure_and_proposed_units_are_only_events(self):
        rec = self.rec('CA-SAN-DIEGO')
        row = {'GIS_ADDRESS': rec['input']['street_address'] + ', San Diego, CA 92101',
               'APPROVAL_ID': 'fixture', 'APPROVAL_CLOSE_DATE': '2025-01-01', 'APPROVAL_DU_NET_CHANGE': '20'}
        self.assertTrue(P.matches('sd', row, rec))
        result = self.leads('sd', row, rec)
        self.assertEqual([l['fact'] for l in result], ['permit_event'])
        self.assertFalse(result[0]['automatic_promotion'])

    def test_sd_parcel_does_not_turn_effective_year_into_built(self):
        rec = self.rec('CA-SAN-DIEGO')
        row = {'SITUS_ADDRESS': 3820, 'SITUS_STREET': 'HAINES', 'SITUS_SUFFIX': 'ST',
               'SITUS_JURIS': 'SD', 'SITUS_ZIP': rec['input']['zip'], 'UNITQTY': 16, 'YEAR_EFFECTIVE': '78'}
        self.assertTrue(P.matches('sdparcels', row, rec))
        self.assertEqual([l['fact'] for l in self.leads('sdparcels', row, rec)], ['units'])
        row['SITUS_SUITE'] = '2'
        self.assertFalse(P.matches('sdparcels', row, rec))
        rec['input']['street_address'] = '10303 CAMINITO ALVAREZ'
        self.assertIn('CAMINITO', P.query('sdparcels', self.sources['sdparcels'], [rec]))

    def test_range_refinement_and_service_year_remain_typed(self):
        self.assertEqual(P.comparison('units', {'min': 7, 'max': None}, {'min': 27, 'max': 27}), 'narrows_range')
        self.assertEqual(P.comparison('units', {'min': 7, 'max': 30}, {'min': 57, 'max': 57}), 'review_difference')
        rec = self.rec('CA-LOS-ANGELES')
        result = self.leads('lihtc', {'HUD_ID': 'test', 'YR_PIS': '2001', 'N_UNITS': 20}, rec)
        self.assertNotIn('built', {l['fact'] for l in result})
        self.assertIn('program_service_year', {l['fact'] for l in result})

    def test_bad_and_unrelated_api_data_rejected(self):
        source = self.sources['la']
        for payload in ({'features': [], 'exceededTransferLimit': True}, {'error': {'code': 400}},
                        {'features': [{'attributes': {'OWNER_NAME': 'not needed'}}]}):
            with self.assertRaises(ValueError):
                P.rows_from(payload, source)
        self.assertIsNone(P.positive_int('0'))
        self.assertIsNone(P.positive_int('1.5'))
        self.assertIsNone(P.positive_int(True))
        self.assertEqual(P.positive_int('12.0'), 12)

    def test_ambiguous_parcels_and_tampered_snapshot(self):
        key = 'ma'; source = self.sources[key]; rec = self.rec('MA-BOSTON')
        row = {'TOWN_ID': 35, 'SITE_ADDR': rec['input']['street_address'], 'YEAR_BUILT': 1900, 'UNITS': 9}
        data = {'features': [{'attributes': row}, {'attributes': {**row, 'YEAR_BUILT': 2000}}]}
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'ma-records.json'
            P.save_envelope(path, P.query(key, source, [rec]), b'fixture', data)
            result = P.replay(key, source, [rec], Path(d))[rec['address_id']]
            self.assertEqual(result['match'], 'ambiguous')
            self.assertEqual(result['leads'], [])
            env = json.loads(path.read_text()); env['response']['features'] = []
            path.write_text(json.dumps(env))
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                P.replay(key, source, [rec], Path(d))

    def test_evidence_survives_no_question_without_changing_answer(self):
        rec, rule = fixture()
        before = copy.deepcopy(rec)
        evidence = [{'fact': 'permit_event', 'value': {'APPROVAL_ID': 'fixture'}, 'automatic_promotion': False}]
        base = G.plan_address([rule], rec, '2026-10-01')
        actual = G.plan_address([rule], rec, '2026-10-01', evidence)
        self.assertEqual(actual['questions'], base['questions'])
        self.assertEqual(actual['building_evidence'], evidence)
        self.assertEqual(rec, before)


if __name__ == '__main__':
    unittest.main()
