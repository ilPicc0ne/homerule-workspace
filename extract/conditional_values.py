"""Preserve rent-denominated deposit caps extracted as supporting provisions.

This is deliberately bounded: same cited section, deposit cap wording, a rent-month
amount, and an explicit applicability condition. Other supporting duties remain
searchable details, not alternative amounts. No rule IDs, legal thresholds or
jurisdictions are supplied by this module.
"""
import copy
import re

NUMBERS = {w: n for n, w in enumerate(('zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'))}
RENT_MONTHS = re.compile(r"\b(\d+(?:\.\d+)?|" + '|'.join(NUMBERS) + r")\s+month(?:s[’']?|[’']s)?\s+(?:of\s+)?rent\b", re.I)


def rent_months(value):
    m = RENT_MONTHS.match(value or '')
    if not m:
        return None
    token = m[1].lower()
    return NUMBERS[token] if token in NUMBERS else float(token)


def scoped_condition(node):
    """Owner-wide counts cannot be tested against this building's unit count."""
    node = copy.deepcopy(node)
    if node.get('fact') == 'units' and re.search(r'collectively|in total|across|owned by', node.get('quote') or '', re.I):
        return {'kind': 'unparsed', 'quote': node['quote']}
    if node.get('children'):
        node['children'] = [scoped_condition(n) for n in node['children']]
    return node


def add_detail(main, obligation, evidence, same_section):
    """Keep every condition with its evidence; promote only bounded deposit caps."""
    detail = {k: copy.deepcopy(obligation.get(k)) for k in (
        'provision', 'citation', 'requirement', 'key_value', 'coverage_conditions',
        'exemptions', 'applies_if', 'exempt_if', 'key_value_conditions', 'tenant_conditions')}
    detail.update(evidence)
    main['details'].append(detail)
    amount, default = rent_months(detail['key_value']), rent_months(main.get('key_value'))
    cond = detail.get('applies_if') or {'kind': 'always'}
    if not (same_section and main['category'] == 'security_deposits' and amount is not None
            and default is not None and amount != default and detail.get('quote') and cond['kind'] not in ('always', 'never')
            and re.search(r'(?:may|shall|must) not (?:demand|receive|require|collect|charge)', detail['requirement'] or '', re.I)):
        return
    conditions = [scoped_condition(cond)]
    exempt = detail.get('exempt_if') or {'kind': 'never'}
    if exempt['kind'] != 'never':
        conditions.append({'kind': 'not', 'children': [scoped_condition(exempt)]})
    # Tenant facts are never collected as building inputs. Keep their qualifications
    # executable as unknown rather than deciding the branch while ignoring them.
    notes = [t['text'] for t in detail.get('tenant_conditions') or []]
    conditions.extend({'kind': 'unparsed', 'quote': t.get('quote') or t['text']}
                      for t in detail.get('tenant_conditions') or [])
    branch = {'value': detail['key_value'], 'when': {'kind': 'all', 'children': conditions},
              'tenant_note': ' '.join(notes) or None,
              'evidence': {k: detail.get(k) for k in ('provision', 'citation', 'source_doc_id', 'quote')}}
    if not any(b['value'] == branch['value'] and b['when'] == branch['when'] for b in main['key_value_conditions']):
        main['key_value_conditions'].append(branch)
