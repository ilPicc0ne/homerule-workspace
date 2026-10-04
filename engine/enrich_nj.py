"""Acquire NJ building-evidence leads for the fixed sample via its public API.

Opt-in --fetch: one bounded query per municipality, exact street strings only,
explicit non-owner fields, no spatial nearest-match or guessed address variants.
Replay defaults to pinned responses, with no network. Never edits I3 or scores.
"""
import argparse
import datetime as dt
import hashlib
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from urllib.error import HTTPError

from engine import facts as F, rules as R

ROOT = R.ROOT
API = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
PUBLISHER = 'https://nj.gov/njgin/edata/parcels/'
TERMS = 'https://www.nj.gov/nj/legal.shtml'
UA = 'HomeRuleBuildingEvidence/1.0'
FIELDS = ['OBJECTID', 'PAMS_PIN', 'MUN_NAME', 'PROP_LOC', 'YR_CONSTR', 'BLDG_DESC',
          'DWELL', 'COMM_DWELL', 'PCLLASTUPD']
CITIES = {'NJ-HOBOKEN': 'HOBOKEN CITY', 'NJ-JERSEY-CITY': 'JERSEY CITY CITY', 'NJ-NEWARK': 'NEWARK CITY'}


def norm(value):
    return ' '.join((value or '').upper().split())


def sql_string(value):
    return "'" + value.replace("'", "''") + "'"


def query_url(city, addresses):
    streets = sorted({norm(a['input']['street_address']) for a in addresses})
    if not streets or len(streets) > 500:
        raise ValueError('Expected 1–500 sample street addresses')
    where = f'MUN_NAME = {sql_string(city)} AND PROP_LOC IN ({",".join(map(sql_string, streets))})'
    return API + '/query?' + urlencode({'f': 'json', 'where': where, 'outFields': ','.join(FIELDS),
                                        'returnGeometry': 'false', 'resultRecordCount': 2000,
                                        'orderByFields': 'OBJECTID'})


def get(url):
    with urlopen(Request(url, headers={'User-Agent': UA}), timeout=45) as response:
        raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise ValueError('Response exceeds bounded 5 MB acquisition limit')
        return raw


def check_policy():
    robot_url = 'https://services2.arcgis.com/robots.txt'
    rp = RobotFileParser(robot_url)
    try:
        raw = get(robot_url)
        rp.parse(raw.decode().splitlines())
    except HTTPError as e:
        if e.code == 403:
            # This is the robots resource, not a denial from the query endpoint.
            # NJ explicitly publishes this public query service for data access.
            # Record the missing policy rather than asserting robots clearance.
            return json.dumps({'robots_url': robot_url, 'status': 'unavailable_http_403',
                               'basis': PUBLISHER, 'scope': 'documented public API; three sample-only queries'}).encode(), 1
        if e.code not in (404, 410):
            raise
        raw = b''
        rp.parse([])
    if not rp.can_fetch(UA, API + '/query'):
        raise ValueError('Robots disallows this API path')
    delay = max(rp.crawl_delay(UA) or 0, 1)
    rate = rp.request_rate(UA)
    if rate:
        delay = max(delay, rate.seconds / rate.requests)
    if delay > 60:
        raise ValueError('Robots delay requires a separate acquisition run')
    return raw, delay


def validate_response(data):
    if 'error' in data or data.get('exceededTransferLimit'):
        raise ValueError('API error or truncated response; no evidence generated')
    if not isinstance(data.get('features'), list):
        raise ValueError('Missing API feature list')
    for f in data['features']:
        if set(f['attributes']) - set(FIELDS):
            raise ValueError('Unexpected fields; refusing to retain unrelated data')


