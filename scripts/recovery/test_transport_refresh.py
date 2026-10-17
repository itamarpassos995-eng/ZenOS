import io
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from production_recovery import Transport

RESOURCE='projects/zenos-ac6b2/databases/(default)/documents/lojas/test/dados/operacao'


class TransportRefreshTests(unittest.TestCase):
    def test_small_version_read_requests_mask_and_retains_server_update_time(self):
        api=Transport('test')
        with patch('production_recovery.urllib.request.urlopen',return_value=io.BytesIO(b'{"updateTime":"version-1","fields":{}}')) as opened:
            self.assertEqual(api.version(RESOURCE),'version-1')
        self.assertTrue(opened.call_args.args[0].full_url.endswith('?mask.fieldPaths=_syncMeta'))
    def test_connection_failure_retries_only_get(self):
        api=Transport('test')
        with patch('production_recovery.time.sleep'),patch('production_recovery.urllib.request.urlopen',side_effect=[TimeoutError(),io.BytesIO(b'{}')]) as opened:
            self.assertEqual(api('firestore','GET',RESOURCE),{})
        self.assertEqual(opened.call_count,2)
        with patch('production_recovery.urllib.request.urlopen',side_effect=TimeoutError()) as opened:
            with self.assertRaisesRegex(RuntimeError,'without replaying writes'):
                api('firestore','POST','projects/zenos-ac6b2/databases/(default)/documents:commit',{'writes':[]})
        self.assertEqual(opened.call_count,1)
    def test_expired_read_renews_once_and_repeats_identical_resource(self):
        refresh=Mock(return_value='new-test-credential')
        api=Transport('old-test-credential',refresh=refresh)
        with patch('production_recovery.urllib.request.urlopen',side_effect=[HTTPError('https://firestore.googleapis.com',401,'expired',{},None),io.BytesIO(b'{"ok":true}')]) as opened:
            self.assertEqual(api('firestore','GET',RESOURCE),{'ok':True})
        refresh.assert_called_once()
        first,second=[c.args[0] for c in opened.call_args_list]
        self.assertEqual(first.full_url,second.full_url)
        self.assertNotEqual(first.get_header('Authorization'),second.get_header('Authorization'))
    def test_unauthorized_mutation_is_never_replayed(self):
        refresh=Mock(return_value='unused')
        api=Transport('test',refresh=refresh)
        with patch('production_recovery.urllib.request.urlopen',side_effect=HTTPError('https://firestore.googleapis.com',401,'expired',{},None)) as opened:
            with self.assertRaisesRegex(RuntimeError,'401'):
                api('firestore','POST','projects/zenos-ac6b2/databases/(default)/documents:commit',{'writes':[]})
        self.assertEqual(opened.call_count,1);refresh.assert_not_called()
    def test_long_snapshot_triggers_proactive_renewal(self):
        refresh=Mock(return_value='fresh')
        api=Transport('test',refresh=refresh);api.token_time-=121
        with patch('production_recovery.urllib.request.urlopen',return_value=io.BytesIO(b'{}')):
            api('firestore','GET',RESOURCE)
        refresh.assert_called_once()


if __name__=='__main__':unittest.main()
