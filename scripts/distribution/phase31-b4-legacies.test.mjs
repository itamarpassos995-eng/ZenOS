// B4 G4 historical return evidence: read-only, no refund / cash / fiscal effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySaleReturnHistory} from '../../src/core/distribution/phase31ReturnLineage.js';
const tenantId='T-LEGACY', saleId='S-LEGACY',customerId='C-LEGACY';
const sale=()=>({id:saleId,clienteId:customerId,totalBRL:100,
 itens:[{id:'I1',qtd:2,qtdDevolvida:1}],
 devolucoes:[{id:'D1',valorBRL:40,itens:[{itemVendaId:'I1',quantidade:1}],
  metodoReembolso:'transferencia'}]});
const entry=()=>({id:'DEVOLUCAO-D1',lojaId:tenantId,clienteId:customerId,
 tipo:'devolucao',referenciaId:'D1',valor:40,
 detalhes:{vendaId:saleId}});
const report=(s=sale(),ledger=[entry()])=>classifySaleReturnHistory({sale:s,ledger,tenantId});
test('G4 legacy journal is partial evidence, never proven bank restitution',()=>{
 const r=report();
 assert.equal(r.classification,'PARTIAL_EVIDENCE');
 assert.equal(r.items[0].reason,'LEGACY_INTERNAL_LEDGER_ONLY');
 assert.equal(r.limitsVerified,false);
 assert.equal(r.externalSettlement,'UNVERIFIED');
 assert.equal(r.fiscalAuthorization,'UNVERIFIED');
 assert.equal(r.eligibleForExecution,false);
});
test('G4 historical return missing journal cannot prove a refund',()=>{
 const r=report(sale(),[]);
 assert.equal(r.classification,'PARTIAL_EVIDENCE');
 assert.equal(r.items[0].reason,'JOURNAL_MISSING');
 assert.equal(r.eligibleForExecution,false);
});
test('G4 historical duplicate ledger is conflict not silently deduplicated',()=>{
 const j=entry(),r=report(sale(),[j,{...j}]);
 assert.equal(r.classification,'CONFLICT');
 assert.equal(r.items[0].reason,'DUPLICATE_RETURN_JOURNAL');
 assert.equal(r.eligibleForExecution,false);
});
test('G4 wrong tenant or customer cannot reconcile with an older sale',()=>{
 for(const mutation of [{lojaId:'OTHER'},{clienteId:'OTHER'},{referenciaId:'OTHER'},
  {detalhes:{vendaId:'OTHER'}}]){
  const r=report(sale(),[{...entry(),...mutation}]);
  assert.equal(r.classification,'CONFLICT');
  assert.equal(r.items[0].reason,'RETURN_SOURCE_MISMATCH');
 }
});
test('G4 historical over-return quantity or original value is conflict',()=>{
 const overQty=sale();overQty.devolucoes[0].itens[0].quantidade=3;
 const q=report(overQty);assert.equal(q.classification,'CONFLICT');
 assert.equal(q.limitEvidence,'RETURN_QUANTITY_EXCEEDED');
 const overMoney=sale();overMoney.totalBRL=30;
 const m=report(overMoney);assert.equal(m.classification,'CONFLICT');
 assert.equal(m.limitEvidence,'RETURN_VALUE_EXCEEDED');
});
test('G4 missing historical quantities, snapshot or original sum stays unverified',()=>{
 const withoutLines=sale();delete withoutLines.devolucoes[0].itens;
 const a=report(withoutLines);assert.equal(a.limitsVerified,false);
 assert.equal(a.limitEvidence,'RETURN_QUANTITY_EVIDENCE_MISSING');
 const withoutSnapshot=sale();delete withoutSnapshot.itens[0].qtdDevolvida;
 const b=report(withoutSnapshot);assert.equal(b.limitsVerified,false);
 assert.equal(b.limitEvidence,'RETURN_QUANTITY_SNAPSHOT_MISSING');
 const noOriginal=sale();delete noOriginal.totalBRL;
 const c=report(noOriginal);assert.equal(c.limitsVerified,false);
 assert.equal(c.limitEvidence,'RETURN_ORIGINAL_VALUE_MISSING');
});
test('G4 orphan journal for sale creates conflict and never authorizes compensation',()=>{
 const orphan={...entry(),id:'DEVOLUCAO-D2',referenciaId:'D2'};
 const r=report(sale(),[entry(),orphan]);
 assert.equal(r.classification,'CONFLICT');
 assert.equal(r.items.some(x=>x.reason==='ORPHAN_RETURN_JOURNAL'),true);
 assert.equal(r.eligibleForExecution,false);
});
