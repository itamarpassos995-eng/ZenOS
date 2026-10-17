#!/usr/bin/env python3
"""Restore a verified typed backup ONLY to the loopback Firebase Emulator.

No host, credentials, or production-project override is accepted.
Creates documents with exists=false; refuses existing targets.
"""
import argparse
import json
import urllib.request
import urllib.error
import urllib.parse
from backup_readonly_v2 import verify, encoded, digest

BASE = "http://127.0.0.1:8080/v1/"
PROJECT = "demo-zenos-local"
DB = f"projects/{PROJECT}/databases/(default)"


def call(method, resource, body=None):
    if not resource.startswith(DB + "/documents"):
        raise ValueError("Only demo-zenos-local documents are permitted")
    req = urllib.request.Request(BASE + urllib.parse.quote(resource, safe="/():"),
        data=encoded(body) if body is not None else None, method=method,
        headers={"Content-Type": "application/json", "Authorization": "Bearer owner"})
    try:
        # Emulator traffic stays on loopback, never through an environment proxy.
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if method == "GET" and error.code == 404:
            return None
        raise RuntimeError(f"Emulator request failed: HTTP {error.code}") from None


def restore(backup):
    verify(backup)
    source_root = f"projects/{backup['project']}/databases/(default)/documents/lojas/{backup['store']}"
    target_root = DB + "/documents/lojas/recovery-" + backup["checksum"][:24]
    if call("GET", target_root):
        raise RuntimeError("Emulator destination already exists; refusing overwrite")
    writes, expected = [], {}
    for original in backup["documents"]:
        if original["name"] != source_root and not original["name"].startswith(source_root + "/"):
            raise ValueError("Document outside store scope")
        name = target_root + original["name"][len(source_root):]
        expected[name] = original.get("fields", {})
        writes.append({"update": {"name": name, "fields": expected[name]},
                       "currentDocument": {"exists": False}})
    for start in range(0, len(writes), 100):
        call("POST", DB + "/documents:commit", {"writes": writes[start:start + 100]})
        print(f"Restaurados {min(start + 100, len(writes))}/{len(writes)} documentos no Emulator", flush=True)
    for name, fields in expected.items():
        got = call("GET", name)
        if got is None or digest(got.get("fields", {})) != digest(fields):
            raise RuntimeError("Restoration field/type comparison failed")
    return {"restorationTested": True, "documentsCompared": len(expected),
            "allFieldsAndTypesEqual": True, "sourceChecksum": backup["checksum"],
            "targetProject": PROJECT, "targetRoot": target_root,
            "productionRequests": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup")
    args = parser.parse_args()
    with open(args.backup, encoding="utf-8") as source:
        result = restore(json.load(source))
    print(json.dumps(result, indent=2))
