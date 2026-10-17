#!/usr/bin/env python3
"""Resume a create-only V2 stage and certify its head, loopback demo ONLY.
Requires a previously restored V1. No production override or activation flag.
"""
import argparse
import json
from backup_readonly_v2 import digest, verify
from emulator_restore import call, DB
from v2_plan import plan_v2, reconstruct_fields, string, integer


def typed(value):
    if value is None:
        return {'nullValue': None}
    if isinstance(value, bool):
        return {'booleanValue': value}
    if isinstance(value, str):
        return string(value)
    if isinstance(value, int):
        return integer(value)
    if isinstance(value, list):
        return {'arrayValue': {'values': [typed(x) for x in value]}}
    if isinstance(value, dict):
        return {'mapValue': {'fields': {k: typed(v) for k, v in value.items()}}}
    raise ValueError('Unsupported certificate value')


def stage(backup, interrupt_after=None):
    verify(backup)
    plan = plan_v2(backup)
    root = DB + '/documents/lojas/recovery-' + backup['checksum'][:24]
    target = root + '/v2_generations/' + plan['generation']
    op_path = root + '/dados/operacao'
    before = call('GET', op_path)
    if not before or digest(before['fields']) != plan['sourceFieldsChecksum']:
        raise RuntimeError('Emulator V1 differs from verified source')
    existing_head = call('GET', target)
    if existing_head and existing_head['fields'].get('sequence') != integer(0):
        raise RuntimeError('Generation already has operations; refusing replay of migration')
    mapped = [{'name': target + d['name'][len(plan['targetRoot']):], 'fields': d['fields']}
              for d in plan['documents']]
    written = 0
    for start in range(0, len(mapped), 100):
        writes = []
        for d in mapped[start:start+100]:
            got = call('GET', d['name'])
            if got:
                if digest(got['fields']) != digest(d['fields']):
                    raise RuntimeError('Divergent destination preserved; refusing overwrite')
            else:
                writes.append({'update': d, 'currentDocument': {'exists': False}})
        if writes:
            call('POST', DB + '/documents:commit', {'writes': writes})
            written += len(writes)
        if interrupt_after is not None and start + 100 >= interrupt_after:
            return {'interruptedBeforeReady': True, 'entityWrites': written}
    recovered = {**plan, 'documents': []}
    for original, d in zip(plan['documents'], mapped):
        got = call('GET', d['name'])
        if not got or digest(got['fields']) != digest(d['fields']):
            raise RuntimeError('Round-trip document mismatch')
        recovered['documents'].append({'name': original['name'], 'fields': got['fields']})
    if digest(reconstruct_fields(recovered)) != plan['sourceFieldsChecksum']:
        raise RuntimeError('Lossless reconstruction failed')
    if before != call('GET', op_path):
        raise RuntimeError('V1 changed during stage; do not activate')
    fields = typed({'schema': 2, 'state': 'ready', 'sequence': 0,
        'sourceChecksum': backup['checksum'], 'sourceFieldsChecksum': plan['sourceFieldsChecksum'],
        'fieldManifest': plan['fieldManifest']})['mapValue']['fields']
    source = next(d for d in backup['documents'] if d['name'].endswith('/dados/operacao'))
    fields['fieldRevisions'] = source['fields'].get('_syncMeta', {}).get('mapValue', {}).get('fields', {}).get('fieldRevisions', typed({}))
    head = {'name': target, 'fields': fields}
    if existing_head:
        if digest(existing_head['fields']) != digest(fields):
            raise RuntimeError('Head differs; refusing overwrite')
        head_writes = 0
    else:
        call('POST', DB + '/documents:commit', {'writes': [{'update': head, 'currentDocument': {'exists': False}}]})
        head_writes = 1
    return {'entityWrites': written, 'headWrites': head_writes, 'compared': len(mapped),
            'allFieldsAndTypesPreserved': True, 'v1Untouched': True, 'activationWritten': False,
            'productionRequests': 0, 'generation': plan['generation']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup')
    parser.add_argument('--check-resume', action='store_true')
    args = parser.parse_args()
    with open(args.backup) as source:
        backup = json.load(source)
    if args.check_resume:
        from emulator_restore import restore
        restore(backup)
        partial = stage(backup, interrupt_after=200)
        ready = stage(backup)
        replay = stage(backup)
        assert partial['entityWrites'] == 200
        assert ready['entityWrites'] == 1057
        assert replay['entityWrites'] == replay['headWrites'] == 0
        print(json.dumps({'partial': partial, 'resumed': ready, 'replay': replay}, indent=2))
    else:
        print(json.dumps(stage(backup), indent=2))
