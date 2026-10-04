"""Find useful next building facts by re-running the existing engine, offline.

This is an investigation plan, never a mutation of I3 or the scored outputs.
Each branch is hypothetical and preserves all other unknowns. It ranks reductions
in unresolved rule/value answers, not increases in a renter-protection score.
"""
import argparse
import copy
import datetime as dt
import hashlib
import json
from collections import Counter
from pathlib import Path

from engine import build as B, facts as F, rules as R

ROOT = R.ROOT
VOCAB = {f['name']: f for f in json.loads((ROOT / 'contracts/facts.json').read_text())['facts']}
QUESTIONS = {
    'built': 'Which building date does the cited rule require, and what record establishes it?',
    'units': 'How many residential units are in this building?',
    'use_class': 'What is the residential use of this building?',
    'subsidised': 'Is this building subject to an affordability restriction relevant to the cited rule?',
    'owner_type': 'What ownership type is relevant to the cited exception?',
    'owner_occupied': 'Does the owner live in the building under the conditions in the cited rule?',
}
GUIDANCE = {
    'built': 'Ask the building department for the original occupancy record. An assessor construction year is a lead, not proof of the first certificate-of-occupancy date.',
    'units': 'Check a building-specific assessor or occupancy record. A parcel can contain several buildings; proposed units in a permit are not an existing unit count.',
    'use_class': 'Check the assessor use classification and any later conversion or occupancy records.',
    'subsidised': 'Check the recorded restriction or housing-program record. Absence from one list does not establish that there is no restriction.',
    'owner_type': 'Ask the housing office which ownership evidence is needed. Do not infer ownership type from a name.',
    'owner_occupied': 'Ask which evidence establishes owner occupancy at the relevant date. A tax exemption is only a lead.',
}
ROUTES_PATH = ROOT / 'data/building-evidence/research_routes.json'


def research_routes(rec, fact):
    if not ROUTES_PATH.exists():
        return []
    catalog = json.loads(ROUTES_PATH.read_text())
    return [{**r, 'retrieved_at': catalog['retrieved_at']} for r in catalog['routes']
            if r['jurisdiction'] in rec['stack'] and fact in r['facts']]


def nodes(node):
    yield node
    for child in node.get('children') or []:
        yield from nodes(child)


def rule_nodes(rule):
    for node in [rule['applies_if'], rule['exempt_if']] + [b['when'] for b in rule.get('key_value_conditions', [])]:
        yield from nodes(node)


def used_fact(node):
    return 'built' if node.get('kind') == 'age_years' else node.get('fact')


def partitions(fact, rec, rules, as_of):
    """All truth-equivalent intervals for supported comparisons, clipped to I3.

    No guessed distribution: every interval is a possible answer, not a likely one.
    Include threshold singletons, so eq/ne and strict comparisons stay distinct.
    """
    spec, known = VOCAB[fact], rec['facts'].get(fact)
    if spec['type'] in ('bool', 'enum'):
        if known is not None:
            return []
        return [{'value': v, 'label': str(v).lower()} for v in (
            [False, True] if spec['type'] == 'bool' else spec['values'])]
    date = spec['type'] == 'date_range'
    to_num = (lambda v: dt.date.fromisoformat(v).toordinal()) if date else int
    lo = to_num(known['from'] if date else known['min']) if known else (1 if date else 0)
    hi_value = (known['to'] if date else known['max']) if known else None
    hi = to_num(hi_value) if hi_value is not None else (dt.date.max.toordinal() if date else None)
    if lo == hi:
        return []
    cuts = {lo}
    for rule in rules:
        for n in rule_nodes(rule):
            if used_fact(n) != fact:
                continue
            if n.get('kind') == 'age_years':
                a = dt.date.fromisoformat(as_of)
                try:
                    value = a.replace(year=a.year - int(n['years'])).isoformat()
                except ValueError:
                    value = a.replace(year=a.year - int(n['years']), day=28).isoformat()
            else:
                value = n.get('date') if n.get('kind') == 'date_fact' else n.get('value')
            if value is None:
                continue
            try:
                t = to_num(value)
            except (TypeError, ValueError):
                continue
            for cut in (t, t + 1):
                if cut > lo and (hi is None or cut <= hi):
                    cuts.add(cut)
    starts, out = sorted(cuts), []
    for i, start in enumerate(starts):
        end = starts[i + 1] - 1 if i + 1 < len(starts) else hi
        if date:
            value = {'from': dt.date.fromordinal(start).isoformat(),
                     'to': dt.date.fromordinal(end).isoformat()}
            label = f"{value['from']} through {value['to']}"
        else:
            value = {'min': start, 'max': end}
            label = str(start) if start == end else f'{start}–{end if end is not None else "unbounded"}'
        out.append({'value': value, 'label': label})
    return out


