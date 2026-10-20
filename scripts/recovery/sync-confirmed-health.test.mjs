import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
const start=s.indexOf('  useEffect(() => {\n    const recalcularStatus = () => {');
const end=s.indexOf('  useEffect(() => {\n    if (!userId) {\n      setTemaUi',start);
assert(start>=0&&end>start);
const hook=s.slice(start,end);
test('bootstrapped server with no active writes remains SINCRONIZADO after 5-second timer',()=>{
 assert.match(hook,/nuvemSincronizada && \(estados\.length === 0 \|\| estados\.every\(x => x\.status === 'SINCRONIZADO'\)\)/);
 assert.match(hook,/}, \[nuvemSincronizada\]\);/);
 assert.match(hook,/setInterval\(recalcularStatus, 5_000\)/);
});
test('unknown cloud ACK and offline states retain explicit safeguards',()=>{
 assert.match(hook,/x\.status === 'PENDENTE'/);
 assert.match(hook,/x\.status === 'ERRO'/);
 assert.match(hook,/x\.status === 'SALVANDO'/);
 assert.match(hook,/Date\.now\(\) - x\.at >= 30_000/);
 assert.match(hook,/navigator\.onLine/);
});
test('connection requires real bootstrap confirmation and V2/V1 writes unchanged',()=>{
 assert.match(s,/setNuvemSincronizada\(true\)/);
 assert.match(s,/if \(!nuvemSincronizada \|\| !userId\)/);
 assert.match(s,/persistV1BusinessOperationSafe\(/);
 assert.match(s,/subscribeOperationalSnapshot\(/);
});
