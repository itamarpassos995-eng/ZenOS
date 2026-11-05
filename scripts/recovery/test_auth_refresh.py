import io
import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from backup_readonly_v2 import ReadOnlyAPI
from production_recovery import Transport

def success():
    response=MagicMock()
    response.__enter__.return_value.read.return_value=b'{"ok":true}'
    return response

class AuthRefreshTests(unittest.TestCase):
    def test_read_only_refresh_replays_identical_paginated_read_without_sleep(self):
        for method,path,params,body in [
            ('GET','projects/demo-zenos-local/databases/(default)/documents/lojas',{'pageToken':'next','readTime':'same-point'},None),
            ('POST','projects/demo-zenos-local/databases/(default)/documents/lojas/demo:listCollectionIds',None,{'pageToken':'next','readTime':'same-point'}),
        ]:
            calls=[]
            def request(req,**kwargs):
                calls.append((req.method,req.full_url,req.data,req.get_header('Authorization')))
                if len(calls)==1:raise HTTPError(req.full_url,401,'expired',None,None)
                return success()
            provider=MagicMock(return_value='fresh-private-token')
            with patch('urllib.request.urlopen',side_effect=request),patch('backup_readonly_v2.time.sleep') as sleep:
                self.assertEqual(ReadOnlyAPI('old-private-token',token_provider=provider)(method,path,params,body),{'ok':True})
                sleep.assert_not_called()
            self.assertEqual(calls[0][:3],calls[1][:3])
            self.assertEqual(calls[1][3],'Bearer fresh-private-token')
            provider.assert_called_once()

    def test_repeated_401_stops_and_does_not_leak_credentials(self):
        provider=MagicMock(return_value='new-secret')
        with patch('urllib.request.urlopen',side_effect=HTTPError('https://firestore.googleapis.com/',401,'expired',None,None)) as request:
            with self.assertRaisesRegex(RuntimeError,'Autenticação Google recusada') as error:
                ReadOnlyAPI('old-secret',token_provider=provider)('GET','projects/demo-zenos-local/databases/(default)')
            self.assertEqual(request.call_count,2)
            provider.assert_called_once()
            self.assertNotIn('secret',str(error.exception))

    def test_production_get_refreshes_but_mutation_is_never_replayed(self):
        for method in ['GET','POST','PATCH']:
            provider=MagicMock(return_value='fresh')
            with patch('urllib.request.urlopen',side_effect=[HTTPError('https://firebaserules.googleapis.com/',401,'expired',None,None),success()]) as request:
                api=Transport('old',token_provider=provider)
                if method=='GET':
                    self.assertEqual(api('firebaserules',method,'projects/zenos-ac6b2/rulesets/test'),{'ok':True})
                    provider.assert_called_once();self.assertEqual(request.call_count,2)
                else:
                    with self.assertRaisesRegex(RuntimeError,'HTTP 401'):
                        api('firebaserules',method,'projects/zenos-ac6b2/rulesets/test',{})
                    provider.assert_not_called();self.assertEqual(request.call_count,1)

if __name__=='__main__':unittest.main()
