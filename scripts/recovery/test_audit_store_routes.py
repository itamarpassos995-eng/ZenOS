import unittest
from audit_store_routes import inventory

def doc(data):
    def typed(v):
        if isinstance(v, bool): return {'booleanValue':v}
        if isinstance(v, int): return {'integerValue':str(v)}
        if isinstance(v, str): return {'stringValue':v}
        if isinstance(v, list): return {'arrayValue':{'values':[typed(x) for x in v]}}
        return {'mapValue':{'fields':{k:typed(x) for k,x in v.items()}}}
    return {'fields':{k:typed(v) for k,v in data.items()}}

class AuditTests(unittest.TestCase):
    def test_bounded_reads_without_v2_collection_or_legacy_history_scan(self):
        calls=[]
        base='projects/demo-zenos-local/databases/(default)'
        root=base+'/documents/lojas'
        cert={k:True for k in ('productionReady','v1WritersFenced','finalReconciliationPassed','pdvIntegrationPassed','rollbackPrepared')}
        cert['sourceChecksum']='hash'
        responses={base:{'databaseEdition':'STANDARD','type':'FIRESTORE_NATIVE'},
            root:{'documents':[{'name':root+'/old',**doc({'email':'owner@example.test'})},{'name':root+'/v2',**doc({})}]},
            root+'/old/dados/operacao':doc({'clientes':[{'id':'private','nome':'SECRET'}]}),
            root+'/v2/dados/storage_control':doc({'mode':'v2','generation':'a'*24,'sourceChecksum':'hash','certificate':cert}),
            root+'/v2/v2_generations/'+'a'*24:doc({'schema':2,'state':'ready','sourceChecksum':'hash','fieldCounts':{'clientes':1}})}
        def api(method,path,params=None):
            self.assertEqual(method,'GET');calls.append(path);return responses.get(path)
        result=inventory(api,'demo-zenos-local',read_time='point-in-time')
        self.assertEqual(len(calls),6)
        self.assertEqual(result['stores'][0]['action'],'migration-window-required')
        self.assertEqual(result['stores'][1]['action'],'already-v2')
        self.assertNotIn('SECRET',str(result))
        self.assertNotIn(root+'/v2/dados/operacao',calls)
        with self.assertRaisesRegex(RuntimeError,'budget'):inventory(api,'demo-zenos-local',max_stores=1)

if __name__=='__main__':unittest.main()
