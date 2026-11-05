#!/usr/bin/env python3
"""Bounded read-only route inventory. No customer records are written or printed."""
import argparse
import datetime as dt
import json
import re
import subprocess
from pathlib import Path
from backup_readonly_v2 import ReadOnlyAPI, encoded


def decode(value):
    if 'mapValue' in value:
        return {k:decode(v) for k,v in value['mapValue'].get('fields',{}).items()}
    if 'arrayValue' in value:
        return [decode(v) for v in value['arrayValue'].get('values',[])]
    if 'integerValue' in value:
        return int(value['integerValue'])
    for kind in ('stringValue','booleanValue','doubleValue','nullValue','timestampValue'):
        if kind in value:
            return value[kind]
    return None


def fields(document):
    return {k:decode(v) for k,v in (document or {}).get('fields',{}).items()}


def inventory(api, project, *, max_stores=500, read_time=None):
    base=f'projects/{project}/databases/(default)'
    meta=api('GET',base)
    if not meta or meta.get('databaseEdition')!='STANDARD' or meta.get('type')!='FIRESTORE_NATIVE':
        raise RuntimeError('Expected STANDARD / FIRESTORE_NATIVE')
    params={'readTime':read_time} if read_time else {}
    root=base+'/documents/lojas'
    rows=[]; token=''; seen=set()
    while True:
        page=api('GET',root,params={**params,'pageSize':50,**({'pageToken':token} if token else {})})
        if page is None:
            raise RuntimeError('Missing store listing')
        for store in page.get('documents',[]):
            if len(rows)>=max_stores:
                raise RuntimeError('Store budget exceeded; no complete inventory generated')
            path=store.get('name','')
            if not path.startswith(root+'/') or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',path[len(root)+1:]):
                raise RuntimeError('Invalid store path')
            uid=path.rsplit('/',1)[1]; profile=fields(store)
            control=fields(api('GET',path+'/dados/storage_control',params=params))
            mode=control.get('mode','legacy')
            row={'store':uid,'email':profile.get('email',''),'mode':mode,'action':'inspect'}
            if mode in ('v2','maintenance','shadow'):
                generation=control.get('generation','')
                if not re.fullmatch(r'[a-f0-9]{24}',generation):
                    row['issue']='invalid-generation'
                else:
                    head=fields(api('GET',path+'/v2_generations/'+generation,params=params))
                    cert=control.get('certificate') or {}
                    ready=(mode=='v2' and head.get('schema')==2 and head.get('state')=='ready'
                        and bool(control.get('sourceChecksum')) and head.get('sourceChecksum')==control.get('sourceChecksum')
                        and cert.get('sourceChecksum')==control.get('sourceChecksum')
                        and all(cert.get(k) is True for k in ('productionReady','v1WritersFenced','finalReconciliationPassed','pdvIntegrationPassed','rollbackPrepared')))
                    row.update(generation=generation,counts=head.get('fieldCounts',{}),action='already-v2' if ready else 'inspect')
            elif mode=='legacy':
                operation=api('GET',path+'/dados/operacao',params=params)
                if operation:
                    data=fields(operation)
                    # JSON estimate, NOT Firestore's exact encoded document size.
                    size=len(encoded(data))
                    row.update(estimatedJsonKiB=round(size/1024,1),
                        counts={k:len(v) for k,v in data.items() if isinstance(v,list)},
                        action='migration-window-required',priority='urgent' if size>=850*1024 else 'plan')
                else:
                    row['issue']='missing-operation-no-auto-reset'
            rows.append(row)
        token=page.get('nextPageToken','')
        if not token: break
        if token in seen: raise RuntimeError('Repeated page token')
        seen.add(token)
    return {'project':project,'readTime':read_time,'stores':rows,'total':len(rows),
        'readOnly':True,'sizeMetric':'UTF-8 canonical JSON estimate; not exact Firestore bytes'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project',required=True)
    parser.add_argument('--out',default='zenos-storage-inventory.json')
    parser.add_argument('--max-stores',type=int,default=500)
    args=parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+',args.project) or not 1<=args.max_stores<=2000:
        parser.error('Invalid project or store budget')
    # Exclusive output prevents silently replacing an earlier report.
    if Path(args.out).exists():
        parser.error('Output already exists; choose another filename')
    token=subprocess.run(['gcloud','auth','print-access-token'],text=True,capture_output=True,timeout=30,check=True).stdout.strip()
    read_time=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=5)).isoformat().replace('+00:00','Z')
    api=ReadOnlyAPI(token,max_requests=12+args.max_stores*6)
    result=inventory(api,args.project,max_stores=args.max_stores,read_time=read_time)
    result['httpRequests']=api.requests
    with Path(args.out).open('x',encoding='utf-8') as out:
        json.dump(result,out,ensure_ascii=False,indent=2)
    summary={mode:sum(r['mode']==mode for r in result['stores']) for mode in sorted({r['mode'] for r in result['stores']})}
    print(json.dumps({'readOnly':True,'total':result['total'],'modes':summary,'file':args.out},ensure_ascii=False))


if __name__=='__main__':
    main()
