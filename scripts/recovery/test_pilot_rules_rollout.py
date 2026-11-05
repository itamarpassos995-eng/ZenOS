import unittest

from pilot_rules import BASELINE, generate, normalize


class RolloutRulesTests(unittest.TestCase):
    def test_native_fence_is_opt_in_and_survives_later_rollout(self):
        original=generate(BASELINE,'central')
        policy=generate(original,'vipe',native=True)
        self.assertIn("data.get('origin','')=='native-v2'",policy)
        self.assertIn("top=='system'&&identifier=='storage_policy'",policy)
        extended=generate(policy,'next')
        for store in ['central','vipe','next']:
            self.assertIn(f"store=='{store}'",extended)
        self.assertIn("data.get('origin','')=='native-v2'",extended)
        with self.assertRaises(ValueError):
            generate(policy.replace("&&!(top=='system'&&identifier=='storage_policy')",''),'next')

    def test_add_store_keeps_previous_fences_and_changes_only_predicate(self):
        central = generate(BASELINE, 'central')
        combined = generate(central, 'vipe')
        self.assertEqual(combined, central.replace(
            "return store=='central';", "return store=='central'||store=='vipe';"))
        self.assertEqual(generate(combined, 'central'), combined)
        self.assertEqual(generate(combined, 'vipe'), combined)

    def test_repeated_rollout_preserves_all_existing_stores(self):
        policy = generate(BASELINE, 'central')
        for store in ['vipe', 'new_store', 'other']:
            policy = generate(policy, store)
        for store in ['central', 'vipe', 'new_store', 'other']:
            self.assertIn(f"store=='{store}'", policy)
        self.assertEqual(generate(policy, 'central'), policy)

    def test_unreviewed_changes_or_extra_grants_are_rejected(self):
        policy = generate(BASELINE, 'central')
        mutations = [
            policy.replace('request.auth!=null&&', 'true&&', 1),
            policy.replace("return store=='central';", "return true;"),
            policy.replace("return store=='central';", "return store=='central'||true;"),
            policy + '\nmatch /{path=**} {allow read,write: if true;}\n',
            policy.replace('&&owner(store)', '', 1),
        ]
        for source in mutations:
            with self.subTest(source=source[-80:]):
                with self.assertRaisesRegex(ValueError, 'differ'):
                    generate(source, 'vipe')

    def test_whitespace_and_comments_do_not_change_reviewed_policy(self):
        policy = generate(BASELINE, 'central')
        self.assertEqual(normalize(generate('// reviewed\n' + policy, 'vipe')),
                         normalize(generate(policy, 'vipe')))

    def test_invalid_store_is_rejected(self):
        for store in ['', "a'||true", '../other', 'a/b']:
            with self.assertRaises(ValueError):
                generate(BASELINE, store)


if __name__ == '__main__':
    unittest.main()
