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


NATIVE = "(exists(control(store))&&get(control(store)).data.get('origin','')=='native-v2')"


def generate(source, pilot, *, native=False):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', pilot):
        raise ValueError('Invalid pilot identifier')
    stores = {pilot}
    if normalize(source) != normalize(BASELINE):
        # Extend only a policy this generator can reproduce exactly. Retain
        # every previously fenced store; never reset an active V2 tenant to
        # the legacy catch-all while onboarding another tenant.
        match = re.search(r"function\s+pilot\(store\)\s*\{return\s+(.*?);\s*\}", source)
        if not match:
            raise ValueError('Live rules differ from reviewed baseline; no deployment performed')
        expression = match.group(1).strip()
        had_native = expression.endswith("||" + NATIVE)
        if had_native:
            expression = expression[:-(len(NATIVE) + 2)]
        native = native or had_native
        if not re.fullmatch(r"store=='[A-Za-z0-9_-]{1,128}'(?:\|\|store=='[A-Za-z0-9_-]{1,128}')*", expression):
            raise ValueError('Live rules differ from reviewed baseline; no deployment performed')
        previous = re.findall(r"store=='([A-Za-z0-9_-]{1,128})'", expression)
        # A self-consistent predicate is insufficient: verify the entire policy.
        expected = _render(previous, native=had_native)
        if normalize(source) != normalize(expected):
            raise ValueError('Live rules differ from reviewed baseline; no deployment performed')
        stores.update(previous)
    return _render(sorted(stores), native=native)


def _render(stores, *, native=False):
    predicate = '||'.join(f"store=='{store}'" for store in stores)
    if native:
        predicate += "||" + NATIVE
    policy_fence = "&&!(top=='system'&&identifier=='storage_policy')" if native else ""
    template = Path(__file__).with_name('v2-fenced-prototype.rules').read_text()
    marker = ' match /databases/{database}/documents {'
    # Recursive wildcard matches zero segments in rules_version=2. Thus root
    # documents, nested collections and collection-group reads are covered.
    addition = f"""
  function pilot(store){{return {predicate};}}
  // Preserve the reviewed baseline for every non-pilot top-level tree.
  // This clause can NEVER grant access inside the pilot tree.
  match /{{top}}/{{identifier}}/{{remaining=**}} {{
   allow read,write: if request.auth!=null&&!(top=='lojas'&&pilot(identifier)){policy_fence};
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
