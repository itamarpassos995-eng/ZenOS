"""Exercise the production executor's exact core on a loopback-only transport.

Rules management is simulated; the generated policy is separately exercised by
the real application integration suite. Firestore preconditions are real here.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
from backup_readonly_v2 import digest
from emulator_restore import call, DB
from pilot_rules import BASELINE
from production_recovery import Recovery, save_new

if os.environ.get('FIRESTORE_EMULATOR_HOST') != '127.0.0.1:8080' or os.environ.get('GCLOUD_PROJECT') != 'demo-zenos-local':
    raise RuntimeError('Only local demo project allowed')
backup=json.loads(Path(sys.argv[1]).read_bytes())
source='projects/zenos-ac6b2/databases/(default)'


def remap(value, reverse=False):
    if isinstance(value,str):return value.replace(DB if reverse else source,source if reverse else DB)
    if isinstance(value,list):return [remap(x,reverse) for x in value]
    if isinstance(value,dict):return {remap(k,reverse):remap(v,reverse) for k,v in value.items()}
    return value


class Bridge:
    def __init__(self):self.source=BASELINE;self.ruleset='projects/zenos-ac6b2/rulesets/original';self.next=None
    def __call__(self,service,method,path,body=None):
        if service=='firestore':return remap(call(method,remap(path),remap(body)),True)
        if method=='GET' and '/releases/' in path:return {'name':path,'rulesetName':self.ruleset}
        if method=='GET':return {'source':{'files':[{'content':self.source}]}}
        if method=='POST':self.next=body['source']['files'][0]['content'];return {'name':'projects/zenos-ac6b2/rulesets/pilot'}
        self.source=self.next;self.ruleset=body['release']['rulesetName'];return body['release']


for start in range(0,len(backup['documents']),100):
    call('POST',DB+'/documents:commit',{'writes':[{'update':remap({'name':d['name'],'fields':d.get('fields',{})}),
        'currentDocument':{'exists':False}} for d in backup['documents'][start:start+100]]})
# Restoring fields cannot preserve server-managed updateTime/createTime. Bind the
# emulator backup to the actual restored metadata, while proving every field is
# identical to the uploaded snapshot. Production never rewrites this metadata.
input_checksum=backup['checksum']
for index,original in enumerate(backup['documents']):
    actual=remap(call('GET',remap(original['name'])),True)
    assert actual['fields']==original.get('fields',{})
    backup['documents'][index]=actual
backup['checksums']={d['name']:digest(d) for d in backup['documents']}
backup['checksum']=digest({k:v for k,v in backup.items() if k!='checksum'})
e={'backupChecksum':backup['checksum'],'passed':25,'uiPassed':9,'productionRequests':0,'originalV1Preserved':True,'pilotRules':True,'productionExecutorCorePassed':True}
with tempfile.TemporaryDirectory() as folder:
    r=Recovery(backup,Bridge(),folder,e)
    assert r.inspect()['writes']==0
    with patch('production_recovery.time.sleep'):r.fence()
    first=r.stage(backup);again=r.stage(backup)
    assert first['created']==1257 and again['created']==0
    save_new(Path(folder)/'final-snapshot.json',backup)
    assert r.activate('a'*40)['activated']
    assert r.stop()['mode']=='maintenance'
    assert r.stop(abort=True)['mode']=='legacy'
    for doc in backup['documents']:
        got=r.get(doc['name']);assert got['fields']==doc.get('fields',{})
    report={'productionExecutorCorePassed':True,'comparedV1':len(backup['documents']),
        'comparedV2':first['compared'],'replayWrites':again['created'],'productionRequests':0,
        'inputBackupChecksum':input_checksum}
    print(json.dumps(report,indent=2))
