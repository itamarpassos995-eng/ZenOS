import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import bulk_v2_rollout as bulk
from backup_readonly_v2 import digest
from test_production_recovery import fixture

def backup_for(uid):
    original=fixture()
    def replace(v):
        if isinstance(v,str):return v.replace('/lojas/central','/lojas/'+uid)
        if isinstance(v,list):return [replace(x) for x in v]
        if isinstance(v,dict):return {replace(k):replace(x) for k,x in v.items()}
        return v
    b=replace(original);b['store']=uid
    b['checksums']={d['name']:digest(d) for d in b['documents']}
    b['checksum']=digest({k:v for k,v in b.items() if k!='checksum'})
    return b

class BulkTests(unittest.TestCase):
    def test_concurrent_native_deploy_explicitly_allocates_at_least_one_cpu(self):
        class DeploymentCaptured(Exception):pass
        captured=[]
        def run(command,**kwargs):
            if command[:3]==['gcloud','functions','deploy']:
                captured.append(command)
                concurrency=int(command[command.index('--concurrency')+1])
                if concurrency>1:
                    self.assertIn('--cpu',command)
                    self.assertGreaterEqual(float(command[command.index('--cpu')+1]),1)
                raise DeploymentCaptured()
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp,patch.object(bulk,'run',side_effect=run), \
            patch.object(bulk.subprocess,'run',return_value=SimpleNamespace(returncode=0)):
            with self.assertRaises(DeploymentCaptured):bulk.prepare_native(Path(tmp),'a'*40)
        self.assertEqual(len(captured),1)

    def test_all_backups_and_certifications_precede_any_migration(self):
        events=[];uids=sorted(bulk.AUTHORIZED)
        before={'stores':[{'store':s,'action':'migration-window-required','mode':'legacy'} for s in uids]+
            [{'store':'already-v2','action':'already-v2','mode':'v2'}],'total':7}
        after={'stores':[{'store':s,'action':'already-v2','mode':'v2'} for s in uids+['already-v2']],'total':7}
        def collect(api,project,uid,read_time):events.append(('backup',uid));return backup_for(uid)
        def certify(path,folder,commit):events.append(('test',folder.name));return {}
        def migrate(b,evidence,folder,commit):events.append(('migrate',b['store']));return {'activated':True}
        with tempfile.TemporaryDirectory() as tmp, patch('sys.argv',['bulk','--workdir',tmp,'--frontend-commit','a'*40]), \
            patch.object(bulk,'route_inventory',side_effect=[before,after]),patch.object(bulk,'read_api'), \
            patch.object(bulk,'collect',side_effect=collect),patch.object(bulk,'certify',side_effect=certify), \
            patch.object(bulk,'migrate',side_effect=migrate),patch.object(bulk,'run'), \
            patch.object(bulk.subprocess,'check_output',return_value='b'*40),contextlib.redirect_stdout(io.StringIO()):
            bulk.main()
            report=json.loads(next(Path(tmp).glob('result-*.json')).read_text())
            self.assertEqual(report['migratedThisRun'],6)
            self.assertTrue(report['allAuthorizedV2'])
        self.assertEqual([e[0] for e in events],['backup']*6+['test']*6+['migrate']*6)
        self.assertNotIn(('migrate','already-v2'),events)

    def test_failure_during_validation_starts_no_migration(self):
        before={'stores':[{'store':s,'action':'migration-window-required','mode':'legacy'} for s in bulk.AUTHORIZED],'total':6}
        with tempfile.TemporaryDirectory() as tmp, patch('sys.argv',['bulk','--workdir',tmp,'--frontend-commit','a'*40]), \
            patch.object(bulk,'route_inventory',return_value=before),patch.object(bulk,'read_api'), \
            patch.object(bulk,'collect',side_effect=lambda api,p,s,t:backup_for(s)), \
            patch.object(bulk,'certify',side_effect=RuntimeError('failed test')),patch.object(bulk,'migrate') as migrate, \
            patch.object(bulk,'run'),patch.object(bulk.subprocess,'check_output',return_value='b'*40),contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'failed test'):bulk.main()
            migrate.assert_not_called()

if __name__=='__main__':unittest.main()
