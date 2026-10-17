"""Generate an isolated pilot policy; never widen the existing deployment.

Accepted baseline is deliberately exact: the previously observed authenticated
catch-all. A different live policy requires review, never a guessed replacement.
"""
import re
from pathlib import Path


def normalize(source):
    return re.sub(r'\s+', '', re.sub(r'//[^\n]*|/\*[\s\S]*?\*/', '', source))


BASELINE = """rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  match /{document=**} { allow read, write: if request.auth != null; }
 }
}"""


def generate(source, pilot):
    if normalize(source) != normalize(BASELINE):
        raise ValueError('Live rules differ from reviewed baseline; no deployment performed')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', pilot):
        raise ValueError('Invalid pilot identifier')
    template = Path(__file__).with_name('v2-fenced-prototype.rules').read_text()
    marker = ' match /databases/{database}/documents {'
    # Recursive wildcard matches zero segments in rules_version=2. Thus root
    # documents, nested collections and collection-group reads are covered.
    addition = f"""
  function pilot(store){{return store=='{pilot}';}}
  // Preserve the reviewed baseline for every non-pilot top-level tree.
  // This clause can NEVER grant access inside the pilot tree.
  match /{{top}}/{{identifier}}/{{remaining=**}} {{
   allow read,write: if request.auth!=null&&!(top=='lojas'&&pilot(identifier));
  }}
  // Preserve owner access to approved pilot modules outside V2's protected
  // operational, ledger, audit and product-index collections.
  match /lojas/{{store}}/{{sub}}/{{remaining=**}} {{
   allow read,write: if pilot(store)&&owner(store)
    &&!(sub in ['dados','v2_generations','financeiro_livro','estoque_auditoria','produto_indices']);
  }}
  match /lojas/{{store}}/dados/{{kind}} {{
   allow read,write: if pilot(store)&&owner(store)&&!(kind in ['operacao','storage_control']);
  }}
"""
    if template.count(marker) != 1:
        raise ValueError('Unexpected policy template')
    return template.replace(marker, marker + addition).replace(
        '// PROTOTYPE: reviewed in Emulator only, never deployed.',
        '// Generated isolated pilot policy. Baseline and pilot must be verified before release.')
