import tempfile
import unittest
from pathlib import Path
from native_v2_release import prepare,publish_rules,enable,RELEASE,POLICY
from test_production_recovery import MemoryTransport,fixture

class NativeReleaseTests(unittest.TestCase):
    def test_release_is_separate_from_enable_and_never_writes_store_data(self):
        api=MemoryTransport(fixture())
        before=dict(api.docs)
        with tempfile.TemporaryDirectory() as tmp:
            prepare(api,tmp)
            self.assertEqual(api.docs,before)
            with self.assertRaisesRegex(RuntimeError,'not the active'):enable(api,tmp,'a'*40)
            publish_rules(api,tmp)
            self.assertEqual(api.docs,before)
            result=enable(api,tmp,'a'*40)
            self.assertTrue(result['newAccountsEnabled'])
            self.assertEqual(set(api.docs)-set(before),{POLICY})
            self.assertEqual(enable(api,tmp,'a'*40),{'alreadyEnabled':True,'storesMigrated':0})
            with self.assertRaisesRegex(RuntimeError,'differs'):enable(api,tmp,'b'*40)
            self.assertEqual({k:v for k,v in api.docs.items() if k!=POLICY},before)

    def test_tampering_and_changed_live_rules_stop_release(self):
        api=MemoryTransport(fixture())
        with tempfile.TemporaryDirectory() as tmp:
            prepare(api,tmp)
            api.source+='\n// concurrent harmless source change'
            with self.assertRaisesRegex(RuntimeError,'changed'):publish_rules(api,tmp)
            Path(tmp,'native.rules').write_text('allow everyone')
            with self.assertRaisesRegex(RuntimeError,'checksum'):publish_rules(api,tmp)

if __name__=='__main__':unittest.main()
