"""Bounded public building records: explicit fetch, hash-verified offline replay.

No I3/score writes. Exact normalized addresses only; ambiguous parcels and address
ranges stay candidates. Permit events and program listings remain distinct facts.
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import re
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from engine import facts as F, rules as R
from engine.enrich_nj import response_hash, sql_string

ROOT = R.ROOT
DIRECTORY = ROOT / 'data/building-evidence'
UA = 'HomeRuleBuildingEvidence/1.0'
SUFFIXES = {'AV': 'AVE', 'AVENUE': 'AVE', 'STREET': 'ST', 'ROAD': 'RD',
            'BOULEVARD': 'BLVD', 'PLACE': 'PL', 'DRIVE': 'DR', 'COURT': 'CT',
            'LANE': 'LN', 'TERRACE': 'TER', 'PARKWAY': 'PKWY'}


def norm(value):
    # Keep house-number ranges, unit identifiers, fractions and directions intact.
    parts = str(value or '').upper().strip().split()
    return ' '.join(SUFFIXES.get(p.rstrip('.'), p) for p in parts)


def get(url, limit=8_000_000):
    with urlopen(Request(url, headers={'User-Agent': UA}), timeout=45) as r:
        raw = r.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('Bounded response limit exceeded')
        return raw


def policy(source):
    host = urlsplit(source['api'])
    url = f'{host.scheme}://{host.netloc}/robots.txt'
    record = {'url': url, 'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'access_basis': source['access_basis'], 'publisher': source['publisher']}
    try:
        raw = get(url)
    except HTTPError as e:
        if e.code not in (403, 404, 410):
            raise
        # Only a missing robots resource: explicitly published APIs/downloads,
        # never a data endpoint denial, crawler workaround or user-agent disguise.
        return {**record, 'status': f'unavailable_http_{e.code}'}, 1
    rp = RobotFileParser(url)
    rp.parse(raw.decode().splitlines())
    if not rp.can_fetch(UA, source['api'] + ('/query' if source['kind'] == 'arcgis' else '')):
        raise ValueError('Robots disallows source path')
    delay = max(rp.crawl_delay(UA) or 0, 1)
    rate = rp.request_rate(UA)
    if rate:
        delay = max(delay, rate.seconds / rate.requests)
    if delay > 60:
        raise ValueError('Source requires a separately scheduled fetch')
    return {**record, 'status': 'path_allowed', 'policy_text': raw.decode()}, delay


def scope(source, addresses):
    return [r for r in addresses.values() if '*' in source['scope'] or r['jurisdictions']['city'] in source['scope']]


def query(key, source, recs):
    streets = sorted({r['input']['street_address'].upper() for r in recs})
    values = ','.join(map(sql_string, streets))
    if key == 'la':
        where = f'SitusAddress IN ({values})'
    elif key == 'sdparcels':
        clauses = []
        for street in streets:
            parts = street.split()
            if not parts[0].isdigit():
                continue
            middle = parts[1:]
            if middle and middle[0] in ('N', 'S', 'E', 'W'):
                middle = middle[1:]
            if middle and SUFFIXES.get(middle[-1], middle[-1]) in ('AVE','ST','RD','BLVD','PL','DR','CT','LN','TER','PKWY','WAY'):
                middle = middle[:-1]
            clauses.append(f"(SITUS_ADDRESS = {int(parts[0])} AND SITUS_STREET = {sql_string(' '.join(middle))})")
        where = "SITUS_JURIS = 'SD' AND (" + ' OR '.join(clauses) + ')'
    elif key == 'ma':
        # TOWN_ID identifies the municipality; CITY can be a neighbourhood.
        variants = set(streets)
        for s in streets:
            for end in (' AV', ' AVE', ' AVENUE'):
                if s.endswith(end):
                    variants.update(s[:-len(end)] + alt for alt in (' AV', ' AVE', ' AVENUE'))
        where = f"TOWN_ID IN (35,49) AND UPPER(SITE_ADDR) IN ({','.join(map(sql_string, sorted(variants)))})"
    elif key in ('hud', 'lihtc'):
        address = 'ADDRESS_LINE1_TEXT' if key == 'hud' else 'PROJ_ADD'
        state = 'STD_ST' if key == 'hud' else 'PROJ_ST'
        # Query number+street prefix, then match full suffix, city and state locally.
        prefixes = sorted({s.rsplit(' ', 1)[0] for s in streets})
        where = f"{state} IN ('CA','MA','NJ') AND (" + ' OR '.join(
            f'UPPER({address}) LIKE {sql_string(s + " %")}' for s in prefixes) + ')'
    elif key == 'sf':
        patterns = []
        for s in streets:
            m = re.fullmatch(r'(\d+) (.+) \S+', s)
            if m:
                patterns.append(f"upper(property_location) like {sql_string('% ' + m[1].zfill(4) + ' ' + m[2] + ' %')}")
        return source['api'] + '?' + urlencode({'$select': ','.join(source['fields']),
            '$where': "closed_roll_year='2025' AND (" + ' OR '.join(patterns) + ')',
            '$limit': 2000, '$order': 'row_id'})
    else:
        raise ValueError(key)
    return source['api'] + '/query?' + urlencode({'f': 'json', 'where': where,
        'outFields': ','.join(source['fields']), 'returnGeometry': 'false',
        'resultRecordCount': 2000, 'orderByFields': 'OBJECTID'})


def rows_from(data, source):
    if source['kind'] == 'arcgis':
        if 'error' in data or data.get('exceededTransferLimit') or not isinstance(data.get('features'), list):
            raise ValueError('API error, missing features or truncated response: ' + str(data.get('error', '')))
        rows = [r['attributes'] for r in data['features']]
    else:
        rows = data
    if not isinstance(rows, list) or len(rows) >= 2000:
        raise ValueError('Missing rows or potential pagination limit')
    if any(set(r) - set(source['fields']) for r in rows):
        raise ValueError('Unexpected fields: refusing unrelated data')
    return rows


def sf_address(row):
    # Assessor fixed-format: high-number low-number street suffix unit.
    m = re.fullmatch(r'(\d+)\s+(\d+)\s+(.+?)\s+([A-Z]+)(\d+)', row.get('property_location', '').strip())
    if not m:
        return None, True
    high, low, street, suffix, unit = m.groups()
    return norm(f'{int(low)} {street} {suffix}'), int(high) not in (0, int(low)) or int(unit) != 0


def sd_address(row):
    return norm(' '.join(str(row.get(f) or '') for f in ('SITUS_ADDRESS', 'SITUS_FRACTION', 'SITUS_PRE_DIR', 'SITUS_STREET', 'SITUS_SUFFIX', 'SITUS_POST_DIR', 'SITUS_BUILDING', 'SITUS_SUITE')))


def matches(key, row, rec):
    street = norm(rec['input']['street_address'])
    city = rec['jurisdictions']['city']
    if key == 'la':
        return norm(row.get('SitusAddress')) == street and str(row.get('SitusZIP', ''))[:5] == rec['input']['zip']
    if key == 'ma':
        return row.get('TOWN_ID') == {'MA-BOSTON': 35, 'MA-CAMBRIDGE': 49}.get(city) and norm(row.get('SITE_ADDR')) == street
    if key == 'sdparcels':
        return sd_address(row) == street and row.get('SITUS_JURIS') == 'SD' and str(row.get('SITUS_ZIP', ''))[:5] == rec['input']['zip']
    if key == 'sf':
        return sf_address(row)[0] == street
    if key == 'sd':
        pieces = (row.get('GIS_ADDRESS') or '').split(',')
        return len(pieces) >= 3 and norm(pieces[0]) == street and norm(pieces[1]) == 'SAN DIEGO' and pieces[2].strip().upper().startswith('CA ')
    address, city_field, state = ('ADDRESS_LINE1_TEXT', 'PLACED_BASE_CITY_NAME_TEXT', 'STD_ST') if key == 'hud' else ('PROJ_ADD', 'PROJ_CTY', 'PROJ_ST')
    accepted_cities = {norm(rec['legal_city']), norm(rec['input']['postal_city'])}
    return norm(row.get(address)) == street and norm(row.get(city_field)) in accepted_cities and row.get(state) == rec['input']['state']


def positive_int(value):
    try:
        f = float(value)
        return int(f) if not isinstance(value, bool) and f.is_integer() and f > 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def comparison(fact, current, value):
    if fact not in {'built','units','owner_occupied','subsidised','use_class','owner_type'}:
        return 'not_an_I3_fact'
    if current is None:
        return 'fills_missing'
    if current == value:
        return 'agrees'
    if fact in ('built', 'units'):
        low, high = ('from', 'to') if fact == 'built' else ('min', 'max')
        if value[low] >= current[low] and (current[high] is None or value[high] <= current[high]):
            return 'narrows_range'
    return 'review_difference'


def record_url(key, source, row, envelope):
    if source['kind'] == 'arcgis':
        return source['api'] + '/query?' + urlencode({'f': 'json', 'objectIds': row['OBJECTID'],
            'outFields': ','.join(source['fields']), 'returnGeometry': 'false'})
    if key == 'sf':
        return source['api'] + '?' + urlencode({'$select': ','.join(source['fields']),
            '$where': 'row_id=' + sql_string(row['row_id'])})
    return envelope['source_url']


def lead(rec, key, source, envelope, row, fact, value, field, meaning, limitation):
    current = rec['facts'].get(fact)
    identifiers = ('AIN', 'APN', 'PROP_ID', 'row_id', 'PROPERTY_ID', 'HUD_ID', 'APPROVAL_ID')
    record_id = next((str(row[k]) for k in identifiers if row.get(k) is not None), '')
    return {'fact': fact, 'value': value, 'meaning': meaning, 'source_id': key,
            'source_field': field, 'source_fields': {field: row.get(field)},
            'source_record_id': record_id,
            'source_url': record_url(key, source, row, envelope), 'publisher_url': source['publisher'],
            'response_sha256': envelope['sha256'], 'retrieved_at': envelope['retrieved_at'],
            'source_period': row.get('FY', row.get('Roll_Year', row.get('closed_roll_year'))),
            'source_record_updated_at': row.get('LAST_UPDT_DTTM'),
            'comparison': comparison(fact, current, value),
            'current_value': current, 'automatic_promotion': False, 'limitation': limitation}


def make_leads(key, source, envelope, row, rec):
    result = []
    def add(fact, value, field, meaning, limitation):
        result.append(lead(rec, key, source, envelope, row, fact, value, field, meaning, limitation))
    years, units = [], []
    if key == 'la':
        occupied_lines = [i for i in range(1, 6) if positive_int(row.get(f'YearBuilt{i}')) or positive_int(row.get(f'Units{i}'))]
        # Several building lines are not interchangeable with the queried building.
        if len(occupied_lines) == 1:
            i = occupied_lines[0]; years = [f'YearBuilt{i}']; units = [f'Units{i}']
    elif key == 'ma':
        years, units = ['YEAR_BUILT'], ['UNITS']
    elif key == 'sdparcels':
        units = ['UNITQTY']
    elif key == 'sf':
        years, units = ['year_property_built'], ['number_of_units']
        if positive_int(row.get('homeowner_exemption_value')):
            add('owner_occupied', True, 'homeowner_exemption_value', 'tax_exemption_proxy',
                'Tax-roll exemption only; does not establish current owner occupancy or the legal exception.')
    elif key == 'hud':
        units = ['TOTAL_UNIT_COUNT']
        if positive_int(row.get('TOTAL_ASSISTED_UNIT_COUNT')) or row.get('HAS_USE_RESTRICTION_IND') == 'Y':
            field = 'TOTAL_ASSISTED_UNIT_COUNT' if positive_int(row.get('TOTAL_ASSISTED_UNIT_COUNT')) else 'HAS_USE_RESTRICTION_IND'
            add('subsidised', True, field, 'housing_program_evidence',
                'Property-level HUD assistance/restriction. Verify program, covered units, restriction dates and relevance to the cited rule; no match never means unsubsidised.')
        if row.get('OCCUPANCY_DATE'):
            add('occupancy_record', {'date': dt.datetime.fromtimestamp(row['OCCUPANCY_DATE'] / 1000, dt.timezone.utc).date().isoformat()}, 'OCCUPANCY_DATE', 'hud_reported_occupancy',
                'HUD administrative occupancy field; not verified as original municipal occupancy approval.')
    elif key == 'lihtc':
        units = ['N_UNITS']
        if positive_int(row.get('YR_PIS')):
            add('program_service_year', int(row['YR_PIS']), 'YR_PIS', 'lihtc_placed_in_service_year',
                'Tax-credit project placed-in-service year; may be rehabilitation, not original construction or municipal occupancy.')
        add('subsidised', True, 'HUD_ID', 'historical_lihtc_listing',
            'Historical project participation; no current affordability period or unit scope established by this layer.')
    elif key == 'sd':
        add('permit_event', {f: row.get(f) for f in ['APPROVAL_ID','APPROVAL_TYPE','APPROVAL_STATUS','APPROVAL_ISSUE_DATE','APPROVAL_CLOSE_DATE','APPROVAL_DU_NET_CHANGE']}, 'APPROVAL_ID', 'permit_activity',
            'An issued permit or its closure is not original occupancy, completion of new construction or current dwelling count. Net change is proposed project data.')
    for field in years:
        year = positive_int(row.get(field))
        if year and 1500 <= year <= int(envelope['retrieved_at'][:4]):
            add('built', {'from': f'{year}-01-01', 'to': f'{year}-12-31'}, field, 'assessor_construction_year',
                'Assessor year, possibly blended/revised. Not original occupancy approval; current parcel record does not prove historical configuration.')
    for field in units:
        n = positive_int(row.get(field))
        if n:
            add('units', {'min': n, 'max': n}, field, 'assessor_or_project_unit_count',
                'Verify building identity and residential scope; parcel/project can contain multiple buildings, and MassGIS UNITS can include commercial/storage units.')
    return result


def save_envelope(path, url, raw, data, **extra):
    result = {'source_url': url, 'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'sha256': response_hash(data), 'transport_sha256': hashlib.sha256(raw).hexdigest(),
              'response': data, **extra}
    path.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')


def fetch(key, source, recs, directory):
    pol, delay = policy(source)
    (directory / f'{key}-policy.json').write_text(json.dumps(pol, indent=2) + '\n')
    if key == 'sd':
        for year in (2024, 2025, 2026):
            time.sleep(delay)
            url = source['api'] + f'approvals_issued_{year}_datasd.csv'
            raw = get(url, limit=60_000_000)
            reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
            if not set(source['fields']) <= set(reader.fieldnames or []):
                raise ValueError('CSV schema changed')
            # Full official download processed locally; persist only sample matches
            # and whitelisted building fields, never permit holders or contacts.
            rows, scanned = [], 0
            for original in reader:
                scanned += 1
                row = {f: original.get(f) for f in source['fields']}
                if any(matches(key, row, rec) for rec in recs):
                    rows.append(row)
            rows_from(rows, source)
            save_envelope(directory / f'sd-{year}-records.json', url, raw, rows,
                          rows_scanned=scanned, retention='selected sample rows and explicit fields only')
            print(key, year, 'matched permits', len(rows), flush=True)
    elif key == 'lihtc':
        pages, requests = [], []
        for start in range(0, len(recs), 80):
            time.sleep(delay)
            url = query(key, source, recs[start:start + 80])
            base, params = url.split('?', 1)
            with urlopen(Request(base, data=params.encode(), headers={'User-Agent': UA}), timeout=45) as r:
                raw = r.read(8_000_001)
            if len(raw) > 8_000_000:
                raise ValueError('Response too large')
            data = json.loads(raw)
            rows_from(data, source)
            pages.extend(data['features'])
            requests.append({'source_url': url, 'transport_sha256': hashlib.sha256(raw).hexdigest()})
        # A source row can be returned by several prefix batches.
        features = {r['attributes']['OBJECTID']: r for r in pages}
        data = {'features': [features[k] for k in sorted(features)]}
        env = {'source_url': source['api'], 'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
               'sha256': response_hash(data), 'requests': requests, 'response': data}
        (directory / f'{key}-records.json').write_text(json.dumps(env, indent=2, sort_keys=True) + '\n')
        print(key, 'downloaded rows', len(features), flush=True)
    else:
        time.sleep(delay)
        url = query(key, source, recs)
        # Long ArcGIS where expressions use the documented form POST query API.
        if len(url) > 1800 and source['kind'] == 'arcgis':
            base, params = url.split('?', 1)
            with urlopen(Request(base, data=params.encode(), headers={'User-Agent': UA}), timeout=45) as r:
                raw = r.read(8_000_001)
            if len(raw) > 8_000_000:
                raise ValueError('Response too large')
        else:
            raw = get(url)
        data = json.loads(raw)
        rows = rows_from(data, source)
        save_envelope(directory / f'{key}-records.json', url, raw, data)
        print(key, 'downloaded rows', len(rows), flush=True)


def replay(key, source, recs, directory):
    paths = [directory / f'sd-{y}-records.json' for y in (2024, 2025, 2026)] if key == 'sd' else [directory / f'{key}-records.json']
    envelopes = [json.loads(p.read_text()) for p in paths]
    for index, e in enumerate(envelopes):
        if key == 'sd' and e['source_url'] != source['api'] + f'approvals_issued_{(2024,2025,2026)[index]}_datasd.csv':
            raise ValueError('Unexpected CSV source URL')
        if e['sha256'] != response_hash(e['response']):
            raise ValueError('Pinned source hash mismatch')
        if key == 'lihtc':
            expected = [query(key, source, recs[i:i+80]) for i in range(0, len(recs), 80)]
            if [r['source_url'] for r in e['requests']] != expected:
                raise ValueError('Query/sample changed; fetch a new snapshot')
        if key not in ('sd', 'lihtc') and e['source_url'] != query(key, source, recs):
            raise ValueError('Query/sample changed; explicitly fetch a new snapshot')
    rows = [(e, r) for e in envelopes for r in rows_from(e['response'], source)]
    result = {}
    for rec in recs:
        found = [(e, r) for e, r in rows if matches(key, r, rec)]
        # SD legitimately has several permit events. Property sources require one.
        ambiguous = len(found) > 1 and key != 'sd'
        ranged = key == 'sf' and any(sf_address(r)[1] for _, r in found)
        status = 'none' if not found else 'ambiguous' if ambiguous else 'address_range_candidate' if ranged else 'normalized_address'
        leads = [] if ambiguous or ranged else [l for e, r in found for l in make_leads(key, source, e, r, rec)]
        result[rec['address_id']] = {'match': status, 'records': [r for _, r in found], 'leads': leads,
                                   'candidate_count': len(found)}
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fetch', nargs='+', choices=['la','ma','sf','hud','lihtc','sd','sdparcels'])
    p.add_argument('--input', type=Path, default=ROOT / 'out/addresses.resolved.json')
    p.add_argument('--directory', type=Path, default=DIRECTORY)
    a = p.parse_args()
    sources = json.loads((a.directory / 'sources.json').read_text())['sources']
    addresses = F.load(a.input)
    for key in a.fetch or []:
        fetch(key, sources[key], scope(sources[key], addresses), a.directory)
    output, summary = {}, {}
    for key, source in sources.items():
        required = a.directory / ('sd-2024-records.json' if key == 'sd' else f'{key}-records.json')
        if not required.exists():
            summary[key] = {'status': 'not_acquired'}
            continue
        results = replay(key, source, scope(source, addresses), a.directory)
        summary[key] = {'addresses_queried': len(results), 'match_counts': dict(Counter(r['match'] for r in results.values())),
                        'leads': sum(len(r['leads']) for r in results.values()),
                        'missing_fact_leads': sum(l['comparison']=='fills_missing' for r in results.values() for l in r['leads'])}
        for aid, result in results.items():
            out = output.setdefault(aid, {'sources': {}, 'leads': []})
            out['sources'][key] = result
            out['leads'].extend(result['leads'])
    nj = json.loads((a.directory / 'nj-modiv.json').read_text())
    input_hash = hashlib.sha256(a.input.read_bytes()).hexdigest()
    if nj['input_sha256'] != input_hash:
        raise ValueError('NJ/I3 snapshot mismatch; replay NJ against this input first')
    for aid, result in nj['addresses'].items():
        out = output.setdefault(aid, {'sources': {}, 'leads': []})
        out['sources']['nj'] = result
        out['leads'].extend(result['leads'])
    summary['nj'] = nj['summary']
    by_city = {}
    for aid, rec in addresses.items():
        city = by_city.setdefault(rec['jurisdictions']['city'], {'sample_addresses': 0, 'with_source_records': 0, 'with_evidence_leads': 0})
        city['sample_addresses'] += 1
        evidence = output.get(aid, {'sources': {}, 'leads': []})
        city['with_source_records'] += int(any(s.get('candidate_count', 0) for s in evidence['sources'].values()))
        city['with_evidence_leads'] += int(bool(evidence['leads']))
    payload = {'as_of': None, 'not_legal_advice': True, 'input_sha256': input_hash,
               'coverage_by_city': by_city,
               'date_scope': 'Source snapshots; no claim that records establish past or future building configuration.',
               'facts_promoted': 0, 'summary': summary, 'addresses': dict(sorted(output.items()))}
    lines = ['{'] + ['  ' + json.dumps(k) + ': ' + json.dumps(v, sort_keys=True) + ',' for k, v in payload.items() if k != 'addresses']
    lines += ['  \"addresses\": {', ',\n'.join('    ' + json.dumps(aid) + ': ' + json.dumps(row, sort_keys=True) for aid, row in payload['addresses'].items()), '  }', '}']
    (a.directory / 'public-evidence.json').write_text('\n'.join(lines) + '\n')
    print(json.dumps(summary, sort_keys=True))


if __name__ == '__main__':
    main()
