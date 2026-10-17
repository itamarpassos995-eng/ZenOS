import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from backup_readonly_v2 import collect, digest
from test_backup_readonly import FakeAPI, TIME
from pilot_rules import BASELINE, generate
from production_recovery import Recovery, save_new


def fixture():
    backup = collect(FakeAPI(), 'demo-zenos-local', 'central', TIME)
    def remap(v):
        if isinstance(v, str): return v.replace('projects/demo-zenos-local/', 'projects/zenos-ac6b2/')
        if isinstance(v, list): return [remap(x) for x in v]
        if isinstance(v, dict): return {remap(k): remap(x) for k,x in v.items()}
        return v
    backup = remap(backup); backup['project'] = 'zenos-ac6b2'
    backup['checksums'] = {d['name']: digest(d) for d in backup['documents']}
    backup['checksum'] = digest({k:v for k,v in backup.items() if k!='checksum'})
    return backup


class MemoryTransport:
    def __init__(self, backup):
        self.docs = {d['name']:copy.deepcopy(d) for d in backup['documents']}
        self.source = BASELINE; self.ruleset = 'projects/zenos-ac6b2/rulesets/original'
        self.next_source = None; self.sequence = 0; self.before_commit = None
    def __call__(self, service, method, path, body=None):
        if service == 'firebaserules':
            if method == 'GET' and '/releases/' in path:
                return {'name':path,'rulesetName':self.ruleset}
            if method == 'GET': return {'source':{'files':[{'content':self.source}]}}
            if method == 'POST':
                self.next_source=body['source']['files'][0]['content'];return {'name':'projects/zenos-ac6b2/rulesets/pilot'}
            self.ruleset=body['release']['rulesetName'];self.source=self.next_source;return body['release']
        if method == 'GET': return copy.deepcopy(self.docs.get(path))
        if self.before_commit:
            fn,self.before_commit=self.before_commit,None;fn()
        for w in body['writes']:
            p=w.get('verify') or w['update']['name'];d=self.docs.get(p);c=w['currentDocument']
            if ('exists' in c and c['exists'] != bool(d)) or ('updateTime' in c and (not d or c['updateTime']!=d['updateTime'])):
                raise RuntimeError('Atomic precondition rejected')
        for w in body['writes']:
            if 'verify' in w:continue
            self.sequence+=1;d=copy.deepcopy(w['update']);d['updateTime']=f'2026-10-17T08:00:{self.sequence:06d}Z';self.docs[d['name']]=d
        return {}


class ProductionRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.b=fixture();self.api=MemoryTransport(self.b)
        self.e={'backupChecksum':self.b['checksum'],'passed':25,'uiPassed':9,'productionRequests':0,'originalV1Preserved':True,'pilotRules':True,'productionExecutorCorePassed':True}
        self.r=Recovery(self.b,self.api,self.tmp.name,self.e)
    def fence(self):
        with patch('production_recovery.time.sleep'):self.r.fence()
    def test_unreviewed_rules_stop_before_mutation(self):
        self.api.source='different';before=copy.deepcopy(self.api.docs)
        with self.assertRaisesRegex(ValueError,'differ'):self.r.fence()
        self.assertEqual(before,self.api.docs)
    def test_stage_resumes_without_overwrite_and_reconstructs_native_types(self):
        self.fence();first=self.r.plan['documents'][0]
        self.r.commit([{'update':first,'currentDocument':{'exists':False}}])
        before=self.r.unchanged()
        report=self.r.stage(self.b);again=self.r.stage(self.b)
        self.assertEqual(report['created'],len(self.r.plan['documents'])-1)
        self.assertEqual(again['created'],0);self.assertEqual(before,self.r.unchanged())
    def test_divergent_destination_is_preserved(self):
        self.fence();d=copy.deepcopy(self.r.plan['documents'][0]);d['fields']['tampered']={'booleanValue':True}
        self.r.commit([{'update':d,'currentDocument':{'exists':False}}])
        before=copy.deepcopy(self.api.docs[d['name']])
        with self.assertRaisesRegex(RuntimeError,'differs'):self.r.stage(self.b)
        self.assertEqual(before,self.api.docs[d['name']])
    def test_changed_source_prevents_copy(self):
        self.fence();self.api.docs[self.r.plan['sourceOperation']]['updateTime']='changed'
        with self.assertRaisesRegex(RuntimeError,'V1 changed'):self.r.stage(self.b)
        self.assertNotIn(self.r.target,self.api.docs)
    def test_no_legacy_or_unbounded_write_transport(self):
        with self.assertRaises(ValueError):self.r.commit([{'update':{'name':self.r.plan['sourceOperation'],'fields':{}},'currentDocument':{'exists':False}}])
        with self.assertRaises(ValueError):self.r.commit([{'delete':self.r.target}])
        with self.assertRaises(ValueError):self.r.commit([{'update':{'name':self.r.target,'fields':{}},'currentDocument':{'exists':True}}])
    def test_racing_v2_commit_prevents_abort_to_stale_legacy(self):
        self.fence();self.r.stage(self.b)
        def race():
            self.api.docs[self.r.target]['fields']['sequence']={'integerValue':'1'}
            self.api.docs[self.r.target]['updateTime']='concurrent-business-commit'
        self.api.before_commit=race
        with self.assertRaisesRegex(RuntimeError,'precondition'):self.r.stop(abort=True)
        self.assertEqual(self.api.docs[self.r.control]['fields']['mode'],{'stringValue':'maintenance'})
    def test_abort_is_refused_after_business_commit(self):
        self.fence();self.r.stage(self.b)
        self.api.docs[self.r.target]['fields']['sequence']={'integerValue':'1'}
        with self.assertRaisesRegex(RuntimeError,'business writes'):self.r.stop(abort=True)
    def test_activation_is_preconditioned_and_keeps_v1(self):
        self.fence();self.r.stage(self.b)
        save_new(Path(self.tmp.name)/'final-snapshot.json',self.b)
        before=self.r.unchanged();result=self.r.activate('a'*40)
        self.assertTrue(result['activated']);self.assertEqual(before,self.r.unchanged())
        self.assertEqual(self.api.docs[self.r.control]['fields']['mode'],{'stringValue':'v2'})
    def test_missing_homologation_is_refused(self):
        with self.assertRaises(ValueError):Recovery(self.b,self.api,self.tmp.name,{**self.e,'backupChecksum':'wrong'})
    def test_version_guard_refuses_changed_metadata_without_reading_big_document(self):
        original=next(d for d in self.b['documents'] if d['name']==self.r.plan['sourceOperation'])
        self.api.version=lambda resource: original['updateTime']
        self.assertEqual(self.r.unchanged(),original)
        self.api.version=lambda resource:'different-version'
        with self.assertRaisesRegex(RuntimeError,'V1 changed'):self.r.unchanged()
    def test_pilot_rules_never_accept_unreviewed_baseline(self):
        with self.assertRaises(ValueError):generate(BASELINE.replace('!=','=='),'central')
        with self.assertRaises(ValueError):generate(BASELINE,"bad'id")


if __name__=='__main__':unittest.main()
