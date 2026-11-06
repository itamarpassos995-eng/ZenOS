import {error,hash,id} from './security.js';
import {criarLancamentoFinanceiro} from '../../../src/core/financialLedgerCore.js';
import {calcularCmvVenda} from '../../../src/core/salesFinancials.js';
import {FieldValue} from 'firebase-admin/firestore';
const decimal=v=>{const m=String(v).match(/^(\d+)(?:\.(\d{1,16}))?$/);if(!m)error('INVALID_PAYMENT');return {n:BigInt(m[1]+(m[2]||'')),d:10n**BigInt((m[2]||'').length)};};
const rounded=(n,d)=>{const value=(n*2n+d)/(2n*d);if(value>BigInt(Number.MAX_SAFE_INTEGER))error('INVALID_PAYMENT');return Number(value);};
const cents=v=>{const a=decimal(v);return rounded(a.n*100n,a.d);};
const convertCents=(original,rate,currency)=>{const a=decimal(original),r=decimal(rate),scale=currency==='PYG'?1n:100n;if(a.n*scale%a.d!==0n||r.n===0n)error('INVALID_PAYMENT');return rounded(a.n*100n*r.d,a.d*r.n);};
const stable=v=>JSON.stringify(v);
export function buildSettlement({db,ctx,authorize,login,now}) {
 return async function finalize(uid,input){
  id(input.orderId);id(input.operatorId);id(input.sessionId);
  if(!Array.isArray(input.payments)||!input.payments.length||input.payments.length>12)error('INVALID_PAYMENT');
  const session=await login(uid,{operatorId:input.operatorId,pin:input.pin,scope:'pdv'});
  const identity=hash({orderId:input.orderId,operatorId:input.operatorId,sessionId:input.sessionId,payments:input.payments,changeCurrency:input.changeCurrency||null,cart:input.cart,customerId:input.customerId});
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,session.sessionToken,c,'pdv');
   const operationId=hash(`logistics-finalize:${input.orderId}`),receiptRef=db.doc(`${c.base}/operations/${operationId}`);
   const [prior,orderSnap,cash]=await Promise.all([tx.get(receiptRef),tx.get(db.doc(`${c.base}/vendas/${id(input.orderId)}`)),tx.get(db.doc(`${c.base}/sessoesCaixa/${id(input.sessionId)}`))]);
   if(prior.exists){if(prior.data().fingerprint!==identity)error('IDEMPOTENCY_CONFLICT');return {sale:prior.data().settledSale,receipt:prior.data(),alreadyCommitted:true};}
   const order=orderSnap.data()?.data;
   if(!order||orderSnap.data().deleted||order.estado!=='pendente'||!order._distribution?.stockManaged||order._distribution.commercialFinalized)error('ORDER_NOT_ELIGIBLE');
   if(!Object.values(order._distribution.dispatched||{}).some(n=>n>0))error('DISPATCH_REQUIRED');
   if(cash.data()?.deleted||cash.data()?.data?.status!=='aberta'||String(cash.data().data.operadorId)!==actor.operatorId)error('CASH_SESSION_CLOSED');
   const cart=order.itens.map(i=>({id:String(i.produtoOriginalId??i.id),sku:String(i.produtoOriginalSku??i.sku),qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)}));
   if(stable(cart)!==stable(input.cart)||String(order.clienteId)!==String(input.customerId))error('ORDER_SNAPSHOT_CHANGED');
   const target=cents(order.totalBRL);if(!target)error('INVALID_PAYMENT');
   const clientSnap=await tx.get(db.doc(`${c.base}/clientes/${id(String(order.clienteId))}`));
   if(!clientSnap.exists||clientSnap.data().deleted)error('CUSTOMER_REQUIRED');
   let credit=0,paid=0,cashPaid=0;const payments=[],voucherUpdates=new Map();
   for(const p of input.payments){
    const method=String(p.formaId||''),currency=p.moedaOrigem;
    if(!/^(dinheiro_(brl|pyg|usd|eur)|cartao_(credito|debito)(_(brl|pyg|usd|eur))?|pix|transferencia|crediario|voucher)$/.test(method)||!['BRL','PYG','USD','EUR'].includes(currency))error('INVALID_PAYMENT');
    const original=Number(p.valorOriginal),rate=Number(order.taxasCambio?.[currency]);
    if(!(original>0)||!Number.isFinite(original)||!(rate>0)||!Number.isFinite(rate)||original>(Number.MAX_SAFE_INTEGER/100))error('PAYMENT_RATE_REQUIRED');
    if(currency==='PYG'&&!Number.isInteger(original))error('INVALID_PAYMENT');
    const suffix=method.match(/_(brl|pyg|usd|eur)$/)?.[1];if((suffix&&suffix.toUpperCase()!==currency)||(['pix','crediario','voucher'].includes(method)&&currency!=='BRL'))error('INVALID_PAYMENT');
    const amount=convertCents(p.valorOriginal,order.taxasCambio[currency],currency);if(!amount||cents(p.valorConvertidoBRL)!==amount)error('PAYMENT_RATE_CHANGED');
    paid+=amount;if(method.startsWith('dinheiro_'))cashPaid+=amount;
    if(method==='crediario')credit+=amount;
    if(method==='voucher'){
     id(p.voucherCodigo);let v=voucherUpdates.get(p.voucherCodigo);
     if(!v){const snap=await tx.get(db.doc(`${c.base}/vouchers/${id(p.voucherCodigo)}`));if(!snap.exists||snap.data().deleted)error('VOUCHER_INVALID');v={snap,data:structuredClone(snap.data().data)};voucherUpdates.set(p.voucherCodigo,v);}
     if(cents(v.data.saldoBRL)<amount||v.data.status!=='ativo')error('VOUCHER_INVALID');v.data.saldoBRL=(cents(v.data.saldoBRL)-amount)/100;v.data.status=v.data.saldoBRL?'ativo':'utilizado';
    }
    payments.push({...p,valorOriginal:original,valorConvertidoBRL:amount/100,taxaCambioAplicada:1/rate});
   }
   if(!Number.isSafeInteger(paid)||paid<target||paid-target>cashPaid)error('PAYMENT_INCOMPLETE');
   const client=clientSnap.data().data,balance=cents(client.saldoDevedorBRL||0),limit=cents(client.limiteCreditoBRL||0);
   if(credit&&(!limit||balance+credit>limit))error('CREDIT_LIMIT');
   const instant=new Date(now()).toISOString(),change=(paid-target)/100;
   const changeCurrency=input.changeCurrency||order.moedaDocumento,changeRate=order.taxasCambio?.[changeCurrency];
   if(!['BRL','PYG','USD','EUR'].includes(changeCurrency)||!(changeRate>0))error('PAYMENT_RATE_REQUIRED');
   const r=decimal(changeRate),scale=changeCurrency==='PYG'?1n:100n;
   const changeOriginal=rounded(BigInt(paid-target)*r.n*scale,100n*r.d)/Number(scale);
   const frozenItems=order.itens.map((item,index)=>({...item,custoNaVendaBRL:Number(item.custoNaVendaBRL??item.custoBRL??0),movimentoEstoqueVenda:{vitrine:0,galpao:order._distribution.dispatched?.[index]||0,total:order._distribution.dispatched?.[index]||0}}));
   const sale={...order,orderCreatedAt:order.createdAt,createdAt:instant,itens:frozenItems,moedaTrocoInfo:change?changeCurrency:null,trocoOriginal:changeOriginal,taxasCambioTroco:{...order.taxasCambio},estado:'concluida',tipoDocumento:'venda',sessaoId:input.sessionId,finalizadoPorId:actor.operatorId,finalizadoPorNome:actor.name,commercialFinalizedAt:instant,pagamentos:payments,trocoBRL:change,cmvBRL:calcularCmvVenda(order),lucroBRL:order.totalBRL-calcularCmvVenda(order),_distribution:{...order._distribution,commercialFinalized:true,commercialOperationId:operationId,stockPosting:'logistics'}};
   const sequence=c.head.sequence+1,revisions={...c.head.fieldRevisions,historicoVendas:(c.head.fieldRevisions.historicoVendas||0)+1},patches=[],writes=[];
   function patch(snap,field,data){const value={...snap.data(),data,version:sequence,commandId:operationId};patches.push({field,routeId:snap.id,...value});writes.push([snap.ref,value]);}
   patch(orderSnap,'historicoVendas',sale);
   if(credit){revisions.clientes=(revisions.clientes||0)+1;patch(clientSnap,'clientes',{...client,saldoDevedorBRL:(balance+credit)/100});}
   if(voucherUpdates.size){revisions.vouchers=(revisions.vouchers||0)+1;for(const v of voucherUpdates.values())patch(v.snap,'vouchers',v.data);}
   const entries=[];let remainingChange=paid-target,creditPosted=0;
   for(let i=0;i<payments.length;i++){
    const p=payments[i];let value=cents(p.valorConvertidoBRL);
    if(p.formaId.startsWith('dinheiro_')){const delta=Math.min(remainingChange,value);remainingChange-=delta;value-=delta;}
    if(!value)continue;
    entries.push(criarLancamentoFinanceiro({id:`LOG-${operationId}-${i}`,lojaId:uid,tipo:p.formaId==='crediario'?'venda_fiada':'venda',origem:'pdv',referenciaId:order.id,valor:value/100,moeda:'BRL',formaPagamento:p.formaId,operadorId:actor.operatorId,operadorNome:actor.name,createdAt:instant,afetaCaixaFisico:p.formaId.startsWith('dinheiro_'),afetaResultado:true,direcao:'entrada',sessaoId:p.formaId==='crediario'?null:input.sessionId,clienteId:order.clienteId,clienteNome:order.clienteNome,saldoClienteAntes:p.formaId==='crediario'?(balance+creditPosted)/100:null,saldoClienteDepois:p.formaId==='crediario'?(balance+creditPosted+value)/100:null,detalhes:{moedaOrigem:p.moedaOrigem,valorOriginal:p.valorOriginal,valorRecebidoConvertidoBRL:p.valorConvertidoBRL,taxaCambioAplicada:p.taxaCambioAplicada,formaEletronica:p.formaId.startsWith('cartao')?'cartao':null,distributionOperationId:operationId,trocoVendaMoeda:change?changeCurrency:null,trocoVendaOriginal:changeOriginal}}));
    if(p.formaId==='crediario')creditPosted+=value;
   }
   // Read every ledger target before writes: collisions cannot overwrite history.
   for(const e of entries)if((await tx.get(db.doc(`${c.root}/financeiro_livro/${e.id}`))).exists)error('FINANCIAL_COLLISION');
   const receipt={schema:2,key:`logistics-finalize:${order.id}`,fingerprint:identity,sequence,revisions,patches,financialEntries:entries,createdAtClient:instant,settledSale:sale};
   for(const [ref,value]of writes)tx.set(ref,value);
   for(const e of entries)tx.create(db.doc(`${c.root}/financeiro_livro/${e.id}`),{...e,serverRecordedAt:FieldValue.serverTimestamp(),_v2:{generation:c.generation,commandId:operationId,sequence}});
   tx.create(receiptRef,receipt);tx.update(db.doc(c.base),{sequence,fieldRevisions:revisions,lastReceipt:operationId,updatedAtServer:FieldValue.serverTimestamp()});
   tx.create(db.doc(`${c.root}/distribution_audit/${operationId}`),{type:'COMMERCIAL_FINALIZE',orderId:order.id,operatorId:actor.operatorId,sequence,at:now()});
   return {sale,receipt,alreadyCommitted:false};
  },{maxAttempts:15});
 };
}
