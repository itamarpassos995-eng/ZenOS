#!/usr/bin/env python3
"""Owner-run release gates. Never changes a store's operational data or route."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
from pilot_rules import generate
from production_recovery import Transport

PROJECT='projects/zenos-ac6b2'
RELEASE=PROJECT+'/releases/cloud.firestore'
POLICY=PROJECT+'/databases/(default)/documents/system/storage_policy'
VIPE='QNtFleq9ajNNmU6iwiFSi5w1alu2'

def checksum(source):return hashlib.sha256(source.encode()).hexdigest()

def live_rules(api):
    release=api('firebaserules','GET',RELEASE)
    if not release:raise RuntimeError('Missing active release')
    rules=api('firebaserules','GET',release['rulesetName'])
    files=(rules or {}).get('source',{}).get('files',[])
    if len(files)!=1 or 'content' not in files[0]:raise RuntimeError('Unexpected live rules bundle')
    return release,files[0]['content']

def prepare(api,folder):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    release,source=live_rules(api)
    candidate=generate(source,VIPE,native=True)
    manifest={'project':'zenos-ac6b2','originalRelease':release,'originalSha256':checksum(source),'candidateSha256':checksum(candidate)}
    for name,value in [('original.rules',source),('native.rules',candidate),('manifest.json',json.dumps(manifest,indent=2))]:
        with (folder/name).open('x') as file:file.write(value)
    return manifest

def verified_plan(folder):
    folder=Path(folder);m=json.loads((folder/'manifest.json').read_text())
    original=(folder/'original.rules').read_text();candidate=(folder/'native.rules').read_text()
    if m.get('project')!='zenos-ac6b2' or checksum(original)!=m['originalSha256'] or checksum(candidate)!=m['candidateSha256']:
        raise RuntimeError('Release plan checksum mismatch')
    if generate(original,VIPE,native=True)!=candidate:raise RuntimeError('Unreviewed candidate')
    return m,original,candidate

def publish_rules(api,folder):
    m,original,candidate=verified_plan(folder)
    release,current=live_rules(api)
    if current==candidate:return {'rulesSha256':checksum(candidate),'alreadyPublished':True}
    if current!=original or release['rulesetName']!=m['originalRelease']['rulesetName']:
        raise RuntimeError('Live rules changed; prepare another plan')
    ruleset=api('firebaserules','POST',PROJECT+'/rulesets',{'source':{'files':[{'name':'firestore.rules','content':candidate}]}})
    again,_=live_rules(api)
    if again['rulesetName']!=release['rulesetName']:raise RuntimeError('Concurrent release detected')
    api('firebaserules','PATCH',RELEASE,{'release':{'name':RELEASE,'rulesetName':ruleset['name']},'updateMask':'rulesetName'})
    if live_rules(api)[1]!=candidate:raise RuntimeError('Published rules not confirmed')
    return {'rulesSha256':checksum(candidate),'newAccountsEnabled':False}

def enable(api,folder,commit):
    if not re.fullmatch(r'[a-f0-9]{40}',commit or ''):raise ValueError('Exact tested frontend commit required')
    _,_,candidate=verified_plan(folder)
    if live_rules(api)[1]!=candidate:raise RuntimeError('Native protections are not the active rules')
    existing=api('firestore','GET',POLICY)
    fields=(existing or {}).get('fields',{})
    expected={'newStoreSchema':{'integerValue':'2'},'nativeProtectionReady':{'booleanValue':True},
        'frontendCommit':{'stringValue':commit},'rulesSha256':{'stringValue':checksum(candidate)}}
    if existing:
        if all(fields.get(k)==v for k,v in expected.items()) and 'enabledAt' in fields:
            return {'alreadyEnabled':True,'storesMigrated':0}
        raise RuntimeError('Existing activation policy differs; inspect instead of overwriting')
    expected['enabledAt']={'timestampValue':dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')}
    api('firestore','POST',PROJECT+'/databases/(default)/documents:commit',
        {'writes':[{'update':{'name':POLICY,'fields':expected},'currentDocument':{'exists':False}}]})
    confirmed=api('firestore','GET',POLICY)
    if (confirmed or {}).get('fields')!=expected:raise RuntimeError('Activation not confirmed; inspect policy')
    return {'newAccountsEnabled':True,'storesMigrated':0,'frontendCommit':commit}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','publish-rules','enable'])
    parser.add_argument('--workdir',required=True)
    parser.add_argument('--frontend-commit')
    args=parser.parse_args()
    token=subprocess.run(['gcloud','auth','print-access-token'],text=True,capture_output=True,timeout=30,check=True).stdout.strip()
    api=Transport(token)
    if args.action=='prepare':result=prepare(api,args.workdir)
    elif args.action=='publish-rules':result=publish_rules(api,args.workdir)
    else:result=enable(api,args.workdir,args.frontend_commit)
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
