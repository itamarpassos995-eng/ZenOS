#!/usr/bin/env python3
"""Owner-run rollout for the six explicitly authorized idle stores.

Back up and test EVERY remaining store before the first production fence.
Existing V2 stores are never remigrated. No deletion or V1 writes exist here.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from audit_store_routes import inventory as route_inventory, fields
from backup_readonly_v2 import ReadOnlyAPI, collect, verify, digest
from production_recovery import Recovery, Transport, save_new
from v2_plan import plan_v2
from native_v2_release import prepare, publish_rules, enable

PROJECT='zenos-ac6b2'
AUTHORIZED=frozenset([
    '4MeuYvVwNYRE9qysXsdyc4it85z1','6GLW88A5EcUPEIYgU0QG7I6nHgn2',
    '7xF0jRLJVsOmLtli6jyM9k2cuyw1','H0w8elIUybX1ZJuXbNe7kZcGMLH3',
    'W5xyHyF211YMS2Nk1SHtyr57rq12','XuMFgiVtcTfpIt07DVsYjSwf09v2',
])
ROOT=Path(__file__).resolve().parents[2]

def token():
    return subprocess.run(['gcloud','auth','print-access-token'],text=True,capture_output=True,timeout=30,check=True).stdout.strip()

def read_api():return ReadOnlyAPI(token(),max_requests=20000)

def snapshot_time():
    return (dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=10)).isoformat().replace('+00:00','Z')

def run(command, *, env=None, log=None, timeout=1800):
    print('Executando: '+command[0]+' '+command[1],flush=True)
    if log:
        with open(log,'w',encoding='utf-8') as output:
            os.chmod(log,0o600)
            result=subprocess.run(command,cwd=ROOT,env=env,stdout=output,stderr=subprocess.STDOUT,timeout=timeout)
        if result.returncode:raise RuntimeError(f'Etapa falhou; nenhuma aprovação presumida. Consulte {log}')
    else:subprocess.run(command,cwd=ROOT,env=env,check=True,timeout=timeout)

def certify(backup_path,folder,code_commit):
    b=json.loads(backup_path.read_bytes());verify(b);plan_v2(b)
    evidence_path=folder/'evidence.json'
    if evidence_path.exists():
        saved=json.loads(evidence_path.read_bytes())
        if saved.get('testedCodeCommit')!=code_commit:raise RuntimeError('Código mudou; usar outra pasta de validação')
        Recovery(b,lambda *args:None,folder/'migration',saved)
        return saved
    env={**os.environ,'ZENOS_FENCED_RULES':'1','ZENOS_PILOT_RULES':'1',
        'ZENOS_BACKUP_PATH':str(backup_path),'ZENOS_REPORT_PATH':str(folder/'integration.json'),
        'npm_config_ignore_scripts':'true'}
    # Arguments are quoted only for the child emulator command. No credentials
    # are placed on argv or passed to the emulator's production transports.
    import shlex
    q=shlex.quote
    command=(f'python3 scripts/recovery/production_executor_emulator.py {q(str(backup_path))}'
        f' && node scripts/recovery/v2_app_integration.mjs {q(str(backup_path))}'
        ' && npx vitest run --config vitest.recovery.config.js'
        ' scripts/recovery/pdv.ui.test.jsx scripts/recovery/cadastros-v2.ui.test.jsx'
        f' --reporter=json --outputFile={q(str(folder/"ui.json"))}')
    run(['npx','--yes','firebase-tools@14.12.0','emulators:exec','--only','auth,firestore',
        '--project','demo-zenos-local','--config','firebase.recovery-fenced.json',command],
        env=env,log=folder/'validation.log')
    integration=json.loads((folder/'integration.json').read_bytes())
    ui=json.loads((folder/'ui.json').read_bytes())
    text=(folder/'validation.log').read_text()
    match=re.search(r'\{\s*"productionExecutorCorePassed"[\s\S]*?\n\}',text)
    if not match:raise RuntimeError('Executor proof missing')
    executor=json.loads(match.group())
    if not ui.get('success') or ui.get('numFailedTests')!=0 or ui.get('numPassedTests',0)<9:
        raise RuntimeError('UI certification incomplete')
    if executor.get('inputBackupChecksum')!=b['checksum'] or executor.get('comparedV1')!=len(b['documents']) or executor.get('replayWrites')!=0:
        raise RuntimeError('Executor proof does not match this backup')
    if integration.get('backupChecksum')!=b['checksum'] or executor.get('comparedV2')!=len(plan_v2(b)['documents']):
        raise RuntimeError('Restored copy proof differs')
    evidence={'backupChecksum':b['checksum'],'passed':integration['passed'],'uiPassed':ui['numPassedTests'],
        'productionRequests':integration['productionRequests'],'pilotRules':integration['pilotRules'],
        'originalV1Preserved':integration['originalV1Preserved'],
        'productionExecutorCorePassed':executor['productionExecutorCorePassed'],
        'testedCodeCommit':code_commit,'comparedV1':executor['comparedV1'],'comparedV2':executor['comparedV2']}
    Recovery(b,lambda *args:None,folder/'migration',evidence)
    save_new(evidence_path,evidence)
    return evidence

def migrate(backup, evidence, folder, frontend_commit):
    folder.mkdir(mode=0o700,exist_ok=True)
    r=Recovery(backup,Transport(token()),folder,evidence)
    control=r.get(r.control)
    if control:
        mode=fields(control).get('mode')
        if mode=='v2':
            current=route_inventory(read_api(),PROJECT)
            if not any(x['store']==backup['store'] and x['action']=='already-v2' for x in current['stores']):
                raise RuntimeError('Existing V2 route did not pass certificate inspection')
            return {'alreadyV2':True}
        if mode!='maintenance' or not (folder/'original-rules.json').exists():
            raise RuntimeError('Unexpected existing control; no overwrite')
    else:r.inspect()
    r.fence()
    fresh=collect(read_api(),PROJECT,backup['store'],snapshot_time())
    path=folder/'final-snapshot.json'
    if path.exists():
        from production_recovery import inventory
        if inventory(json.loads(path.read_bytes()))!=inventory(fresh):raise RuntimeError('Saved final snapshot differs')
    else:save_new(path,fresh)
    stage=r.stage(fresh)
    activation=r.activate(frontend_commit)
    return {'stage':stage,'activation':activation}

def prepare_native(folder, frontend_commit):
    # Separate runtime identity; no permissions or deployment changes to fiscal.
    run(['gcloud','services','enable','cloudfunctions.googleapis.com','run.googleapis.com',
        'cloudbuild.googleapis.com','artifactregistry.googleapis.com','--project',PROJECT,'--quiet'])
    service_account=f'zenos-operational-v2@{PROJECT}.iam.gserviceaccount.com'
    exists=subprocess.run(['gcloud','iam','service-accounts','describe',service_account,'--project',PROJECT],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    if not exists:run(['gcloud','iam','service-accounts','create','zenos-operational-v2',
        '--display-name','ZenOS native V2 provisioning','--project',PROJECT,'--quiet'])
    run(['gcloud','projects','add-iam-policy-binding',PROJECT,'--member','serviceAccount:'+service_account,
        '--role','roles/datastore.user','--condition=None','--quiet','--format=none'])
    run(['gcloud','functions','deploy','provisionNativeV2Store','--gen2','--runtime','nodejs22',
        '--region','southamerica-east1','--source','operational-functions','--entry-point','provisionNativeV2Store',
        '--trigger-http','--allow-unauthenticated','--service-account',service_account,'--memory','256MiB',
        '--timeout','30s','--max-instances','5','--concurrency','20',
        '--update-labels','firebase-functions-codebase=operational','--project',PROJECT,'--quiet'],timeout=1800)
    info=subprocess.run(['gcloud','functions','describe','provisionNativeV2Store','--gen2',
        '--region','southamerica-east1','--project',PROJECT,'--format=json'],capture_output=True,text=True,check=True)
    if json.loads(info.stdout).get('state')!='ACTIVE':raise RuntimeError('Backend not ACTIVE')
    # Callable auth is enforced by the function, while HTTP invocation is public
    # so browser clients can send Firebase ID tokens. Confirm anonymous calls
    # are rejected by the deployed callable, rather than merely by IAM.
    import urllib.request
    import urllib.error
    uri=json.loads(info.stdout).get('serviceConfig',{}).get('uri','')
    if not re.fullmatch(r'https://[A-Za-z0-9.-]+\.run\.app',uri):raise RuntimeError('Unexpected deployed function URL')
    request=urllib.request.Request(uri,data=b'{"data":{}}',headers={'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=60) as response:response.read()
        raise RuntimeError('Deployed callable accepted anonymous provisioning')
    except urllib.error.HTTPError as error:
        body=json.loads(error.read(32768))
        if error.code!=401 or body.get('error',{}).get('status')!='UNAUTHENTICATED':raise RuntimeError('Callable auth smoke check failed') from None
    api=Transport(token())
    if not (folder/'manifest.json').exists():prepare(api,folder)
    result=publish_rules(api,folder)
    print('Backend publicado. Aguardando propagação das regras antes da ativação de contas novas.',flush=True)
    for _ in range(40):
        time.sleep(15)
        print('Propagação das regras nativas em andamento; lojas existentes preservadas.',flush=True)
    # The supplied commit is the confirmed published V2-compatible frontend.
    # Existing builds without the native feature flag continue unchanged until
    # the subsequent Vercel release; no new-account V2 claim is made yet.
    activation=enable(Transport(token()),folder,frontend_commit)
    return {**result,'backendActive':True,'serverGateEnabled':True,
        'frontendActivationPending':True,'serverActivation':activation}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workdir',required=True,type=Path)
    parser.add_argument('--frontend-commit',required=True)
    parser.add_argument('--prepare-native',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'[a-f0-9]{40}',args.frontend_commit):parser.error('Exact published frontend SHA required')
    if os.environ.get('FIRESTORE_EMULATOR_HOST'):parser.error('Production coordinator cannot run inside an emulator')
    folder=args.workdir.resolve();folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    code=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    before=route_inventory(read_api(),PROJECT)
    initial=folder/'inventory-before.json'
    if not initial.exists():save_new(initial,before)
    rows={r['store']:r for r in before['stores']}
    if not AUTHORIZED.issubset(rows):raise RuntimeError('Authorized store missing; no production changes')
    pending=[s for s in sorted(AUTHORIZED) if rows[s]['action']!='already-v2']
    for s in pending:
        if rows[s]['mode'] not in ('legacy','maintenance'):raise RuntimeError('Unexpected route; inspect first')
    if pending:
        run(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],log=folder/'dependencies.log')
    backups={}
    # Back up all stores first, and certify all before any maintenance fence.
    for s in pending:
        home=folder/s;home.mkdir(mode=0o700,exist_ok=True);path=home/'backup.json'
        if not path.exists():
            if rows[s]['mode']!='legacy':raise RuntimeError('Maintenance has no saved backup; refusing reset')
            print('Backup somente leitura: '+s,flush=True)
            b=collect(read_api(),PROJECT,s,snapshot_time())
            if not b['operationUnchangedAtEnd']:raise RuntimeError('Store changed during backup')
            plan_v2(b);save_new(path,b)
        backups[s]=json.loads(path.read_bytes());verify(backups[s])
        if backups[s]['store']!=s or backups[s]['project']!=PROJECT:raise RuntimeError('Backup scope mismatch')
    evidence={}
    for s in pending:
        print('Validando backup e app no emulador: '+s,flush=True)
        evidence[s]=certify(folder/s/'backup.json',folder/s,code)
        print('Certificado: '+s+' — integração e interface aprovadas.',flush=True)
    results={}
    for s in pending:
        print('Migrando loja parada: '+s,flush=True)
        results[s]=migrate(backups[s],evidence[s],folder/s/'migration',args.frontend_commit)
        print('Ativação V2 confirmada: '+s,flush=True)
    after=route_inventory(read_api(),PROJECT)
    protected_before={r['store'] for r in before['stores'] if r['action']=='already-v2'}
    protected_after={r['store'] for r in after['stores'] if r['action']=='already-v2'}
    if not protected_before.issubset(protected_after):raise RuntimeError('Previously active V2 route changed; inspect before continuing')
    if any(r['action']!='already-v2' for r in after['stores'] if r['store'] in AUTHORIZED):
        raise RuntimeError('Final authorized store certification incomplete')
    final=folder/'inventory-after.json'
    if not final.exists():save_new(final,after)
    report={'authorizedStores':6,'migratedThisRun':len(results),'authorizedAlreadyV2':6-len(pending),
        'v1Preserved':True,'allAuthorizedV2':True,'totalStores':after['total'],
        'v2Stores':sum(r['action']=='already-v2' for r in after['stores']),
        'legacyStores':sum(r['mode']=='legacy' for r in after['stores'])}
    if args.prepare_native:
        report['nativePreparation']=prepare_native(folder/'native-release',args.frontend_commit)
    # Each run gets its own non-overwriting report.
    report_path=folder/('result-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.json')
    save_new(report_path,report)
    print(json.dumps({**report,'report':str(report_path),'nativeWorkdir':str(folder/'native-release')},indent=2),flush=True)

if __name__=='__main__':main()
