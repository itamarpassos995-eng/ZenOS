#!/usr/bin/env python3
"""Full backup restoration + V2 copy-only/replay/round-trip check, loopback only."""
import argparse
import copy
import json
from backup_readonly_v2 import digest
from emulator_restore import restore, call, DB
from v2_plan import plan_v2, reconstruct_fields


def check(backup):
    restored = restore(backup)
    plan = plan_v2(backup)
    target_root = restored['targetRoot']
    source_op_path = target_root + '/dados/operacao'
    before = call('GET', source_op_path)
    target_generation = target_root + '/v2_generations/' + plan['generation']
    mapped = []
    for d in plan['documents']:
        mapped.append({'name': target_generation + d['name'][len(plan['targetRoot']):],
                       'fields': d['fields']})

    def copy_only():
        writes = []
        for d in mapped:
            existing = call('GET', d['name'])
            if existing is not None:
                if digest(existing.get('fields', {})) != digest(d['fields']):
                    raise RuntimeError('Destination differs: refusing overwrite')
                continue
            writes.append({'update': d, 'currentDocument': {'exists': False}})
        for offset in range(0, len(writes), 100):
            call('POST', DB + '/documents:commit', {'writes': writes[offset:offset + 100]})
        return len(writes)

    first = copy_only()
    replay = copy_only()
    if replay != 0:
        raise RuntimeError('Idempotence failed')
    recovered = copy.deepcopy(plan)
    recovered['documents'] = []
    for d, target in zip(plan['documents'], mapped):
        got = call('GET', target['name'])
        if got is None or digest(got['fields']) != digest(d['fields']):
            raise RuntimeError('V2 typed document comparison failed')
        recovered['documents'].append({'name': d['name'], 'fields': got['fields']})
    if digest(reconstruct_fields(recovered)) != plan['sourceFieldsChecksum']:
        raise RuntimeError('V2 -> V1 complete reconstruction failed')
    after = call('GET', source_op_path)
    if before != after:
        raise RuntimeError('V1 was modified')
    # Prove a conflicting destination is not overwritten by a replay.
    first_doc = mapped[0]
    changed = {**first_doc, 'fields': {**first_doc['fields'], 'testConflict': {'booleanValue': True}}}
    call('POST', DB + '/documents:commit', {'writes': [{'update': changed}]})
    blocked = False
    try:
        copy_only()
    except RuntimeError as error:
        blocked = 'refusing overwrite' in str(error)
    if not blocked or call('GET', first_doc['name'])['fields'] != changed['fields']:
        raise RuntimeError('Destination conflict protection failed')
    return {**restored, 'v2DocumentsCompared': len(mapped), 'firstCopyWrites': first,
        'replayWrites': replay, 'v1UntouchedIncludingUpdateTime': True,
        'v2ReconstructsAllV1FieldsAndTypes': True, 'destinationConflictBlocked': True,
        'maxTypedDocumentBytes': plan['maxDocumentBytes'],
        'applicationIntegrated': False, 'productionWrites': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup')
    args = parser.parse_args()
    with open(args.backup, encoding='utf-8') as source:
        result = check(json.load(source))
    print(json.dumps(result, indent=2))