def response_hash(response):
    return hashlib.sha256(json.dumps(response, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def match(rec, response, source_url, retrieved_at, raw_sha):
    validate_response(response)
    city = CITIES[rec['jurisdictions']['city']]
    matches = [f['attributes'] for f in response['features']
               if norm(f['attributes'].get('MUN_NAME')) == city
               and norm(f['attributes'].get('PROP_LOC')) == norm(rec['input']['street_address'])]
    out = {'address_id': rec['address_id'], 'match': 'none' if not matches else 'ambiguous' if len(matches) != 1 else 'exact_address',
           'candidate_count': len(matches), 'source_url': API, 'retrieved_at': retrieved_at,
           'response_sha256': raw_sha, 'records': matches, 'leads': []}
    if len(matches) != 1:
        return out
    row = matches[0]
    record_url = API + '/query?' + urlencode({'f': 'json', 'objectIds': row['OBJECTID'],
                                              'outFields': ','.join(FIELDS), 'returnGeometry': 'false'})
    year = row.get('YR_CONSTR')
    values = []
    if isinstance(year, int) and not isinstance(year, bool) and 1500 <= year <= int(retrieved_at[:4]):
        values.append(('built', {'from': f'{year}-01-01', 'to': f'{year}-12-31'}, 'YR_CONSTR',
                       'Assessor construction year; not first occupancy date or proof that the current building existed at the query date.'))
    units = row.get('DWELL')
    if isinstance(units, int) and not isinstance(units, bool) and units > 0:
        values.append(('units', {'min': units, 'max': units}, 'DWELL',
                       'Parcel dwelling count; verify that it describes one building and excludes unrelated structures.'))
    for fact, value, field, limitation in values:
        current = rec['facts'].get(fact)
        relation = 'fills_missing' if current is None else 'agrees' if current == value else 'review_difference'
        out['leads'].append({'fact': fact, 'value': value, 'source_field': field,
                            'source_url': record_url, 'publisher_url': PUBLISHER,
                            'source_record_id': row.get('PAMS_PIN'), 'retrieved_at': retrieved_at,
                            'source_record_updated_at': row.get('PCLLASTUPD'),
                            'source_fields': {field: row[field], 'PROP_LOC': row['PROP_LOC'], 'MUN_NAME': row['MUN_NAME']},
                            'comparison': relation, 'current_value': current,
                            'automatic_promotion': False, 'limitation': limitation})
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fetch', action='store_true')
    p.add_argument('--input', type=Path, default=ROOT / 'out/addresses.resolved.json')
    p.add_argument('--directory', type=Path, default=ROOT / 'data/building-evidence')
    a = p.parse_args()
    directory = a.directory
    directory.mkdir(parents=True, exist_ok=True)
    addresses = F.load(a.input)
    if a.fetch:
        robots, delay = check_policy()
        (directory / 'nj-robots-check.txt').write_bytes(robots)
        layer = get(API + '?f=pjson')
        # Keep only field metadata and attribution, not unused owner fields.
        meta = json.loads(layer)
        if not set(FIELDS) <= {x['name'] for x in meta['fields']}:
            raise ValueError('Source schema changed')
        (directory / 'nj-layer.json').write_text(json.dumps({
            'source_url': API, 'copyright': meta.get('copyrightText'),
            'fields': [x for x in meta['fields'] if x['name'] in FIELDS]}, indent=2) + '\n')
    result = {}
    for jid, city in sorted(CITIES.items()):
        subset = [r for r in addresses.values() if r['jurisdictions'].get('city') == jid]
        url = query_url(city, subset)
        path = directory / (jid.lower() + '.json')
        if a.fetch:
            time.sleep(delay)
            raw = get(url)
            response = json.loads(raw)
            validate_response(response)
            envelope = {'source_url': url, 'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                        'sha256': response_hash(response),
                        'transport_sha256': hashlib.sha256(raw).hexdigest(), 'response': response}
            path.write_text(json.dumps(envelope, indent=2, sort_keys=True) + '\n')
        envelope = json.loads(path.read_text())
        if envelope['source_url'] != url:
            raise ValueError('Sample/query changed; explicitly fetch a new snapshot')
        if envelope['sha256'] != response_hash(envelope['response']):
            raise ValueError('Pinned response hash mismatch')
        for rec in subset:
            result[rec['address_id']] = match(rec, envelope['response'], url,
                                              envelope['retrieved_at'], envelope['sha256'])
    summary = {'addresses': len(result),
               'exact_matches': sum(v['match'] == 'exact_address' for v in result.values()),
               'ambiguous': sum(v['match'] == 'ambiguous' for v in result.values()),
               'no_match': sum(v['match'] == 'none' for v in result.values()),
               'missing_fact_leads': sum(e['comparison'] == 'fills_missing' for v in result.values() for e in v['leads']),
               'facts_promoted': 0}
    payload = {'not_legal_advice': True, 'as_of': None,
               'date_scope': 'source snapshot only; not historical building facts',
               'publisher_url': PUBLISHER, 'terms_url': TERMS, 'summary': summary,
               'input_sha256': hashlib.sha256(a.input.read_bytes()).hexdigest(),
               'addresses': dict(sorted(result.items()))}
    (directory / 'nj-modiv.json').write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n')
    print(json.dumps(summary, sort_keys=True))


if __name__ == '__main__':
    main()
