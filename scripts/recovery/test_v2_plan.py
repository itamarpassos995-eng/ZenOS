import copy
import unittest
from backup_readonly_v2 import digest
from test_backup_readonly import FakeAPI, TIME
from backup_readonly_v2 import collect
from v2_plan import plan_v2, reconstruct_fields, route_id


class PlanTests(unittest.TestCase):
    def test_missing_operator_persists_existing_app_fallback_with_required_pin_change(self):
        from create_minimal_demo_backup import minimal_backup
        b=minimal_backup();plan=plan_v2(b)
        admin=next(d for d in plan['documents'] if d['name'].endswith('/operadores/admin'))
        self.assertEqual(admin['fields']['data']['mapValue']['fields']['pinTrocaObrigatoria'],{'booleanValue':True})
        self.assertEqual(plan['fieldManifest']['vendedores']['count'],1)
        self.assertTrue(plan['fieldManifest']['vendedores']['sourceAbsent'])
        self.assertEqual(reconstruct_fields(plan),{'produtos':{'arrayValue':{}}})

    def test_missing_modules_are_writable_in_v2_without_changing_reconstructed_v1(self):
        backup=self.fixture()
        op=next(d for d in backup['documents'] if d['name'].endswith('/dados/operacao'))
        op['fields']={'vendedores':{'arrayValue':{}}}
        backup['checksums'][op['name']]=digest(op)
        backup['checksum']=digest({k:v for k,v in backup.items() if k!='checksum'})
        plan=plan_v2(backup)
        self.assertEqual(len(plan['fieldManifest']),13)
        self.assertTrue(plan['fieldManifest']['clientes']['sourceAbsent'])
        self.assertTrue(plan['fieldManifest']['regrasDesconto']['sourceAbsent'])
        self.assertEqual(reconstruct_fields(plan),op['fields'])

    def fixture(self):
        api = FakeAPI()
        api.op['fields']['unknownEmptyArray'] = {'arrayValue': {}}
        return collect(api, 'demo-zenos-local', 'central', TIME)

    def test_preserves_all_types_fields_order_and_source(self):
        backup = self.fixture()
        original = copy.deepcopy(backup)
        plan = plan_v2(backup)
        op = next(d for d in backup['documents'] if d['name'].endswith('/dados/operacao'))
        self.assertEqual(reconstruct_fields(plan), op['fields'])
        self.assertEqual(backup, original)
        self.assertFalse(plan['activationAuthorized'])
        self.assertEqual(plan, plan_v2(backup))

    def test_id_encoding_has_no_slash_percent_collision(self):
        a = route_id({'stringValue': 'a/b'})
        b = route_id({'stringValue': 'a%2Fb'})
        self.assertNotEqual(a, b)
        self.assertNotIn('/', a)
        self.assertEqual(route_id({'integerValue': '42'}), '42')

    def test_duplicate_ids_abort_without_overwrite(self):
        backup = self.fixture()
        op = next(d for d in backup['documents'] if d['name'].endswith('/dados/operacao'))
        op['fields']['produtos']['arrayValue']['values'] *= 2
        backup['checksums'][op['name']] = digest(op)
        backup['checksum'] = digest({k:v for k,v in backup.items() if k!='checksum'})
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            plan_v2(backup)

    def test_missing_position_prevents_reconstruction(self):
        plan = plan_v2(self.fixture())
        plan['documents'] = [d for d in plan['documents'] if '/produtos/' not in d['name']]
        with self.assertRaisesRegex(ValueError, 'Missing'):
            reconstruct_fields(plan)


if __name__ == '__main__':
    unittest.main()
