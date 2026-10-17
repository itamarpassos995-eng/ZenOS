#!/usr/bin/env python3
"""Incident 32: bounded, point-in-time, read-only Firestore subtree backup.

Uses the current gcloud identity; never prints tokens or document contents.
No Firestore write endpoint exists in this program. No third-party packages.
"""
import argparse
from contextlib import contextmanager
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


@contextmanager
def read_deadline(seconds=45):
    # Socket timeouts alone do not bound a response that trickles bytes or DNS.
    # Cloud Shell runs Unix on the main thread: bound the whole read attempt.
    enabled = hasattr(signal, 'setitimer') and threading.current_thread() is threading.main_thread()
    if not enabled:
        yield
        return
    def expired(signum, frame):
        raise TimeoutError('Firestore read deadline exceeded')
    previous = signal.getsignal(signal.SIGALRM)
    previous_timer = signal.getitimer(signal.ITIMER_REAL)
    if previous_timer[0] != 0:
        raise RuntimeError('An existing deadline must not be replaced')
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


class ReadOnlyAPI:
    def __init__(self, token, max_requests=20000, progress=None):
        self.token, self.max_requests, self.requests = token, max_requests, 0
        self.progress = progress or (lambda message: None)
        self.started = time.monotonic()

    def __call__(self, method, resource, params=None, body=None):
        # Reject all writes, untrusted hosts and traversal before sending credentials.
        if not re.fullmatch(r"projects/[a-z0-9-]+/databases/[^/]+(?:/documents(?:/[^?#]*)?)?", resource):
            raise ValueError("Invalid resource")
        if method != "GET" and not (method == "POST" and resource.endswith(":listCollectionIds")):
            raise ValueError("Only reads are permitted")
        url = "https://firestore.googleapis.com/v1/" + urllib.parse.quote(resource, safe="/():")
        if params:
            url += "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, method=method,
            data=encoded(body) if body is not None else None,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        for attempt in range(3):
            self.requests += 1
            if self.requests > self.max_requests or time.monotonic() - self.started > 2700:
                raise RuntimeError("Read/time budget exceeded; backup not certified")
            self.progress(f"Leitura {self.requests} — tentativa {attempt + 1}/3")
            try:
                with read_deadline(), urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read(32 * 1024 * 1024 + 1)
                    if len(raw) > 32 * 1024 * 1024:
                        raise RuntimeError("Response byte budget exceeded; backup not certified")
                    return json.loads(raw)
            except urllib.error.HTTPError as error:
                # Never print response payloads or credential headers.
                if error.code == 404 and method == "GET":
                    return None
                if error.code not in (429, 500, 502, 503, 504):
                    raise RuntimeError(f"Firestore read failed (HTTP {error.code}); backup not certified") from None
                if attempt == 2:
                    raise RuntimeError(f"Firestore read failed after 3 attempts (HTTP {error.code}); backup not certified") from None
            except (TimeoutError, urllib.error.URLError, http.client.IncompleteRead, ConnectionError):
                if attempt == 2:
                    raise RuntimeError("Leitura interrompida apos 3 tentativas; backup nao concluido. Nenhuma escrita na base.") from None
            # Retry only this exact read, with identical readTime/pageToken.
            self.progress("Conexao interrompida; repetindo somente esta leitura.")
            time.sleep(2 ** (attempt + 1))