def unresolved(rows):
    """Separate unresolved coverage from conditional numeric/formula answers."""
    out = set()
    for rid, row in rows.items():
        if row['result'] == 'unknown':
            out.add((rid, 'coverage'))
        if row['result'] in ('applies', 'unknown', 'superseded') and isinstance(row.get('value'), dict):
            out.add((rid, 'value'))
    return out


def evaluate(rules, rec, as_of):
    return {r['team_rule_id']: r for r in B.evaluate_address(rules, rec, as_of, {r['id']: r for r in rules})}


def plan_address(rules, rec, as_of, evidence=(), score_context=None):
    baseline = evaluate(rules, rec, as_of)
    open_answers = unresolved(baseline)
    state, city = rec['jurisdictions'].get('state'), rec['jurisdictions'].get('city')
    stack = [r for r in rules if r['jurisdiction_id'] in (state, city)]
    by_id = {r['id']: r for r in stack}
    questions = []
    for fact in sorted({used_fact(n) for r in stack for n in rule_nodes(r)} & VOCAB.keys()):
        branches = []
        for part in partitions(fact, rec, stack, as_of):
            hypothetical = copy.deepcopy(rec)
            hypothetical['facts'][fact] = part['value']
            hypothetical.setdefault('source_detail', {})[fact] = 'Hypothetical answer, not verified evidence'
            result = evaluate(rules, hypothetical, as_of)
            resolved = sorted(open_answers - unresolved(result))
            branches.append({**part, 'resolved': [{'rule_id': rid, 'aspect': aspect,
                              'result': result.get(rid, {}).get('result', 'not_applicable')}
                             for rid, aspect in resolved]})
        if not branches or not any(b['resolved'] for b in branches):
            continue  # Do not ask about unknowns masked by another decisive condition.
        ids = sorted({r['rule_id'] for b in branches for r in b['resolved']})
        questions.append({
            'fact': fact, 'question': QUESTIONS[fact], 'how_to_check': GUIDANCE[fact],
            'public_record_routes': research_routes(rec, fact),
            'request_text': f"I am looking for records for {rec['input']['street_address']}, {rec['legal_city']}. "
                            + QUESTIONS[fact] + ' Please identify the record and the period it describes.',
            'current_value': rec['facts'].get(fact),
            'resolution_count': {'minimum': min(len(b['resolved']) for b in branches),
                                 'maximum': max(len(b['resolved']) for b in branches)},
            'topics': sorted({by_id[r]['category'] for r in ids}),
            'unsettled_score_topics': sorted({by_id[r]['category'] for r in ids}
                                             & set((score_context or {}).get('unknown_topics', []))),
            'rules': [{'rule_id': rid, 'citation': by_id[rid].get('citation'),
                       'source_url': by_id[rid].get('source_url'),
                       'quote': by_id[rid].get('requirement_quote')} for rid in ids],
            'condition_tests': [{'rule_id': r['id'], 'node': n} for r in stack
                                for n in rule_nodes(r) if used_fact(n) == fact],
            'branches': branches,
            'evidence_leads': [e for e in evidence if e['fact'] == fact],
        })
    questions.sort(key=lambda q: (-q['resolution_count']['minimum'], -q['resolution_count']['maximum'], q['fact']))
    blockers = []
    for rid, aspect in sorted(open_answers):
        row, rule = baseline[rid], by_id[rid]
        raw_conditions = sorted({n.get('quote', '') for n in rule_nodes(rule) if n.get('kind') == 'unparsed'})
        blockers.append({'rule_id': rid, 'category': rule['category'], 'aspect': aspect,
                         'missing': row.get('missing', []), 'unparsed_conditions': raw_conditions,
                         'tenant_conditions': rule.get('tenant_conditions', []),
                         'effective_date_uncertainty': row.get('flags', {}),
                         'invalid': row.get('invalid', [])})
    # Tenant conditions can remain even when building-level coverage is known.
    tenant_notes = [{'rule_id': rid, 'category': by_id[rid]['category'], 'conditions': by_id[rid]['tenant_conditions']}
                    for rid, row in baseline.items() if by_id[rid].get('tenant_conditions')
                    and row['result'] in ('applies', 'unknown', 'superseded')]
    return {'address_id': rec['address_id'], 'as_of': as_of, 'not_legal_advice': True,
            'hypothetical_only': True, 'baseline_unresolved_answers': len(open_answers),
            'next_question': questions[0]['fact'] if questions else None, 'questions': questions,
            'blockers': blockers, 'tenant_notes': tenant_notes,
            'assumptions': rec.get('assumptions', []),
            'score_context': score_context, 'score_effect': 'not_calculated'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--as-of', default='2026-10-01')
    p.add_argument('--input-dir', type=Path, default=ROOT / 'out')
    p.add_argument('--output', type=Path, default=ROOT / 'out/fact_gaps.json')
    p.add_argument('--evidence', type=Path, default=ROOT / 'data/building-evidence/nj-modiv.json')
    p.add_argument('--scores', type=Path, help='Optional score-branch out/scores.json; contextual join only, no score recomputation')
    a = p.parse_args()
    dt.date.fromisoformat(a.as_of)
    names = ('rules.compiled.json', 'rules.json', 'findings.json', 'addresses.resolved.json')
    hashes = {name: hashlib.sha256((a.input_dir / name).read_bytes()).hexdigest() for name in names}
    rules, addresses = R.load(a.input_dir), F.load(a.input_dir / 'addresses.resolved.json')
    evidence_payload = json.loads(a.evidence.read_text()) if a.evidence.exists() else {}
    if evidence_payload and evidence_payload['input_sha256'] != hashes['addresses.resolved.json']:
        raise ValueError('Evidence uses a different I3 snapshot; replay enrichment against these addresses first')
    evidence = evidence_payload.get('addresses', {})
    scores = json.loads(a.scores.read_text()) if a.scores else {}
    plans = {aid: plan_address(rules, rec, a.as_of, evidence.get(aid, {}).get('leads', []),
                               scores.get('address:' + aid, {}).get(a.as_of))
             for aid, rec in sorted(addresses.items())}
    summary = {'addresses': len(plans), 'with_question': sum(bool(p['questions']) for p in plans.values()),
               'next_fact_counts': dict(Counter(p['next_question'] for p in plans.values() if p['next_question'])),
               'tenant_notes_addresses': sum(bool(p['tenant_notes']) for p in plans.values())}
    if any(hashes[name] != hashlib.sha256((a.input_dir / name).read_bytes()).hexdigest() for name in names):
        raise ValueError('Inputs changed while planning; re-run against one stable snapshot')
    result = {'as_of': a.as_of, 'not_legal_advice': True,
              'method': 'Counterfactual partitions of one building fact at a time; rank worst-case then best-case reduction in unresolved rule/value answers. No probabilities or score uplift assumed.',
              'limits': ['Building-level hypotheses, not a determination about a tenant.',
                         'Unparsed and tenant conditions stay unresolved; public records cannot answer them automatically.',
                         'An assessor year is not an occupancy date. All evidence leads need semantic and date review.',
                         'Does not search joint combinations of several missing facts. No useful single question does not mean no useful investigation.',
                         'Known facts may contain named assumptions; this planner does not validate those assumptions.'],
              'score_input_sha256': hashlib.sha256(a.scores.read_bytes()).hexdigest() if a.scores else None,
              'score_context_note': 'Optional scores must be generated from the same I2/I3 inputs. Their current format has no input hashes, so the planner cannot certify that alignment.',
              'input_sha256': hashes, 'summary': summary, 'addresses': plans}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    # One address per line, like the score artifact, to keep generated diffs usable.
    lines = ['{'] + ['  ' + json.dumps(k) + ': ' + json.dumps(v, sort_keys=True) + ','
                     for k, v in result.items() if k != 'addresses']
    lines += ['  "addresses": {', ',\n'.join('    ' + json.dumps(aid) + ': ' + json.dumps(plan, sort_keys=True)
                                            for aid, plan in plans.items()), '  }', '}']
    a.output.write_text('\n'.join(lines) + '\n')
    print(json.dumps(summary, sort_keys=True))


if __name__ == '__main__':
    main()
