import copy
import unittest
from unittest.mock import patch, MagicMock
from backup_readonly_v2 import ReadOnlyAPI, collect, verify

DB = "projects/demo-zenos-local/databases/(default)"
ROOT = DB + "/documents/lojas/central"
TIME = "2026-10-16T23:00:00.000000Z"


def document(path, fields=None):
    return {"name": path, "fields": fields or {}, "createTime": TIME, "updateTime": TIME}


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.changed = False
        self.fail_audit = False
        self.op = document(ROOT + "/dados/operacao", {
            "legacyUnknown": {"mapValue": {"fields": {
                "precise": {"integerValue": "9007199254740993"},
                "blob": {"bytesValue": "AP8="},
                "when": {"timestampValue": "2026-10-16T23:00:00.123456789Z"}}}},
            "produtos": {"arrayValue": {"values": [{"mapValue": {"fields": {
                "id": {"stringValue": "SKU/legado"},
                "estoque": {"doubleValue": 1.5}}}}]}}})

    def __call__(self, method, resource, params=None, body=None):
        self.calls.append((method, resource, params, body))
        if resource == DB:
            return {"databaseEdition": "STANDARD", "type": "FIRESTORE_NATIVE"}
        if resource == ROOT:
            return document(ROOT)
        if resource == self.op["name"]:
            d = copy.deepcopy(self.op)
            if self.changed and not params:
                d["updateTime"] = "2026-10-16T23:01:00Z"
            return d
        if resource.endswith(":listCollectionIds"):
            if resource == ROOT + ":listCollectionIds":
                if body.get("pageToken"):
                    return {"collectionIds": ["estoque_auditoria"]}
                return {"collectionIds": ["dados"], "nextPageToken": "second"}
            if resource == ROOT + "/estoque_auditoria/orphan:listCollectionIds":
                return {"collectionIds": ["movimentos"]}
            return {}
        if resource == ROOT + "/dados":
            return {"documents": [self.op, document(ROOT + "/dados/configuracoes")]}
        if resource == ROOT + "/estoque_auditoria":
            return {"documents": [{"name": ROOT + "/estoque_auditoria/orphan"}]}
        if resource == ROOT + "/estoque_auditoria/orphan/movimentos":
            if self.fail_audit:
                raise RuntimeError("denied")
            return {"documents": [document(resource + "/event-1")]}
        raise AssertionError(resource)


class BackupTests(unittest.TestCase):
    def test_timeout_during_body_read_retries_identical_read(self):
        api = ReadOnlyAPI("not-a-real-token")
        broken = MagicMock()
        broken.__enter__.return_value.read.side_effect = TimeoutError()
        success = MagicMock()
        success.__enter__.return_value.read.return_value = b'{"documents": []}'
        with patch("urllib.request.urlopen", side_effect=[broken, success]) as opened, patch("time.sleep"):
            self.assertEqual(api("GET", ROOT + "/dados", params={"readTime": TIME, "pageToken": "same"}), {"documents": []})
            self.assertIs(opened.call_args_list[0].args[0], opened.call_args_list[1].args[0])
            self.assertIn("readTime=", opened.call_args.args[0].full_url)
        self.assertEqual(api.requests, 2)

    def test_retries_are_bounded_and_count_against_budget(self):
        api = ReadOnlyAPI("not-a-real-token")
        with patch("urllib.request.urlopen", side_effect=TimeoutError()) as opened, patch("time.sleep"):
            with self.assertRaisesRegex(RuntimeError, "3 tentativas"):
                api("GET", ROOT)
            self.assertEqual(opened.call_count, 3)
        api = ReadOnlyAPI("not-a-real-token", max_requests=1)
        with patch("urllib.request.urlopen", side_effect=TimeoutError()) as opened, patch("time.sleep"):
            with self.assertRaisesRegex(RuntimeError, "budget"):
                api("GET", ROOT)
            self.assertEqual(opened.call_count, 1)

    def test_complete_typed_backup_preserves_unknown_fields_orphan_audit_and_time(self):
        api = FakeAPI()
        result = collect(api, "demo-zenos-local", "central", TIME)
        self.assertEqual(verify(result)["documents"], 4)
        self.assertEqual(result["missingAncestors"], [ROOT + "/estoque_auditoria/orphan"])
        self.assertIn(api.op, result["documents"])
        for method, resource, params, body in api.calls:
            if resource == DB or (resource == api.op["name"] and not params):
                continue
            self.assertEqual((body or params)["readTime"], TIME)
        self.assertTrue(result["operationUnchangedAtEnd"])

    def test_changed_v1_does_not_certify_cutover(self):
        api = FakeAPI()
        api.changed = True
        self.assertFalse(collect(api, "demo-zenos-local", "central", TIME)["operationUnchangedAtEnd"])

    def test_denied_audit_aborts_instead_of_silent_incomplete_backup(self):
        api = FakeAPI()
        api.fail_audit = True
        with self.assertRaisesRegex(RuntimeError, "denied"):
            collect(api, "demo-zenos-local", "central", TIME)

    def test_tampered_or_dropped_document_fails_verification(self):
        backup = collect(FakeAPI(), "demo-zenos-local", "central", TIME)
        backup["documents"].pop()
        with self.assertRaises(ValueError):
            verify(backup)

    def test_document_and_byte_budgets_fail_closed(self):
        for kwargs in [{"max_documents": 1}, {"max_bytes": 1}]:
            with self.assertRaises(RuntimeError):
                collect(FakeAPI(), "demo-zenos-local", "central", TIME, **kwargs)

    def test_transport_rejects_every_write_before_network_or_token_exposure(self):
        api = ReadOnlyAPI("not-a-real-token")
        for method, resource in [("PATCH", ROOT), ("DELETE", ROOT),
                                  ("POST", DB + "/documents:commit"),
                                  ("GET", "https://example.com/steal")]:
            with self.assertRaises(ValueError):
                api(method, resource)
        self.assertEqual(api.requests, 0)


if __name__ == "__main__":
    unittest.main()
