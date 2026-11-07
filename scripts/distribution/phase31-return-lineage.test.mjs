import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySaleReturnHistory} from '../../src/core/distribution/phase31ReturnLineage.js';
const sale={id:'S1',clienteId:'C1',devolucoes:[{id:'D1',valorBRL:75,metodoReembolso:'credito_fiado'}]};
const journal={id:'DEVOLUCAO-D1',lojaId:'T1',clienteId:'C1',tipo:'devolucao',
 referenciaId:'D1',valor:75,detalhes:{vendaId:'S1'},_v2:{commandId:'a'.repeat(64),sequence:3}};
const check=(s=sale,j=[journal])=>classifySaleReturnHistory({sale:s,ledger:j,tenantId:'T1'});
test('B4 records verified internal journal link without claiming bank or fiscal authorization',()=>{
 const r=check();
 assert.equal(r.classification,'VERIFIED');
 assert.equal(r.items[0].externalSettlement,'UNVERIFIED');
 assert.equal(r.eligibleForExecution,false);
 assert.equal(r.items[0].originalBRLCents,'7500');
});
test('B4 blocks legacy journal with no V2 receipt and missing journal',()=>{
 const legacy=check(sale,[{...journal,_v2:undefined}]);
 assert.equal(legacy.classification,'PARTIAL_EVIDENCE');
 assert.equal(check(sale,[]).items[0].reason,'JOURNAL_MISSING');
});
test('B4 refuses foreign tenant, customer, sale and amount disagreement',()=>{
 for(const bad of [{lojaId:'T2'},{clienteId:'C2'},{detalhes:{vendaId:'S2'}},{valor:76}]){
  const r=check(sale,[{...journal,...bad}]);
  assert.equal(r.classification,'CONFLICT');
  assert.equal(r.eligibleForExecution,false);
 }
});
test('B4 detects duplicate return ID and orphan journal without side effects',()=>{
 const s={...sale,devolucoes:[...sale.devolucoes,{...sale.devolucoes[0]}]};
 assert.equal(check(s).classification,'CONFLICT');
 const orphan={...journal,id:'DEVOLUCAO-D2',referenciaId:'D2'};
 assert.ok(check(sale,[journal,orphan]).items.some(i=>i.reason==='ORPHAN_RETURN_JOURNAL'));
});
