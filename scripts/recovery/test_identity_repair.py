import copy
import unittest
from unittest.mock import patch
from backup_readonly_v2 import digest
from create_minimal_demo_backup import minimal_backup
from v2_plan import plan_v2,reconstruct_fields

def seal(b):
    b['checksums']={d['name']:digest(d) for d in b['documents']}
    b['checksum']=digest({k:v for k,v in b.items() if k!='checksum'})
    return b

def fixture():
    b=minimal_backup();op=next(d for d in b['documents'] if d['name'].endswith('/dados/operacao'))
    root=op['name'].rsplit('/dados/operacao',1)[0]
    b['documents']=[d for d in b['documents'] if d['name'] in (root,op['name'])]
    def entity(name,amount):return {'mapValue':{'fields':{'id':{'integerValue':'42'},'nome':{'stringValue':name},'saldoDevedorBRL':{'integerValue':str(amount)}}}}
    op['fields']={f:{'arrayValue':{'values':[entity('A',850),entity('B',4200)]}} for f in ['clientes','produtos']}
    review={'store':b['store'],'sourceFieldsChecksum':digest(op['fields']),'repairs':[
        {'field':f,'index':1,'originalId':{'integerValue':'42'},'newId':f+'-reviewed-B',
         'sourceRecordChecksum':digest(op['fields'][f]['arrayValue']['values'][1])} for f in ['clientes','produtos']]}
    return seal(b),op,review

class IdentityRepairTests(unittest.TestCase):
    def test_distinct_records_and_amounts_survive_with_exact_inverse_and_no_source_mutation(self):
        b,op,review=fixture();before=copy.deepcopy(b)
        with patch('identity_repair.load_reviews',return_value=[review]):p=plan_v2(b)
        self.assertEqual(b,before);self.assertEqual(reconstruct_fields(p),op['fields'])
        for field in ['clientes','produtos']:
            records=[d['fields']['data']['mapValue']['fields'] for d in p['documents'] if d['fields'].get('legacyField')=={'stringValue':field}]
            self.assertEqual([r['saldoDevedorBRL'] for r in records],[{'integerValue':'850'},{'integerValue':'4200'}])
            self.assertEqual(records[0]['id'],{'integerValue':'42'})
            self.assertEqual(records[1]['id'],{'stringValue':field+'-reviewed-B'})

    def test_other_stores_duplicates_are_not_automatically_repaired(self):
        b,op,review=fixture();review['store']='another-store'
        with patch('identity_repair.load_reviews',return_value=[review]):
            with self.assertRaisesRegex(ValueError,'Duplicate'):plan_v2(b)

    def test_changed_source_requires_new_review(self):
        b,op,review=fixture();op['fields']['clientes']['arrayValue']['values'][1]['mapValue']['fields']['saldoDevedorBRL']={'integerValue':'1'};seal(b)
        with patch('identity_repair.load_reviews',return_value=[review]):
            with self.assertRaisesRegex(ValueError,'differs from source'):plan_v2(b)

    def test_ambiguous_reference_and_additional_documents_abort(self):
        for additional in [False,True]:
            b,op,review=fixture()
            if additional:
                b['documents'].append({'name':op['name'].rsplit('/dados/operacao',1)[0]+'/financeiro_livro/new','fields':{},'updateTime':op['updateTime']})
            else:
                op['fields']['historicoVendas']={'arrayValue':{'values':[{'mapValue':{'fields':{'clienteId':{'integerValue':'42'}}}}]}}
                review['sourceFieldsChecksum']=digest(op['fields'])
            seal(b)
            with patch('identity_repair.load_reviews',return_value=[review]):
                with self.assertRaisesRegex(ValueError,'additional documents|Ambiguous reference'):plan_v2(b)

    def test_reconstruction_rejects_any_changed_mapped_balance(self):
        b,op,review=fixture()
        with patch('identity_repair.load_reviews',return_value=[review]):p=plan_v2(b)
        d=next(d for d in p['documents'] if d['name'].endswith('/clientes/clientes-reviewed-B'))
        d['fields']['data']['mapValue']['fields']['saldoDevedorBRL']={'integerValue':'0'}
        with self.assertRaisesRegex(ValueError,'content differs'):reconstruct_fields(p)

if __name__=='__main__':unittest.main()
