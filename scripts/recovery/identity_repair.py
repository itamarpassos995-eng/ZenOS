"""Explicit, snapshot-bound identity mappings. Never guesses foreign keys."""
import copy
import json
from pathlib import Path
from backup_readonly_v2 import digest


def load_reviews():
    return json.loads(Path(__file__).with_name('reviewed_identity_mappings.json').read_text())['reviews']


def reviewed_repairs(backup, operation):
    duplicate=False
    for field,value in operation['fields'].items():
        seen=set()
        for record in value.get('arrayValue',{}).get('values',[]):
            identifier=record.get('mapValue',{}).get('fields',{}).get('id',{})
            raw=identifier.get('integerValue',identifier.get('stringValue'))
            if raw is None:continue
            if str(raw) in seen:duplicate=True
            seen.add(str(raw))
    if not duplicate:return {}
    review=next((r for r in load_reviews() if r['store']==backup['store']),None)
    if review is None:return {}
    if digest(operation['fields'])!=review['sourceFieldsChecksum']:
        raise ValueError('Reviewed identity mapping differs from source; inspect instead of guessing IDs')
    root=operation['name'].rsplit('/dados/operacao',1)[0]
    if {d['name'] for d in backup['documents']}!={root,operation['name']}:
        raise ValueError('Identity repair has additional documents; inspect all references first')
    repairs=review['repairs'];original_ids=set()
    for r in repairs:
        if r['field'] not in ('clientes','produtos') or not isinstance(r['index'],int) or r['index']<0:
            raise ValueError('Invalid reviewed identity position')
        values=operation['fields'][r['field']]['arrayValue']['values']
        value=values[r['index']]
        if digest(value)!=r['sourceRecordChecksum'] or value['mapValue']['fields']['id']!=r['originalId']:
            raise ValueError('Reviewed identity record differs; no mapping applied')
        old=r['originalId'].get('integerValue',r['originalId'].get('stringValue'))
        if not old or not isinstance(r['newId'],str) or not r['newId']:
            raise ValueError('Invalid reviewed identity values')
        original_ids.add(str(old))
        ids=[v.get('mapValue',{}).get('fields',{}).get('id') for v in values]
        if ids.count(r['originalId'])<2 or {'stringValue':r['newId']} in ids:
            raise ValueError('Expected duplicate or unique replacement missing')
    def contains_reference(value):
        if isinstance(value,list):return any(contains_reference(v) for v in value)
        if not isinstance(value,dict):return False
        for key in ('integerValue','stringValue'):
            if key in value and str(value[key]) in original_ids:return True
        return any(contains_reference(v) for v in value.values())
    for d in backup['documents']:
        fields=copy.deepcopy(d.get('fields',{}))
        if d['name']==operation['name']:
            # Only the top-level identities being disambiguated may repeat.
            # Histories, bills, stock movements and nested foreign keys cannot.
            for field in ('clientes','produtos'):
                for value in fields.get(field,{}).get('arrayValue',{}).get('values',[]):
                    value.get('mapValue',{}).get('fields',{}).pop('id',None)
        if contains_reference(fields):
            raise ValueError('Ambiguous reference to repeated identity; manual reconciliation required')
    grouped={}
    for r in repairs:grouped.setdefault(r['field'],[]).append(copy.deepcopy(r))
    return grouped


def mapped_record(field,index,value,repairs):
    mapped=copy.deepcopy(value)
    for r in repairs.get(field,[]):
        if r['index']==index:
            mapped['mapValue']['fields']['id']={'stringValue':r['newId']}
    return mapped


def original_record(index,value,repairs):
    original=copy.deepcopy(value)
    for r in repairs:
        if r['index']==index:
            fields=original.get('mapValue',{}).get('fields',{})
            if fields.get('id')!={'stringValue':r['newId']}:
                raise ValueError('Mapped V2 identity differs from reviewed replacement')
            fields['id']=copy.deepcopy(r['originalId'])
            if digest(original)!=r['sourceRecordChecksum']:
                raise ValueError('Mapped entity content differs from original record')
    return original
