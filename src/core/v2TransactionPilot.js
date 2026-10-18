// Isolated V2 transaction pilot. Deliberately NOT imported by the application.
// Production is blocked until the legacy adapters and deployment gates pass.
import {doc, runTransaction, serverTimestamp} from 'firebase/firestore';
import {ZENOS_RUNTIME} from './runtimeEnvironment.js';

const COLLECTIONS = new Set(['produtos','clientes','vendas','compras','movimentosCaixa',
  'sessoesCaixa','operadores','fornecedores','despesas','vouchers','devolucoes',
  'contasReceber','contasPagar','financeiro','auditoria']);
const FORBIDDEN = new Set(['__proto__','constructor','prototype']);
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
};
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(canonical(value)))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const id = value => {
  if (typeof value !== 'string' || !value || value==='.' || value==='..' || new TextEncoder().encode(value).length>1000) fail('V2_ID','Identificador inválido.');
  return encodeURIComponent(value).replace(/[!'()*]/g, c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
};
const fieldName = key => {
  if (!key || FORBIDDEN.has(key) || /[.\/]/.test(key)) fail('V2_FIELD','Campo inválido.');
};
const assertFinite = value => {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('V2_NUMBER','Número inválido.');
  if (Array.isArray(value)) value.forEach(assertFinite);
  else if (value && typeof value === 'object') for (const [key,entry] of Object.entries(value)) {fieldName(key);assertFinite(entry);}
  else if (value === undefined) fail('V2_UNDEFINED','Campo indefinido.');
};

export async function commitV2Pilot({db,storeId,generation,operationKey,kind,mutations=[],guards=[],expectedSequence=null}) {
  if (!ZENOS_RUNTIME.isHomologacao || !String(db?.app?.options?.projectId||'').startsWith('demo-')) {
    fail('V2_PILOT_ONLY','Piloto V2 permitido apenas em homologação com projeto demo.');
  }
  if (!operationKey || typeof operationKey!=='string' || operationKey.length>500) fail('V2_KEY','Chave permanente de operação obrigatória.');
  if (!['venda','compra','fiado','recebimento','caixa','despesa','devolucao'].includes(kind)) fail('V2_KIND','Operação não suportada.');
  if (!mutations.length || mutations.length+guards.length>150) fail('V2_BUDGET','Limite de leituras/gravações do piloto excedido.');
  assertFinite({mutations,guards});
  const addresses = new Set();
  const checkAddress = m => {
    if (!COLLECTIONS.has(m.collection)) fail('V2_COLLECTION','Coleção não permitida.');
    return `${m.collection}/${id(m.id)}`;
  };
  for (const m of mutations) {
    const address = checkAddress(m);
    if (addresses.has(address)) fail('V2_DUPLICATE','Entidade repetida na operação.');
    addresses.add(address);
    for (const key of [...Object.keys(m.patch||{}),...Object.keys(m.increments||{})]) fieldName(key);
    if (['id','codigo'].some(key=>Object.hasOwn(m.increments||{},key))) fail('V2_ID_CHANGED','Identidade não pode receber delta.');
    if (m.patch?.id !== undefined && String(m.patch.id)!==m.id) fail('V2_ID_CHANGED','ID legado não pode ser alterado.');
  }
  guards.forEach(checkAddress);
  const command = {storeId,generation,operationKey,kind,mutations,guards,expectedSequence};
  const fingerprint = await hash(command);
  const root = ['lojas',storeId,'v2_generations',generation];
  const headRef = doc(db,...root);
  const receiptRef = doc(db,...root,'operations',await hash(operationKey));
  const refs = new Map();
  for (const m of [...mutations,...guards]) refs.set(checkAddress(m),doc(db,...root,m.collection,id(m.id)));
  const result = await runTransaction(db, async tx => {
    const [headSnap,receipt] = await Promise.all([tx.get(headRef),tx.get(receiptRef)]);
    const head = headSnap.data();
    if (!headSnap.exists() || head.mode!=='pilot' || head.schema!==2) fail('V2_DISABLED','Geração não habilitada no piloto.');
    if (receipt.exists()) {
      if (receipt.data().fingerprint!==fingerprint) fail('V2_IDEMPOTENCY_CONFLICT','Chave reutilizada com conteúdo diferente.');
      return {...receipt.data().result,replayed:true};
    }
    if (expectedSequence!==null && head.sequence!==expectedSequence) fail('V2_STALE','Os dados mudaram; atualize antes de confirmar.');
    const snapshots = new Map();
    for (const [address,ref] of refs) snapshots.set(address,await tx.get(ref));
    for (const g of guards) {
      const snap = snapshots.get(checkAddress(g));
      const data = snap.data()?.data;
      if (!snap.exists()) fail('V2_GUARD_MISSING','Registro protegido não encontrado.');
      if (g.equals) for (const [key,value] of Object.entries(g.equals)) {
        fieldName(key);
        if (JSON.stringify(canonical(data?.[key]))!==JSON.stringify(canonical(value))) fail('V2_GUARD_CHANGED','Registro protegido mudou.');
      }
      if (g.minimum) for (const [key,value] of Object.entries(g.minimum)) {
        fieldName(key);
        if (!Number.isFinite(value) || !Number.isFinite(data?.[key]) || data[key]+1e-9<value) fail('V2_INSUFFICIENT','Saldo ou estoque insuficiente.');
      }
    }
    const prepared=[];
    for (const m of mutations) {
      const address=checkAddress(m), snap=snapshots.get(address), previous=snap.data();
      if (m.create && snap.exists()) fail('V2_EXISTS','Registro já existe.');
      if (!m.create && !snap.exists()) fail('V2_MISSING','Registro não encontrado.');
      if (m.expectedVersion!==undefined && Number(previous?.version||0)!==m.expectedVersion) fail('V2_VERSION','Versão mudou em outro terminal.');
      const data={...(previous?.data||{}),...(m.patch||{})};
      for (const [key,delta] of Object.entries(m.increments||{})) {
        if (!Number.isFinite(delta)||!Number.isFinite(data[key])) fail('V2_NUMBER','Delta numérico inválido.');
        data[key]+=delta;
      }
      const nonNegative={produtos:['estoque','estoqueVitrine','estoqueGalpao'],clientes:['saldoDevedorBRL'],
        vouchers:['saldoBRL'],contasReceber:['saldoBRL'],contasPagar:['saldoBRL']}[m.collection]||[];
      for (const key of nonNegative) if (data[key]!==undefined && (!Number.isFinite(data[key])||data[key]<-1e-9)) fail('V2_NEGATIVE','Saldo/estoque negativo bloqueado.');
      if(m.collection==='produtos' && ['estoque','estoqueVitrine','estoqueGalpao'].every(key=>data[key]!==undefined)
          && Math.abs(data.estoque-data.estoqueVitrine-data.estoqueGalpao)>1e-6) fail('V2_STOCK_TOTAL','Total de estoque difere das localizações.');
      const value={...previous,data,version:Number(previous?.version||0)+1,updatedAtServer:serverTimestamp()};
      // Conservative per-document budget before issuing any writes.
      if (new TextEncoder().encode(JSON.stringify(data)).length>200000) fail('V2_ENTITY_SIZE','Entidade exige subdivisão.');
      prepared.push({address,ref:refs.get(address),value});
    }
    const requestBytes = new TextEncoder().encode(JSON.stringify(prepared.map(x=>x.value))).length;
    if(requestBytes>2_000_000) fail('V2_REQUEST_SIZE','Operação grande demais para o piloto.');
    const sequence=Number(head.sequence||0)+1;
    const receiptResult={sequence,replayed:false,entityWrites:prepared.length,readDocuments:refs.size+2,writeDocuments:prepared.length+2};
    prepared.forEach(p=>tx.set(p.ref,p.value));
    tx.update(headRef,{sequence,updatedAtServer:serverTimestamp()});
    tx.set(receiptRef,{operationKey,kind,fingerprint,result:receiptResult,createdAtServer:serverTimestamp()});
    return receiptResult;
  });
  return {cloudOk:true,...result};
}
