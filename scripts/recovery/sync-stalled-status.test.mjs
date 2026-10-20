import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
test('stalled saving becomes pending with no new Firestore reads',()=>{
 assert.match(app,/x\.status === 'SALVANDO' && Date\.now\(\) - x\.at >= 30_000/);
 assert.match(app,/setInterval\(recalcularStatus, 5_000\)/);
 assert.match(app,/clearInterval\(statusTimer\)/);
 assert.match(app,/Confirmação da nuvem demorando/);
});
