"""Synthetic empty-module fixture; no production reads or private backup."""
import argparse
import json
from pathlib import Path
from backup_readonly_v2 import collect, digest
from test_backup_readonly import FakeAPI, TIME

def minimal_backup(product_price=None):
    b=collect(FakeAPI(),'demo-zenos-local','central',TIME)
    def remap(v):
        if isinstance(v,str):return v.replace('projects/demo-zenos-local/','projects/zenos-ac6b2/')
        if isinstance(v,list):return [remap(x) for x in v]
        if isinstance(v,dict):return {remap(k):remap(x) for k,x in v.items()}
        return v
    b=remap(b);b['project']='zenos-ac6b2'
    op=next(d for d in b['documents'] if d['name'].endswith('/dados/operacao'))
    op['fields']={'produtos':{'arrayValue':{}}}
    if product_price is not None:
        if not isinstance(product_price,int) or not 0<product_price<=1000000000:
            raise ValueError('Synthetic product price out of test budget')
        product={'id':{'stringValue':'DEMO-HIGH-PRICE'},'sku':{'stringValue':'DEMO-HIGH-PRICE'},
            'nome':{'stringValue':'Synthetic high price'},'tipoItem':{'stringValue':'mercadoria'},
            **{k:{'integerValue':str(v)} for k,v in {'precoBRL':product_price,'custoBRL':1,'estoque':30,'estoqueVitrine':30,'estoqueGalpao':0}.items()}}
        op['fields']['produtos']={'arrayValue':{'values':[{'mapValue':{'fields':product}}]}}
    b['checksums']={d['name']:digest(d) for d in b['documents']}
    b['checksum']=digest({k:v for k,v in b.items() if k!='checksum'})
    return b

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True,type=Path)
    p.add_argument('--product-price',type=int);args=p.parse_args()
    with args.out.open('x') as out:json.dump(minimal_backup(args.product_price),out)
