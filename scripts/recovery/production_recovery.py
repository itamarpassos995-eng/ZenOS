#!/usr/bin/env python3
"""Explicit, bounded owner-run pilot recovery. No deletes or V1 writes.

inspect: reads only. fence: preserves active rules, publishes isolated policy,
and creates maintenance control. stage: create-only V2 with complete comparison.
activate: requires confirmed frontend commit and locally verified evidence.
maintenance: disables V2 writes. abort: legacy only before any V2 business commit.
Credentials stay inside this process and are never printed or written to files.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from backup_readonly_v2 import collect, digest, encoded, ReadOnlyAPI, verify, read_deadline
from emulator_stage_v2 import typed
from pilot_rules import generate
from v2_plan import plan_v2, reconstruct_fields, integer


def save_new(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as out:
        out.write(encoded(value)); out.flush(); os.fsync(out.fileno())


def inventory(backup):
    # Administrative control is intentionally new; all original data must match.
    suffix = '/dados/storage_control'
    return {d['name']: digest(d.get('fields', {})) for d in backup['documents']
            if not d['name'].endswith(suffix) and '/v2_generations/' not in d['name']}


def google_token():
    return subprocess.run(['gcloud', 'auth', 'print-access-token'], text=True,
        capture_output=True, stdin=subprocess.DEVNULL, timeout=30, check=True).stdout.strip()


class Transport:
    def __init__(self, token, refresh=None):
        self.token, self.count = token, 0
        self.refresh = refresh
        self.token_time = time.monotonic()

    def renew(self):
        if not self.refresh:
            raise RuntimeError('Credential renewal unavailable; stopped without replaying writes')
        self.token = self.refresh()
        self.token_time = time.monotonic()

    def __call__(self, service, method, resource, body=None):
        self.count += 1
        if self.count > 15000:
            raise RuntimeError('Request budget exceeded')
        if service not in ['firestore', 'firebaserules'] or not resource.startswith('projects/zenos-ac6b2/'):
            raise ValueError('Unexpected destination')
        if method not in ['GET', 'POST', 'PATCH']:
            raise ValueError('Unsupported method; deletes are forbidden')
        url = 'https://' + service + '.googleapis.com/v1/' + urllib.parse.quote(resource, safe='/():')
        if self.refresh and time.monotonic() - self.token_time > 120:
            self.renew()
        for attempt in range(2):
            req = urllib.request.Request(url, method=method,
                data=encoded(body) if body is not None else None,
                headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
            try:
                with read_deadline(), urllib.request.urlopen(req, timeout=30) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if method == 'GET' and error.code == 404:
                    return None
                if method == 'GET' and error.code == 401 and attempt == 0 and self.refresh:
                    print('Renovando credencial para repetir somente a leitura.', flush=True)
                    self.renew()
                    continue
                # Never automatically replay a write, even after HTTP 401.
                raise RuntimeError(f'{service} {method}: HTTP {error.code}; stopped, data preserved') from None
            except (TimeoutError, urllib.error.URLError, ConnectionError):
                raise RuntimeError(f'{service} {method}: connection interrupted; stopped without replaying writes') from None


class Recovery:
    def __init__(self, backup, api, folder, evidence):
        verify(backup)
        if backup['project'] != 'zenos-ac6b2' or not backup['operationUnchangedAtEnd']:
            raise ValueError('Wrong project or changing source')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', backup['store']):
            raise ValueError('Invalid store scope')
        self.backup, self.api, self.folder = backup, api, Path(folder)
        self.plan = plan_v2(backup)
        self.db = 'projects/zenos-ac6b2/databases/(default)'
        self.root = self.db + '/documents/lojas/' + backup['store']
        self.control = self.root + '/dados/storage_control'
        self.target = self.plan['targetRoot']
        self.release = 'projects/zenos-ac6b2/releases/cloud.firestore'
        self.evidence = evidence
        if (evidence.get('backupChecksum') != backup['checksum']
            or evidence.get('passed') != 25 or evidence.get('uiPassed') != 9
            or evidence.get('productionRequests') != 0
            or evidence.get('pilotRules') is not True
            or evidence.get('productionExecutorCorePassed') is not True
            or evidence.get('originalV1Preserved') is not True):
            raise ValueError('Missing verified homologation evidence')

    def get(self, path):
        return self.api('firestore', 'GET', path)

    def commit(self, writes):
        if len(writes) > 100:
            raise ValueError('Write batch exceeds recovery budget')
        for write in writes:
            if set(write) == {'verify', 'currentDocument'}:
                if write['verify'] not in [self.target, self.plan['sourceOperation']]:
                    raise ValueError('Unexpected verification path')
                continue
            if set(write) != {'update', 'currentDocument'}:
                raise ValueError('Only preconditioned updates supported')
            path = write['update']['name']
            if path == self.control:
                pass
            elif path == self.target or path.startswith(self.target + '/'):
                if write['currentDocument'] != {'exists': False}:
                    raise ValueError('V2 migration is create-only')
            else:
                raise ValueError('Writes outside control/new generation are forbidden')
        return self.api('firestore', 'POST', self.db + '/documents:commit', {'writes': writes})

    def live_rules(self):
        release = self.api('firebaserules', 'GET', self.release)
        if not release:
            raise RuntimeError('Active Firestore release missing')
        rules = self.api('firebaserules', 'GET', release['rulesetName'])
        files = rules.get('source', {}).get('files', [])
        if len(files) != 1 or not isinstance(files[0].get('content'), str):
            raise RuntimeError('Unexpected active rules bundle')
        return release, files[0]['content']

    def expected_rules(self):
        original = json.loads((self.folder / 'original-rules.json').read_bytes())
        if original.get('backupChecksum') != self.backup['checksum']:
            raise RuntimeError('Rules backup belongs to another recovery')
        return generate(original['source'], self.backup['store'])

    def require_fence(self):
        _, current = self.live_rules()
        if current != self.expected_rules():
            raise RuntimeError('Isolated pilot rules are not the active release')
        control = self.get(self.control)
        expected = self.plan['generation']
        if not control or control['fields'].get('generation') != typed(expected):
            raise RuntimeError('Missing or different maintenance generation')
        if control['fields'].get('mode') != typed('maintenance'):
            raise RuntimeError('Maintenance is required; no copy/activation attempted')
        return control

    def unchanged(self):
        original = next(d for d in self.backup['documents'] if d['name'] == self.plan['sourceOperation'])
        current = self.get(original['name'])
        if not current or current['updateTime'] != original['updateTime'] or current['fields'] != original['fields']:
            raise RuntimeError('V1 changed since certified backup; stopped without overwriting')
        return current

    def inspect(self):
        self.unchanged()
        _, source = self.live_rules()
        generate(source, self.backup['store'])
        if self.get(self.control):
            raise RuntimeError('Control already exists; inspect/resume its existing recovery')
        return {'preflightPassed': True, 'plannedEntities': len(self.plan['documents']), 'writes': 0}

    def fence(self):
        self.unchanged()
        release, source = self.live_rules()
        saved = self.folder / 'original-rules.json'
        if not saved.exists():
            generate(source, self.backup['store'])
            save_new(saved, {'backupChecksum': self.backup['checksum'], 'release': release, 'source': source})
        expected = self.expected_rules()
        original = json.loads(saved.read_bytes())
        if source != expected:
            if source != original['source'] or release['rulesetName'] != original['release']['rulesetName']:
                raise RuntimeError('Active rules changed; refusing replacement')
            ruleset = self.api('firebaserules', 'POST', 'projects/zenos-ac6b2/rulesets',
                {'source': {'files': [{'name': 'firestore.rules', 'content': expected}]}})
            # Recheck immediately before release; no concurrent rule deployment allowed.
            live, _ = self.live_rules()
            if live['rulesetName'] != release['rulesetName']:
                raise RuntimeError('Concurrent rules deployment detected')
            self.api('firebaserules', 'PATCH', self.release,
                {'release': {'name': self.release, 'rulesetName': ruleset['name']}, 'updateMask': 'rulesetName'})
        _, current = self.live_rules()
        if current != expected:
            raise RuntimeError('Published release could not be verified')
        control = self.get(self.control)
        if control:
            self.require_fence()
        else:
            self.commit([{'update': {'name': self.control, 'fields': typed({
                'mode': 'maintenance', 'generation': self.plan['generation'],
                'sourceChecksum': self.backup['checksum']})['mapValue']['fields']},
                'currentDocument': {'exists': False}}])
        print('Piloto em manutenção. Aguardando propagação das regras (120 segundos).', flush=True)
        for _ in range(8):
            time.sleep(15)
            print('Aguardando propagação; V1 preservada.', flush=True)
        self.require_fence(); self.unchanged()
        return {'fenced': True, 'backupRulesPreserved': True, 'v1Written': False}

    def stage(self, snapshot):
        self.require_fence(); self.unchanged()
        verify(snapshot)
        if inventory(snapshot) != inventory(self.backup):
            raise RuntimeError('Final snapshot differs from tested inventory; no V2 copy attempted')
        if not snapshot['operationUnchangedAtEnd']:
            raise RuntimeError('Final snapshot source changed')
        before = self.unchanged()
        head = self.get(self.target)
        if head and head['fields'].get('sequence') != integer(0):
            raise RuntimeError('Generation already has business operations; never remigrate')
        created = 0
        for start in range(0, len(self.plan['documents']), 100):
            writes = []
            for document in self.plan['documents'][start:start + 100]:
                got = self.get(document['name'])
                if got:
                    if got['fields'] != document['fields']:
                        raise RuntimeError('Destination differs; preserved without overwrite')
                else:
                    writes.append({'update': document, 'currentDocument': {'exists': False}})
            if writes:
                self.commit(writes); created += len(writes)
            print(f'Conferindo cópia: {min(start+100,len(self.plan["documents"]))}/{len(self.plan["documents"])}', flush=True)
        recovered = {**self.plan, 'documents': []}
        for document in self.plan['documents']:
            got = self.get(document['name'])
            if not got or got['fields'] != document['fields']:
                raise RuntimeError('Typed document comparison failed')
            recovered['documents'].append({'name': document['name'], 'fields': got['fields']})
        if digest(reconstruct_fields(recovered)) != self.plan['sourceFieldsChecksum']:
            raise RuntimeError('Lossless reconstruction failed')
        if before != self.unchanged():
            raise RuntimeError('V1 changed during copy')
        fields = typed({'schema': 2, 'state': 'ready', 'sequence': 0,
            'sourceChecksum': self.backup['checksum'],
            'sourceFieldsChecksum': self.plan['sourceFieldsChecksum'],
            'fieldManifest': self.plan['fieldManifest']})['mapValue']['fields']
        fields['fieldRevisions'] = before['fields'].get('_syncMeta', {}).get('mapValue', {}).get('fields', {}).get('fieldRevisions', typed({}))
        if head:
            if head['fields'] != fields:
                raise RuntimeError('Existing head differs; preserved')
        else:
            self.commit([{'verify': self.plan['sourceOperation'], 'currentDocument': {'updateTime': before['updateTime']}},
                {'update': {'name': self.target, 'fields': fields}, 'currentDocument': {'exists': False}}])
        self.require_fence()
        report = {'backupChecksum': self.backup['checksum'], 'sourceFieldsChecksum': self.plan['sourceFieldsChecksum'],
            'compared': len(self.plan['documents']), 'created': created, 'v1Preserved': True,
            'finalInventoryEqual': True, 'generation': self.plan['generation']}
        return report

    def activate(self, frontend_commit):
        if not re.fullmatch(r'[a-f0-9]{40}', frontend_commit):
            raise ValueError('Exact published frontend commit required')
        # Re-run full typed comparison and source check immediately before activation.
        snapshot = json.loads((self.folder / 'final-snapshot.json').read_bytes())
        self.stage(snapshot)
        control = self.require_fence()
        head, source = self.get(self.target), self.unchanged()
        value = {'mode': 'v2', 'generation': self.plan['generation'], 'sourceChecksum': self.backup['checksum'],
            'frontendCommit': frontend_commit, 'certificate': {'sourceChecksum': self.backup['checksum'],
            'productionReady': True, 'v1WritersFenced': True, 'finalReconciliationPassed': True,
            'pdvIntegrationPassed': True, 'rollbackPrepared': True}}
        self.commit([{'verify': self.target, 'currentDocument': {'updateTime': head['updateTime']}},
            {'verify': self.plan['sourceOperation'], 'currentDocument': {'updateTime': source['updateTime']}},
            {'update': {'name': self.control, 'fields': typed(value)['mapValue']['fields']},
            'currentDocument': {'updateTime': control['updateTime']}}])
        after = self.get(self.control)
        if after['fields'] != typed(value)['mapValue']['fields']:
            raise RuntimeError('Activation result unknown; inspect before operating')
        return {'activated': True, 'generation': self.plan['generation'], 'v1Preserved': True,
                'next': 'Reload the published application. Confirm pending payment once, then close cash with the owner.'}

    def stop(self, abort=False):
        _, rules = self.live_rules()
        if rules != self.expected_rules():
            raise RuntimeError('Pilot fence differs; no control change')
        control, head = self.get(self.control), self.get(self.target)
        if not control or control['fields'].get('generation') != typed(self.plan['generation']):
            raise RuntimeError('Unexpected control')
        if abort and head and head['fields'].get('sequence') != integer(0):
            raise RuntimeError('V2 business writes exist: only maintenance is permitted')
        if abort:
            self.unchanged()
        fields = {**control['fields'], 'mode': typed('legacy' if abort else 'maintenance')}
        writes = [{'update': {'name': self.control, 'fields': fields},
            'currentDocument': {'updateTime': control['updateTime']}}]
        if abort:
            writes.insert(0, {'verify': self.target, 'currentDocument':
                {'updateTime': head['updateTime']} if head else {'exists': False}})
        self.commit(writes)
        return {'mode': 'legacy' if abort else 'maintenance', 'dataDeleted': False,
                'warning': 'Legacy still has its original size limit' if abort else 'V2 preserved for reconciliation'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'fence', 'stage', 'resume', 'activate', 'maintenance', 'abort'])
    parser.add_argument('--backup', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--workdir', required=True, type=Path)
    parser.add_argument('--frontend-commit')
    args = parser.parse_args()
    args.workdir.mkdir(mode=0o700, parents=True, exist_ok=True)
    token = google_token()
    backup = json.loads(args.backup.read_bytes())
    recovery = Recovery(backup, Transport(token, refresh=google_token), args.workdir, json.loads(args.evidence.read_bytes()))
    if args.action == 'stage':
        recovery.require_fence()
        # Fresh typed snapshot after fence, safely retained even if reconciliation fails.
        current = collect(ReadOnlyAPI(token, progress=lambda text: print(text, flush=True)),
            backup['project'], backup['store'],
            (dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=10)).isoformat(timespec='microseconds').replace('+00:00','Z'))
        target = args.workdir / 'final-snapshot.json'
        if target.exists():
            saved = json.loads(target.read_bytes()); verify(saved)
            if inventory(saved) != inventory(current):
                raise RuntimeError('Existing final snapshot differs; preserved for review')
        else:
            save_new(target, current)
        result = recovery.stage(current)
    elif args.action == 'resume':
        control = recovery.require_fence()
        saved = json.loads((args.workdir / 'final-snapshot.json').read_bytes())
        verify(saved)
        snapshot_control = next((d for d in saved['documents'] if d['name'] == recovery.control), None)
        if not snapshot_control or snapshot_control['updateTime'] != control['updateTime']:
            raise RuntimeError('Control changed since final snapshot; full stage required')
        # Compare all original documents again, without repeated collection-ID
        # enumeration. Newly staged V2 entities are separately fully compared.
        for index, document in enumerate(backup['documents']):
            current = recovery.get(document['name'])
            if not current or current.get('fields', {}) != document.get('fields', {}):
                raise RuntimeError('Original inventory changed after snapshot; no activation')
            if index % 100 == 0:
                print(f'Originais conferidos: {index+1}/{len(backup["documents"])}', flush=True)
        result = recovery.stage(saved)
    elif args.action == 'activate':
        result = recovery.activate(args.frontend_commit or '')
    elif args.action in ['maintenance', 'abort']:
        result = recovery.stop(args.action == 'abort')
    else:
        result = getattr(recovery, args.action)()
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
