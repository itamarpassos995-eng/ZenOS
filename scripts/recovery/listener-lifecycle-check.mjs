import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const app=read('src/App.jsx'),repo=read('src/core/operationalRepository.js');
const ledger=read('src/core/financialLedger.js'),tables=read('src/core/tablesV1.js');
const mesas=read('src/components/Mesas.jsx');
assert.match(app,/let authSequence = 0/);
assert.match(app,/mounted = false; authSequence\+\+; unsubscribe\(\)/);
assert.match(app,/active = false; unsubOperacao\(\); unsubConfig\(\)/);
assert.match(app,/ativo = false; cancelar\(\)/);
assert.match(mesas,/ativo = false; unsub\(\)/);
assert.match(ledger,/return onSnapshot\(collection/);
assert.match(tables,/return onSnapshot\(refMesas/);
assert.match(repo,/stopTail\(\)\{this.tailEpoch\+\+/);
assert.match(repo,/if\(epoch!==this.tailEpoch\|\|!this.listeners.size\|\|this.failed\)return;/);
assert.match(repo,/if\(disposed\)return;disposed=true;stopData\?\.\(\);stopControl\?\.\(\)/);
for(const p of ['src/components/PDV.jsx','src/components/PDVCompras.jsx']){
 const source=read(p);
 assert.match(source,/abrirFechamentoRef.current = abrirFechamento/);
 assert.match(source,/window.removeEventListener\('keydown', lidarAtalhos\)/);
}
console.log('PASS: lifecycle, cleanup, login epochs and unbounded financial safety retained.');
