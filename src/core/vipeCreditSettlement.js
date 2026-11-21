import {parseMoney,formatMoneyMinor,convertMinorDirect} from './nativeMoneyKernel.js';
import {vipeLegacyPYG,legacyCreditPYGMinor,vipeReceivableMinor} from './vipeLegacyNative.js';

const brlCents=n=>BigInt(parseMoney(Number(n).toFixed(2),'BRL'));
const centsToNumber=c=>Number(formatMoneyMinor(c.toString(),'BRL'));
/**
 * Scoped legacy VIPE credit receipt. Converts the PAYMENT at the current
 * rate, settles the historical debt using the FIXED 1150 reconstruction,
 * and freezes the remaining PYG debt in the customer's snapshot.
 * No customer bulk migration. Never apply an FX change to outstanding debt.
 */
export function receberFiadoLegadoVipe(cliente,carteira,{
  storeId,moedaPadrao,moedaPagamento,valorPago,taxasCambio
}){
 if(!vipeLegacyPYG(storeId,moedaPadrao)||carteira?.status!=='legado_pendente')
  throw Error('Recebimento legado não autorizado para esta carteira');
 const oldTotal=vipeReceivableMinor(cliente,carteira,storeId,moedaPadrao);
 if(oldTotal==null)throw Error('Saldo histórico não reconstituído');
 const paidMinor=parseMoney(Number(valorPago).toFixed(moedaPagamento==='PYG'?0:2),moedaPagamento);
 const applied=BigInt(convertMinorDirect(paidMinor,moedaPagamento,'PYG',taxasCambio));
 if(applied<=0n||applied>BigInt(oldTotal))
   throw Error('Pagamento acima do saldo original ou valor inválido');
 const oldLegacy=cliente.fiadoLegadoSaldoOriginalMinor!=null
   ?BigInt(cliente.fiadoLegadoSaldoOriginalMinor)
   :BigInt(legacyCreditPYGMinor(carteira.legadoBRL,storeId,moedaPadrao));
 if(oldLegacy<0n||oldLegacy>BigInt(oldTotal))throw Error('Saldo legado inconsistente');
 const usedLegacy=applied<oldLegacy?applied:oldLegacy;
 const newLegacy=oldLegacy-usedLegacy;
 const oldBook=brlCents(carteira.legadoBRL);
 // Keep at least one cent while nominal PYG remains, never closing a debt
 // early due solely to BRL decimal rounding.
 const newBook=newLegacy===0n?0n:
   ((oldBook*newLegacy+oldLegacy/2n)/oldLegacy||1n);
 let rest=applied-usedLegacy;
 let abatimentoLivro=oldBook-newBook;
 const titles=(cliente.titulosFiadoNativos||[]).map(t=>{
   if(rest===0n||!t.saldoOriginal)return t;
   const old=BigInt(parseMoney(String(t.saldoOriginal),'PYG'));
   const take=rest<old?rest:old;
   const left=old-take;
   const oldC=brlCents(t.saldoContabilBRL);
   const nextC=left===0n?0n:(oldC*left+old/2n)/old;
   rest-=take;
   abatimentoLivro+=oldC-nextC;
   return {...t,saldoOriginal:Number(left),saldoContabilBRL:centsToNumber(nextC)};
 });
 if(rest!==0n)throw Error('Pagamento não conciliado com os títulos');
 const titleBook=titles.reduce((n,t)=>n+brlCents(t.saldoContabilBRL),0n);
 const newLedger=titleBook+newBook;
 const receivedBRL=centsToNumber(BigInt(convertMinorDirect(paidMinor,moedaPagamento,'BRL',taxasCambio)));
 const aplicadoBRL=centsToNumber(abatimentoLivro);
 return {
  cliente:{...cliente,titulosFiadoNativos:titles,
    saldoDevedorBRL:centsToNumber(newLedger),
    fiadoLegadoSaldoOriginalMinor:newLegacy.toString(),
    fiadoLegadoCotacaoHistoricaPYGPorBRL:1150},
  moedaObrigacao:'PYG',valorAplicadoNativo:Number(applied),
  saldoNativo:Number(BigInt(oldTotal)-applied),
  moedaPagamento,valorPago,recebidoBRL,
  abatimentoContabilBRL:aplicadoBRL,
  variacaoCambialRealizadaBRL:Math.round((receivedBRL-aplicadoBRL)*100)/100,
  conversaoHistorica:'VIPE_1150_FROZEN',
 };
}
