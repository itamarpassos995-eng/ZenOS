#!/usr/bin/env python3
"""Offline lossless V1 -> individual-document V2 plan. NO network or writes.

Output is a staged generation, never an activation flag or migration command.
Firestore typed values preserve legacy fields and the original ID's type.
"""
import argparse
import copy
import json
from urllib.parse import quote
from backup_readonly_v2 import verify, encoded, digest

COLLECTIONS = {"produtos": "produtos", "clientes": "clientes",
    "historicoVendas": "vendas", "historicoCompras": "compras",
    "caixaMovimentos": "movimentosCaixa", "sessoesCaixa": "sessoesCaixa",
    "vendedores": "operadores", "fornecedores": "fornecedores",
    "despesas": "despesas", "vouchers": "vouchers"}


def string(value):
    return {"stringValue": value}


def integer(value):
    return {"integerValue": str(value)}


def route_id(value):
    if "stringValue" in value:
        raw = value["stringValue"]
    elif "integerValue" in value:
        raw = value["integerValue"]
    else:
        raise ValueError("Unsupported legacy ID type; no coercion permitted")
    if not raw or raw in (".", "..") or len(raw.encode()) > 1000:
        raise ValueError("Invalid legacy ID; explicit mapping required")
    # Encode percent too: a/b and a%2Fb cannot collide. Payload ID is untouched.
    encoded_id = quote(raw, safe="-_~")
    if len(encoded_id.encode()) > 1500:
        raise ValueError("Encoded legacy ID exceeds Firestore limit")
    return encoded_id


def plan_v2(backup):
    verify(backup)
    root = f"projects/{backup['project']}/databases/(default)/documents/lojas/{backup['store']}"
    op = next(d for d in backup["documents"] if d["name"] == root + "/dados/operacao")
    generation = backup["checksum"][:24]
    target = root + "/v2_generations/" + generation
    docs, manifest, used = [], {}, set()

    def append(name, fields):
        if name in used:
            raise ValueError("Duplicate entity ID; migration refused")
        value = {"name": name, "fields": fields}
        if len(encoded(value)) > 262144:
            raise ValueError("Individual entity exceeds 256 KiB; split design required")
        used.add(name)
        docs.append(value)

    for field, typed in sorted(op["fields"].items()):
        if "arrayValue" not in typed:
            append(target + "/legacy_fields/" + quote(field, safe=""),
                   {"field": string(field), "value": copy.deepcopy(typed)})
            manifest[field] = {"kind": "value", "collection": "legacy_fields", "count": 1}
            continue
        collection = COLLECTIONS.get(field, "legacy_array_" + quote(field, safe=""))
        values = typed["arrayValue"].get("values", [])
        manifest[field] = {"kind": "array", "collection": collection,
                           "count": len(values), "emptyEncoding": copy.deepcopy(typed) if not values else None}
        for index, value in enumerate(values):
            fields = value.get("mapValue", {}).get("fields", {})
            legacy_id = fields.get("codigo") if field == "vouchers" else fields.get("id")
            if legacy_id is None:
                # Unknown arrays may contain primitives or anonymous maps.
                # Known business arrays need explicit identities before migration.
                if field in COLLECTIONS:
                    raise ValueError("Missing business ID; explicit mapping required")
                identifier = "index-" + str(index)
            else:
                identifier = route_id(legacy_id)
            append(target + "/" + collection + "/" + identifier,
                   {"data": copy.deepcopy(value), "legacyIndex": integer(index),
                    "legacyField": string(field)})
    result = {"format": "ZENOS_V2_COPY_ONLY_PLAN_1", "generation": generation,
        "sourceChecksum": backup["checksum"], "sourceOperationUpdateTime": op["updateTime"],
        "sourceFieldsChecksum": digest(op["fields"]), "sourceOperation": op["name"],
        "targetRoot": target, "state": "STAGED_NOT_ACTIVE", "fieldManifest": manifest,
        "documents": docs, "maxDocumentBytes": max(map(lambda d: len(encoded(d)), docs)),
        "productionWrites": 0, "applicationIntegrated": False,
        "activationAuthorized": False}
    if digest(reconstruct_fields(result)) != result["sourceFieldsChecksum"]:
        raise ValueError("Round-trip mismatch; migration refused")
    result["checksum"] = digest(result)
    return result


def reconstruct_fields(plan):
    result = {}
    for field, meta in plan["fieldManifest"].items():
        if meta["kind"] == "value":
            doc = next(d for d in plan["documents"] if d["name"] == plan["targetRoot"] + "/legacy_fields/" + quote(field, safe=""))
            result[field] = copy.deepcopy(doc["fields"]["value"])
        else:
            docs = [d for d in plan["documents"] if d["fields"].get("legacyField") == string(field)]
            docs.sort(key=lambda d: int(d["fields"]["legacyIndex"]["integerValue"]))
            if len(docs) != meta["count"] or [int(d["fields"]["legacyIndex"]["integerValue"]) for d in docs] != list(range(meta["count"])):
                raise ValueError("Missing or duplicated array positions")
            result[field] = ({"arrayValue": {"values": [copy.deepcopy(d["fields"]["data"]) for d in docs]}}
                             if docs else copy.deepcopy(meta["emptyEncoding"]))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup")
    args = parser.parse_args()
    with open(args.backup, encoding="utf-8") as source:
        plan = plan_v2(json.load(source))
    print(json.dumps({k: v for k, v in plan.items() if k not in ("documents", "fieldManifest")}, indent=2))
    print(json.dumps({"documentCount": len(plan["documents"]), "fieldCounts": {
        f: m["count"] for f, m in plan["fieldManifest"].items()}}, indent=2))