def collect(api, project, store, read_time, max_documents=10000, max_bytes=268435456):
    database = f"projects/{project}/databases/(default)"
    metadata = api("GET", database)
    if metadata.get("databaseEdition") != "STANDARD" or metadata.get("type") != "FIRESTORE_NATIVE":
        raise RuntimeError("Expected STANDARD / FIRESTORE_NATIVE; stop and inspect database")
    root = database + "/documents/lojas/" + store
    documents, missing, collections = {}, [], []
    visited, byte_count = set(), 0

    def store_doc(document):
        nonlocal byte_count
        name = document.get("name", "")
        if name != root and not name.startswith(root + "/"):
            raise RuntimeError("Response escaped store scope")
        if name in documents:
            raise RuntimeError("Duplicate document in paginated backup")
        if not document.get("updateTime"):
            missing.append(name)
            return
        if len(documents) >= max_documents:
            raise RuntimeError("Document budget exceeded; backup not certified")
        byte_count += len(encoded(document))
        if byte_count > max_bytes:
            raise RuntimeError("Byte budget exceeded; backup not certified")
        documents[name] = document

    def pages(method, resource, result_key, parameters):
        token, seen = "", set()
        while True:
            payload = {**parameters, **({"pageToken": token} if token else {})}
            response = api(method, resource, params=payload if method == "GET" else None,
                           body=payload if method == "POST" else None)
            if response is None:
                raise RuntimeError("Missing collection page; backup not certified")
            yield from response.get(result_key, [])
            token = response.get("nextPageToken", "")
            if not token:
                break
            if token in seen:
                raise RuntimeError("Repeated page token; backup not certified")
            seen.add(token)

    def walk(parent, depth=0):
        if depth > 100 or parent in visited:
            raise RuntimeError("Invalid traversal; backup not certified")
        visited.add(parent)
        for collection in pages("POST", parent + ":listCollectionIds", "collectionIds",
                                {"pageSize": 100, "readTime": read_time}):
            if not collection or "/" in collection:
                raise RuntimeError("Invalid collection ID")
            collection_path = parent + "/" + collection
            collections.append(collection_path)
            for document in pages("GET", collection_path, "documents",
                                  {"pageSize": 20, "readTime": read_time, "showMissing": "true"}):
                store_doc(document)
                # showMissing includes ancestor placeholders with nested documents.
                walk(document["name"], depth + 1)

    root_doc = api("GET", root, params={"readTime": read_time})
    if not root_doc:
        raise RuntimeError("Store root absent at requested read time")
    store_doc(root_doc)
    walk(root)
    operation_path = root + "/dados/operacao"
    if operation_path not in documents:
        raise RuntimeError("V1 operation document absent; backup not certified")
    latest_operation = api("GET", operation_path)
    operation_unchanged = bool(latest_operation and
        digest(latest_operation) == digest(documents[operation_path]))
    payload = {"format": "ZENOS_FIRESTORE_TYPED_READONLY_1", "project": project,
        "store": store, "readTime": read_time, "database": metadata,
        "documents": [documents[k] for k in sorted(documents)],
        "missingAncestors": sorted(missing), "collections": sorted(collections),
        "checksums": {k: digest(v) for k, v in sorted(documents.items())},
        "operationUnchangedAtEnd": operation_unchanged,
        "scope": "Firestore store subtree only; excludes Auth users and Storage objects"}
    payload["checksum"] = digest(payload)
    return payload


def verify(backup):
    body = {k: v for k, v in backup.items() if k != "checksum"}
    if backup.get("format") != "ZENOS_FIRESTORE_TYPED_READONLY_1" or digest(body) != backup.get("checksum"):
        raise ValueError("Backup format/checksum invalid")
    seen = set()
    for doc in backup["documents"]:
        name = doc["name"]
        if name in seen or digest(doc) != backup["checksums"].get(name):
            raise ValueError("Document checksum invalid or duplicated")
        seen.add(name)
    if seen != set(backup["checksums"]):
        raise ValueError("Document inventory mismatch")
    return {"verified": True, "documents": len(seen), "checksum": backup["checksum"],
            "operationUnchangedAtEnd": backup["operationUnchangedAtEnd"],
            "restorationTested": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project")
    parser.add_argument("--store")
    parser.add_argument("--out")
    parser.add_argument("--verify", type=Path)
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(verify(json.loads(args.verify.read_bytes())), indent=2))
        return
    if not args.project or not args.store or not args.out:
        parser.error("--project, --store and --out are required for collection")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", args.project) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", args.store):
        parser.error("Invalid project/store identifiers")
    out = Path(args.out)
    if out.exists():
        parser.error("Output already exists: overwriting backups is forbidden")
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True,
                           text=True, timeout=30, check=True).stdout.strip()
    read_time = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=10)).isoformat(timespec="microseconds").replace("+00:00", "Z")
    print("Iniciando copia somente leitura. Aguarde as mensagens de andamento.", flush=True)
    api = ReadOnlyAPI(token, progress=lambda message: print(message, flush=True))
    backup = collect(api, args.project, args.store, read_time)
    result = verify(backup)
    # O_EXCL prevents races/accidental overwrite; private local backup only.
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as target:
        target.write(encoded(backup))
        target.flush()
        os.fsync(target.fileno())
    verify(json.loads(out.read_bytes()))
    print(json.dumps({**result, "requests": api.requests, "file": str(out)}, indent=2))
    if not backup["operationUnchangedAtEnd"]:
        print("ATTENTION: V1 changed after readTime. Snapshot preserved; NOT eligible for cutover.")


if __name__ == "__main__":
    main()
