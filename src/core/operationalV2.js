import {exchangeRateSnapshotsEqual} from './exchangeRateGuard.js';
import {doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import {peekV2Session} from './operationalRepository.js';
import {V2_COLLECTIONS,V2_VALUES,entityIdV2,encodeV2Id,cleanV2Value,hashV2,stableV2Json,v2ControlPath,v2Error} from './operationalV2Schema.js';
import {businessOperationChecks as checks,recordSyncMetric} from './productionSync.js';
import {mergeV1FieldThreeWay,syncValuesEqual,cloneSyncValue} from './syncMerge.js';
import {criarLancamentoFinanceiro} from './financialLedgerCore.js';
import {notifyPersistenceStatus} from './persistenceSafety.js';
const bytes=v=>new TextEncoder().encode(stableV2Json(v)).length;
const sanitize=value=>String(value??'sem-id').replaceAll('/','_');
const indexed=(field,list)=>{
 const map=new Map();for(const item of list||[]){const id=encodeV2Id(entityIdV2(field,item));
 if(map.has(id))throw v2Error('V2_DUPLICATE_ID','Identificador duplicado; operação bloqueada.');map.set(id,item);}return map;
};
const requireSize=(value,max,code)=>{if(bytes(value)>max)throw v2Error(code,'Operação excede o limite seguro. Divida em operações menores.');};

// A complete server-confirmed session is pinned to the generation's sequence.
// The head is a transaction fence: a concurrent writer forces catch-up before
// reusing any cached data for business guards. No V1 data is written here.
export async function persistV2BusinessOperationSafe({db,userId,changes=[],financialEntries=[],stockEvents=[],guards=[],operationKey=null,budgetField='operacao_critica'}){
 const session=peekV2Session(db,userId);
 try{
  if(!session||session.failed)throw session?.failed||v2Error('V2_SESSION','Recarregue os dados da loja.');
  if(session.control.mode!=='v2')throw v2Error('V2_READ_ONLY','Loja em manutenção; gravações bloqueadas.');
  const valid=changes.filter(c=>c?.field);
  if(!valid.length||new Set(valid.map(c=>c.field)).size!==valid.length)throw v2Error('V2_CHANGES','Alterações vazias ou campos repetidos.');
  for(const c of valid){
   if(!V2_COLLECTIONS[c.field]&&!V2_VALUES.includes(c.field))throw v2Error('V2_UNKNOWN_FIELD',`Campo não integrado: ${c.field}.`);
   if(!session.manifest?.[c.field])throw v2Error('V2_MANIFEST_FIELD','Campo ausente da cópia certificada; reconciliação necessária.');
   if(c.field==='_syncMeta')throw v2Error('V2_METADATA','Metadados são gerenciados pela transação.');
   if(c.baseValue===undefined)throw v2Error('V2_BASE_REQUIRED','Base confirmada ausente. Recarregue antes de editar.');
   if(V2_COLLECTIONS[c.field]&&(!Array.isArray(c.value)||!Array.isArray(c.baseValue)))throw v2Error('V2_ARRAY','Campo deve preservar a lista legada.');
  }
  if(budgetField==='operacao_batch'&&valid.every(c=>syncValuesEqual(c.value,c.baseValue))){
   const data=session.materialize(),values=Object.fromEntries(valid.map(c=>[c.field,data[c.field]]));
   const local=checks.persistConfirmedLocalCache(valid,values),localOk=[...local.values()].every(r=>r.ok);
   return {ok:localOk,cloudOk:true,localOk,skipped:true,values,revisions:{...session.revisions}};
  }
  // Hash only the actual command delta. The complete legacy-shaped arrays
  // stay in memory for approved business calculations, not in each receipt.
  const commandChanges=valid.map(c=>{
   if(!V2_COLLECTIONS[c.field])return {field:c.field,value:c.value,baseValue:c.baseValue};
   const base=indexed(c.field,c.baseValue),local=indexed(c.field,c.value),entities=[];
   for(const id of new Set([...base.keys(),...local.keys()]))if(!syncValuesEqual(base.get(id),local.get(id)))entities.push({id,base:base.get(id),local:local.get(id)});
   return {field:c.field,entities,removeEntityIds:c.removeEntityIds};
  });
  const meaningful=cleanV2Value({changes:commandChanges,financialEntries,stockEvents,guards});
  requireSize(meaningful,4_000_000,'V2_REQUEST_SIZE');
  const fingerprint=await hashV2(meaningful),key=String(operationKey||`edit:${fingerprint}`),receiptId=await hashV2(key);
  const budget=checks.consumeWriteBudget(budgetField);if(!budget.ok)throw budget.error;
  notifyPersistenceStatus({status:'SALVANDO',field:'operacao_v2'});
  let result;
  for(let attempt=0;attempt<5;attempt++){
   await session.catchUp();
   const sequence=session.sequence,remote=session.materialize(),baseRevisions={...session.revisions};
   const pinnedRecords=new Map([...session.records].map(([f,records])=>[f,new Map(records)]));
   try{
    result=await runTransaction(db,async tx=>{
     const control=await tx.get(doc(db,...v2ControlPath(userId)));
     if(!control.exists()||control.data().mode!=='v2'||control.data().generation!==session.generation
       ||stableV2Json(control.data())!==stableV2Json(session.control))throw v2Error('V2_ROUTE_CHANGED','Armazenamento mudou; recarregue antes de operar.');
     const headRef=doc(db,...session.root),receiptRef=doc(db,...session.root,'operations',receiptId);
     const head=await tx.get(headRef),prior=await tx.get(receiptRef);
     if(prior.exists()){
      if(prior.data().fingerprint!==fingerprint)throw v2Error('V2_IDEMPOTENCY_CONFLICT','Esta operação já existe com conteúdo diferente.');
      return {receipt:prior.data(),alreadyCommitted:true};
     }
     if(!head.exists()||head.data().state!=='ready')throw v2Error('V2_NOT_READY','Geração indisponível.');
     if(Number(head.data().sequence||0)!==sequence)throw v2Error('V2_RETRY_SEQUENCE','Outra operação avançou a loja.');
     const fx=guards.find(g=>g?.type==='cash_close_exchange_rates_match');
     if(fx){const config=await tx.get(doc(db,'lojas',String(userId),'dados','configuracoes'));
      if(config.data()?.taxasCambio&&!exchangeRateSnapshotsEqual(config.data().taxasCambio,fx.taxas))throw v2Error('ZENOS_CASH_FX_CHANGED','Cotação mudou; refaça o fechamento.');}
     checks.assertBusinessGuards(remote,guards);checks.assertStockEventsAgainstRemote(remote,stockEvents);
     const next=sequence+1,revisions={...baseRevisions},fieldCounts={...(head.data().fieldCounts||Object.fromEntries(Object.entries(head.data().fieldManifest).filter(([,m])=>m.kind==='array').map(([f,m])=>[f,m.count])))},patches=[],writes=[],confirmedValues={};
     for(const c of valid){
      let merged=mergeV1FieldThreeWay({field:c.field,baseValue:c.baseValue,localValue:c.value,remoteValue:remote[c.field]});
      merged=checks.applyGuardedEntityRemovals({field:c.field,mergedValue:merged,removeEntityIds:c.removeEntityIds,guards});
      checks.assertMergedFieldInvariants({field:c.field,mergedValue:merged,baseValue:c.baseValue,localValue:c.value});
      revisions[c.field]=(Number(revisions[c.field])||0)+1;confirmedValues[c.field]=cloneSyncValue(merged);
      if(V2_COLLECTIONS[c.field]){
       fieldCounts[c.field]=merged.length;
       const before=indexed(c.field,remote[c.field]),after=indexed(c.field,merged);
       for(const id of new Set([...before.keys(),...after.keys()])){
        if(syncValuesEqual(before.get(id),after.get(id)))continue;
        if(writes.length>=350)throw v2Error('V2_READ_BUDGET','Muitas entidades alteradas em uma operação.');
        const cached=pinnedRecords.get(c.field)?.get(id),ref=doc(db,...session.root,V2_COLLECTIONS[c.field],id);
        const actual=await tx.get(ref);
        if(stableV2Json(actual.exists()?actual.data():null)!==stableV2Json(cached?Object.fromEntries(Object.entries(cached).filter(([k])=>!['routeId','field'].includes(k))):null))
         throw v2Error('V2_ENTITY_DIVERGED','Registro mudou fora do protocolo. Operação bloqueada para reconciliação.');
        if(cached?.deleted&&after.has(id))throw v2Error('V2_REUSE_ID','ID histórico removido não pode ser reutilizado.');
        const patch=cleanV2Value({field:c.field,routeId:id,data:after.get(id)??before.get(id),deleted:!after.has(id),
         legacyField:c.field,legacyIndex:cached?.legacyIndex??(-next*1000+patches.length),version:next,commandId:receiptId});
        requireSize(patch,256_000,'V2_ENTITY_SIZE');patches.push(patch);
        const {field,routeId,...envelope}=patch;writes.push({ref,value:envelope});
       }
      }else if(!syncValuesEqual(merged,remote[c.field])){
       const patch={field:c.field,value:cleanV2Value(merged),version:next,commandId:receiptId};patches.push(patch);
       writes.push({ref:doc(db,...session.root,'legacy_fields',encodeV2Id(c.field)),value:patch});
      }
     }
     const normalized=financialEntries.filter(e=>Number(e?.valor)>0).map(e=>cleanV2Value(criarLancamentoFinanceiro({...e,lojaId:userId})));
     const ledger=normalized.map(e=>({ref:doc(db,'lojas',String(userId),'financeiro_livro',sanitize(e.id)),value:e}));
     const audit=stockEvents.filter(e=>e?.id&&e?.produtoId!=null).map(e=>({ref:doc(db,'lojas',String(userId),'estoque_auditoria',sanitize(e.produtoAuditKey||`${e.produtoId}-${e.sku||''}`),'movimentos',sanitize(e.id)),value:cleanV2Value(e)}));
     const paths=new Set();for(const w of [...writes,...ledger,...audit]){
      if(paths.has(w.ref.path))throw v2Error('V2_DUPLICATE_WRITE','Destino duplicado na operação.');paths.add(w.ref.path);}
     const count=writes.length+ledger.length+audit.length+2;
     if(normalized.length>350)throw v2Error('V2_FINANCE_BUDGET','Muitos lançamentos em uma operação.');
     if(count>450||writes.length+ledger.length+audit.length+4+(fx?1:0)>400)throw v2Error('ZENOS_ATOMIC_WRITE_LIMIT','Operação excede o orçamento de leitura/gravação.');
     for(const w of [...ledger,...audit])if((await tx.get(w.ref)).exists())throw v2Error('V2_HISTORY_COLLISION','Histórico já existe sem comprovante da operação. Reconciliação necessária.');
     const receipt=cleanV2Value({schema:2,key,fingerprint,sequence:next,revisions,patches,financialEntries:normalized,
      reads:writes.length+ledger.length+audit.length+4+(fx?1:0),writes:count,createdAtClient:new Date().toISOString()});
     requireSize(receipt,750_000,'V2_RECEIPT_SIZE');requireSize([...writes,...ledger,...audit].map(w=>w.value),2_000_000,'V2_COMMIT_SIZE');
     for(const w of writes)tx.set(w.ref,w.value);
     for(const w of [...ledger,...audit])tx.set(w.ref,{...w.value,serverRecordedAt:serverTimestamp(),_v2:{generation:session.generation,commandId:receiptId,sequence:next}});
     tx.set(receiptRef,receipt);tx.update(headRef,{sequence:next,lastReceipt:receiptId,fieldCounts,fieldRevisions:revisions,updatedAtServer:serverTimestamp()});
     return {receipt,alreadyCommitted:false,confirmedValues};
    });break;
   }catch(e){
    // Rules can reject a stale write before the Web SDK reports an ABORTED
    // conflict. Retry only with evidence of a newer head in this same route.
    let changed=e.code==='V2_RETRY_SEQUENCE';
    if(e.code==='permission-denied'){
     const [latest,route]=await Promise.all([getDocFromServer(doc(db,...session.root)),getDocFromServer(doc(db,...v2ControlPath(userId)))]);
     changed=Number(latest.data()?.sequence||0)>sequence&&stableV2Json(route.data())===stableV2Json(session.control);
    }
    if(!changed||attempt===4)throw e;
   }
  }
  // Reconcile receipts rather than guessing which concurrent after-image won.
  let confirmationSyncError=null;
  try{await session.catchUp();}catch(error){
   // The server already confirmed the transaction. A later read failure must
   // never turn that confirmed sale into a reported failed charge.
   confirmationSyncError=error;
   if(result.receipt.sequence===session.sequence+1)session.apply(result.receipt);
   session.fail(error);
  }
  const data=session.materialize(),values=confirmationSyncError&&result.confirmedValues?result.confirmedValues:Object.fromEntries(valid.map(c=>[c.field,cloneSyncValue(data[c.field])]));
  const locals=checks.persistConfirmedLocalCache(valid,values),localOk=[...locals.values()].every(r=>r.ok);
  recordSyncMetric(result.alreadyCommitted?'idempotentReplays':'writesOk','operacao_v2');
  notifyPersistenceStatus({status:localOk&&!confirmationSyncError?'SINCRONIZADO':'ERRO',field:'operacao_v2',cloudOk:true,localOk,error:confirmationSyncError?.message});
  return {ok:localOk,cloudOk:true,localOk,requiresReload:!!confirmationSyncError,values,revisions:{...session.revisions},financialEntries:result.receipt.financialEntries,
   alreadyCommitted:result.alreadyCommitted,sequence:result.receipt.sequence,reads:result.receipt.reads,writes:result.receipt.writes};
 }catch(error){
  checks.recordQuotaFailure(error,'operacao_v2');recordSyncMetric('writeErrors','operacao_v2');
  notifyPersistenceStatus({status:'PENDENTE',field:'operacao_v2',cloudOk:false,error:error.message});
  return {ok:false,cloudOk:false,error,values:{},revisions:{}};
 }
}
