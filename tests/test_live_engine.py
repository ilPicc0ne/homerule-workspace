"""Live API parity and HTTP boundary tests. Never write scored artifacts."""
import contextlib
import copy
from email.message import Message
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('live_engine_handler', ROOT / 'web/api/engine.py')
api = importlib.util.module_from_spec(spec)
_path = sys.path[:]
_modules = {k: v for k, v in sys.modules.items() if k == 'engine' or k.startswith('engine.')}
for _name in _modules: del sys.modules[_name]
try:
    spec.loader.exec_module(api)
finally:
    sys.path[:] = _path
    for _name in list(sys.modules):
        if _name == 'engine' or _name.startswith('engine.'): del sys.modules[_name]
    sys.modules.update(_modules)
RECORDS = json.loads((ROOT / 'out/addresses.resolved.json').read_text())['addresses']
AS_OF = '2026-10-01'


def unknown(city):
    rec = copy.deepcopy(next(r for r in RECORDS if r['jurisdictions']['city'] == city))
    rec['facts'] = {k: None for k in rec['facts']}
    rec['source'] = {'jurisdiction': 'census'}
    rec['source_detail'] = {}
    rec['confidence'] = {'jurisdiction': .99, 'built': 0, 'units': 0}
    rec['assumptions'] = []
    return rec


class LiveEngineTests(unittest.TestCase):
    def test_all_500_rows_match_committed_outputs_using_only_bundled_engine(self):
        # A fresh interpreter prevents another test's root engine module from
        # accidentally masking a missing or stale deployment dependency.
        script = '''
import importlib.util,json,sys
from pathlib import Path
root=Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('api_handler',root/'web/api/engine.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
assert api.R.ROOT == root/'web/api/_homerule'
expected=json.loads((root/'out/lookups.full.json').read_text())
records=json.loads((root/'out/addresses.resolved.json').read_text())['addresses']
assert len(records)==500
for record in records:
    response=api.evaluate({'as_of':'2026-10-01','record':record})
    assert response['results']==expected['addresses'][record['address_id']]['results'],record['address_id']
    assert response['not_legal_advice'] is True and len(response['engine'])==64
print('500/500 exact row matches')
'''
        run = subprocess.run([sys.executable, '-c', script, str(ROOT)], capture_output=True, text=True, cwd='/tmp')
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn('500/500', run.stdout)

    def test_unknown_la_retains_uncertainty_and_unconditional_state_rule(self):
        rec = unknown('CA-LOS-ANGELES')
        before = copy.deepcopy(rec)
        rows = {r['team_rule_id']: r for r in api.evaluate({'as_of': AS_OF, 'record': rec})['results']}
        self.assertEqual(rows['CA-RENT-1947.12']['result'], 'unknown')
        self.assertIn('built', rows['CA-RENT-1947.12']['missing_deciding'])
        self.assertEqual(rows['CA-ALG-16729']['result'], 'applies')
        self.assertEqual(rec, before)

    def test_hoboken_conflict_matches_sample_on_same_date(self):
        rec = unknown('NJ-HOBOKEN')
        sample = next(r for r in RECORDS if r['jurisdictions']['city'] == 'NJ-HOBOKEN')
        for day in (AS_OF, '2027-07-02'):
            def flags(record):
                return {r['team_rule_id']: r['conflict_flag'] for r in api.evaluate({'as_of': day, 'record': record})['results'] if r['category'] == 'algorithmic_rent_setting'}
            self.assertEqual(flags(rec), flags(sample))
            if day == '2027-07-02':
                self.assertTrue(any(flags(rec).values()))

    def test_invalid_payloads_are_rejected(self):
        valid = {'as_of': AS_OF, 'record': unknown('CA-LOS-ANGELES')}
        invalid = [None, [], {}, {**valid, 'as_of': '2026-02-30'}, {**valid, 'as_of': '20261001'}]
        for field, value in [('state', 'NY'), ('city', 'CA-NOT-A-CITY'), ('city', 'NJ-HOBOKEN'), ('city', [])]:
            p = copy.deepcopy(valid); p['record']['jurisdictions'][field] = value; invalid.append(p)
        for fact, value in [('built', {'from': '2020-01-01', 'to': '1990-01-01'}), ('units', {'min': 2}), ('units', {'min': 3, 'max': 1}), ('subsidised', 'false'), ('owner_type', []), ('use_class', 'hotel')]:
            p = copy.deepcopy(valid); p['record']['facts'][fact] = value; invalid.append(p)
        p = copy.deepcopy(valid); p['record']['confidence']['jurisdiction'] = float('nan'); invalid.append(p)
        for p in invalid:
            with self.subTest(payload=p), self.assertRaises(api.InvalidRequest): api.evaluate(p)

    def call(self, raw, length=None, method='POST'):
        h = object.__new__(api.handler)
        h.path = '/api/engine?do-not-log-this-street'
        h.headers = Message(); h.headers['Content-Length'] = str(len(raw) if length is None else length)
        h.rfile = io.BytesIO(raw)
        h.connection = type('Connection', (), {'settimeout': lambda self, n: None})()
        response = []
        h.respond = lambda status, body: response.append((status, body))
        log = io.StringIO()
        with contextlib.redirect_stdout(log): getattr(h, 'do_' + method)()
        self.assertEqual(len(log.getvalue().splitlines()), 1)
        self.assertEqual(set(json.loads(log.getvalue())), {'state', 'city', 'as_of', 'ms', 'error'})
        self.assertNotIn('do-not-log', log.getvalue())
        return response[0]

    def test_http_body_limit_json_and_method_errors(self):
        for raw, length, expected in [(b'{}', 65537, 413), (b'{', None, 400), (b'[]', None, 400), (b'', None, 400), (b'{}', 20, 400)]:
            status, body = self.call(raw, length)
            self.assertEqual(status, expected)
            self.assertIs(body['not_legal_advice'], True)
            self.assertIn('as_of', body)
        self.assertEqual(self.call(b'', method='GET')[0], 405)

    def test_http_success_matches_pure_evaluation_and_logs_no_street(self):
        payload = {'as_of': AS_OF, 'record': unknown('CA-LOS-ANGELES')}
        payload['record']['input'] = {'street_address': 'do-not-log-private-address'}
        status, body = self.call(json.dumps(payload).encode())
        self.assertEqual(status, 200)
        self.assertEqual(body, api.evaluate(payload))


if __name__ == '__main__': unittest.main()
