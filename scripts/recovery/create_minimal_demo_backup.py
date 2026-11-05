"""Synthetic empty-module fixture; no production reads or private backup."""
import argparse
import json
from pathlib import Path
from backup_readonly_v2 import collect, digest
from test_backup_readonly import FakeAPI, TIME

def minimal_backup():
    b=collect(FakeAPI(),'demo-zenos-local','central',TIME)
    def remap(v):
        if isinstance(v,str):return v.replace('projects/demo-zenos-local/','projects/zenos-ac6b2/')
        if isinstance(v,list):return [remap(x) for x in v]
        if isinstance(v,dict):return {remap(k):remap(x) for k,x in v.items()}
        return v
    b=remap(b);b['project']='zenos-ac6b2'
    op=next(d for d in b['documents'] if d['name'].endswith('/dados/operacao'))
    op['fields']={'produtos':{'arrayValue':{}}}
    b['checksums']={d['name']:digest(d) for d in b['documents']}
    b['checksum']=digest({k:v for k,v in b.items() if k!='checksum'})
    return b

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True,type=Path);args=p.parse_args()
    with args.out.open('x') as out:json.dump(minimal_backup(),out)
