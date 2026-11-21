/**
 * READ ONLY — Verified nominal credit debt in the store default currency.
 * Never revalue a BRL accounting balance using today's FX.
 *
 * When every outstanding customer's credit sales and receipts carry matching
 * native snapshots, we can reconstruct the nominal debt. We validate the
 * independent BRL ledger balance before displaying it. Any missing/mixed
 * currency, refund, undocumented opening debt or mismatch fails closed.
 */
const MOEDAS=new Set(['BRL','PYG','USD','EUR']);
const cents=n=>Math.round(Number(n)*100);
const id=x=>x==null?'':String(x);
export function apurarFiadoMoedaPadrao(clientes=[],moedaPadrao='BRL',historicoVendas=[],livroFinanceiro=[]){
 const saldoPorCliente=new Map();
 let totalBRL=0;
 for(const c of clientes){
   const value=Number(c?.saldoDevedorBRL??0);
   if(!Number.isFinite(value)||value<0||!id(c?.id)||saldoPorCliente.has(id(c.id)))
     return {status:'inconsistente',totalNativo:null,totalBRL:null,moeda:moedaPadrao};
   saldoPorCliente.set(id(c.id),value);
   totalBRL+=value;
 }
 totalBRL=Math.round(totalBRL*100)/100;
 if(!MOEDAS.has(moedaPadrao))
   return {status:'inconsistente',totalNativo:null,totalBRL,moeda:moedaPadrao};
 if(moedaPadrao==='BRL')
   return {status:'confirmado',totalNativo:totalBRL,totalBRL,moeda:'BRL'};
 if(totalBRL===0)
   return {status:'confirmado',totalNativo:0,totalBRL,moeda:moedaPadrao};
 if(!Array.isArray(historicoVendas)||!Array.isArray(livroFinanceiro))
   return {status:'sem_origem_nativa',totalNativo:null,totalBRL,moeda:moedaPadrao};

 let nativoTotal=0,pendentes=0;
 for(const [clienteId,saldo] of saldoPorCliente){
   if(saldo<=0)continue;
   const vendas=historicoVendas.filter(v=>id(v?.clienteId)===clienteId);
   const recebimentos=livroFinanceiro.filter(f=>id(f?.clienteId)===clienteId&&f?.tipo==='recebimento_fiado');
   const creditos=vendas.flatMap(v=>(v?.pagamentos||[]).filter(p=>p?.formaId==='crediario').map(p=>({v,p})));
   if(!creditos.length) {pendentes++;continue;}
   let brlCreditos=0,brlRecebimentos=0,valorCreditos=0,valorRecebimentos=0;
   let comprovado=true;
   const vendaIds=new Set();
   for(const {v,p} of creditos){
     const b=Number(p.valorConvertidoBRL),n=Number(p.valorOriginal);
     if(!v?.id||!MOEDAS.has(v?.moedaDocumento)||v.moedaDocumento!==moedaPadrao||
       v?.estado!=='concluida'||(Array.isArray(v.devolucoes)&&v.devolucoes.length>0)||
       !id(v.id)||p.moedaOrigem!==moedaPadrao||typeof p.valorOriginal!=='number'||
       !Number.isFinite(n)||n<0||!Number.isFinite(b)||b<0||
       (moedaPadrao==='PYG'&&!Number.isInteger(n))){comprovado=false;break;}
     vendaIds.add(id(v.id));brlCreditos+=b;valorCreditos+=n;
   }
   if(vendaIds.size===0)comprovado=false;
   for(const f of recebimentos){
     const b=Number(f.valor),n=Number(f?.detalhes?.valorOriginal);
     if(f?.detalhes?.moedaOrigem!==moedaPadrao||typeof f?.detalhes?.valorOriginal!=='number'||
       !Number.isFinite(n)||n<0||!Number.isFinite(b)||b<0||
       (moedaPadrao==='PYG'&&!Number.isInteger(n))){comprovado=false;break;}
     brlRecebimentos+=b;valorRecebimentos+=n;
   }
   const saldoNativo=valorCreditos-valorRecebimentos;
   // Reconcile with independently recorded customer receivable, not FX today.
   if(!comprovado||saldoNativo<0||Math.abs(cents(brlCreditos-brlRecebimentos)-cents(saldo))>1){
     pendentes++;continue;
   }
   nativoTotal+=saldoNativo;
 }
 if(pendentes)return {status:'sem_origem_nativa',totalNativo:null,totalBRL,moeda:moedaPadrao,pendentes};
 const casas=moedaPadrao==='PYG'?1:100;
 return {status:'confirmado',totalNativo:Math.round(nativoTotal*casas)/casas,totalBRL,moeda:moedaPadrao,pendentes:0};
}
