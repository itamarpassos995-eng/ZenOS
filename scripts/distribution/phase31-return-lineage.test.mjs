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

test('B4 rejects duplicate journal evidence even when the repeated entry looks valid',()=>{
 const result=check(sale,[journal,{...journal}]);
 assert.equal(result.classification,'CONFLICT');
 assert.equal(result.items[0].reason,'DUPLICATE_RETURN_JOURNAL');
 assert.equal(result.eligibleForExecution,false);
 assert.equal(result.externalSettlement,'UNVERIFIED');
});

test('B4 verifies partial and total returned quantities only with sale and journal snapshots',()=>{
 const base={...sale,totalBRL:100,itens:[{id:'I1',qtd:2,qtdDevolvida:2}],
  devolucoes:[{...sale.devolucoes[0],itens:[{itemVendaId:'I1',quantidade:1}]},
   {id:'D2',valorBRL:25,itens:[{itemVendaId:'I1',quantidade:1}]}]};
 const other={...journal,id:'DEVOLUCAO-D2',referenciaId:'D2',valor:25};
 const r=check(base,[journal,other]);
 assert.equal(r.classification,'VERIFIED');
 assert.equal(r.limitsVerified,true);
 assert.equal(r.limitEvidence,'RETURN_CAPACITY_MATCHED');
 assert.equal(r.eligibleForExecution,false);
 assert.equal(r.externalSettlement,'UNVERIFIED');
});

test('B4 blocks return above original quantity and original monetary value',()=>{
 const original={...sale,totalBRL:100,itens:[{id:'I1',qtd:2,qtdDevolvida:3}],
  devolucoes:[{...sale.devolucoes[0],itens:[{itemVendaId:'I1',quantidade:3}]}]};
 const overQty=check(original);
 assert.equal(overQty.classification,'CONFLICT');
 assert.equal(overQty.limitEvidence,'RETURN_QUANTITY_EXCEEDED');
 const overValue=check({...original,totalBRL:50,
  itens:[{id:'I1',qtd:3,qtdDevolvida:3}]});
 assert.equal(overValue.classification,'CONFLICT');
 assert.equal(overValue.limitEvidence,'RETURN_VALUE_EXCEEDED');
});

test('B4 never claims limits verified without original historical item evidence',()=>{
 const result=check();
 assert.equal(result.classification,'VERIFIED');
 assert.equal(result.limitsVerified,false);
 assert.equal(result.limitEvidence,'RETURN_QUANTITY_SOURCE_MISSING');
 assert.equal(result.eligibleForExecution,false);
});
