import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../../src/core/saleOutcomeReadOnly.js',import.meta.url),'utf8');
const pdv=readFileSync(new URL('../../src/components/PDV.jsx',import.meta.url),'utf8');
test('sem cache e sem escrita na consulta de comprovante',()=>{
 assert.match(core,/getDocFromServer/);
 assert.doesNotMatch(core,/getDocFromCache|getDocsFromCache|runTransaction|setDoc|updateDoc|deleteDoc/);
 assert.match(core,/receipt\?\.key!==key/);
 assert.match(core,/recent\.includes\(key\)&&match/);
 assert.match(core,/status:'unknown'/);
});
test('PDV consulta mesmo id e bloqueia reenvio orientado após status desconhecido',()=>{
 assert.match(pdv,/consultarResultadoVendaServidor\(\{db,userId,operationKey:/);
 assert.match(pdv,/NÃO cobre nem registre novamente/);
 assert.match(pdv,/resultadoServidor\.status === 'committed'/);
});
