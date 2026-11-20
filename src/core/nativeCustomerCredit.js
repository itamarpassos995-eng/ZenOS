import {
 criarObrigacaoNativa, criarLiquidacaoNativa, apurarSaldoNativo,
 converterMoedaConfirmada
} from './monetaryContract.js';

const casas=valor=>Math.round((Number(valor)+Number.EPSILON)*100)/100;
const efetivas=cliente=>(cliente?.contasNativasV1||[]).filter(c=>apurarSaldoNativo(c.obrigacao,c.recebimentos).saldoNativo>0);
export function contasAbertasClienteNativo(cliente){return efetivas(cliente);}
export function saldoLegadoClienteBRL(cliente){
  const saldo=Number(cliente?.saldoDevedorBRL||0);
  const nativo=efetivas(cliente).reduce((s,c)=>{
    const quitado=(c.recebimentos||[]).reduce((a,r)=>a+Number(r.valorContabilHistoricoAmortizadoBRL||0),0);
    return s+Number(c.obrigacao.valorContabilHistoricoBRL)-quitado;
  },0);
  return casas(saldo-nativo);
}
/** Attach a NEW native contractual debt without changing already-recorded BRL. */
export function adicionarCreditoNativoCliente({cliente,vendaId,moedaDocumento,
  pagamentosFiado=[],taxasConfirmadas,registradaEm}){
  if(!cliente?.id||!vendaId)throw Error('Cliente e venda obrigatórios.');
  if(!pagamentosFiado.length)throw Error('Crédito sem pagamento fiado.');
  if((cliente.contasNativasV1||[]).some(c=>c.obrigacao?.id===String(vendaId)))
    throw Error('Dívida nativa duplicada.');
  if(pagamentosFiado.some(p=>p.formaId!=='crediario'||p.moedaOrigem!==moedaDocumento))
    throw Error('Crédito sem moeda contratual nativa.');
  const total=pagamentosFiado.reduce((s,p)=>s+Number(p.valorOriginal||0),0);
  const obrigacao=criarObrigacaoNativa({id:String(vendaId),moedaDocumento,
    valorOriginal:total,taxasConfirmadas,registradaEm});
  const conta={obrigacao,recebimentos:[]};
  return {...cliente,contasNativasV1:[...(cliente.contasNativasV1||[]),conta]};
}
/**
 * Pay exactly one documented obligation. Different payment currency is ONLY a
 * receipt quote. Full payoff accepts rounding of the actual payment currency.
 * Partial payments are allocated on the original nominal balance.
 */
export function receberCreditoNativoCliente({cliente,contaId,recebimentoId,moedaPagamento,
  valorPagamentoOriginal,taxasConfirmadas,registradaEm}){
  const lista=cliente?.contasNativasV1||[];
  const idx=lista.findIndex(c=>c.obrigacao?.id===String(contaId));
  if(idx<0)throw Error('Dívida nativa não encontrada.');
  const conta=lista[idx],saldo=apurarSaldoNativo(conta.obrigacao,conta.recebimentos);
  if(saldo.saldoNativo<=0)throw Error('Dívida já quitada.');
  const recebido=Number(valorPagamentoOriginal);
  if(!Number.isFinite(recebido)||recebido<=0)throw Error('Recebimento inválido.');
  const quita=converterMoedaConfirmada({valor:saldo.saldoNativo,moedaOrigem:saldo.moeda,
    moedaDestino:moedaPagamento,taxasConfirmadas});
  const casasRecebimento=moedaPagamento==='PYG'?1:100;
  const equiv=Math.round(recebido*casasRecebimento);
  const valorTotal=Math.round(quita*casasRecebimento);
  const aplicado=equiv===valorTotal ? saldo.saldoNativo
    : converterMoedaConfirmada({valor:recebido,moedaOrigem:moedaPagamento,
        moedaDestino:saldo.moeda,taxasConfirmadas});
  const liquidacao=criarLiquidacaoNativa({id:recebimentoId,obrigacao:conta.obrigacao,
    valorAmortizadoOriginal:aplicado,moedaPagamento,valorPagamentoOriginal:recebido,
    taxasConfirmadas,registradaEm,liquidacoesAnteriores:conta.recebimentos});
  const atual={...conta,recebimentos:[...conta.recebimentos,liquidacao]};
  const atualizado={...cliente,contasNativasV1:lista.map((c,i)=>i===idx?atual:c),
    saldoDevedorBRL:Math.max(0,casas(Number(cliente.saldoDevedorBRL||0)-
      liquidacao.valorContabilHistoricoAmortizadoBRL))};
  return {cliente:atualizado,liquidacao,antes:saldo,depois:apurarSaldoNativo(atual.obrigacao,atual.recebimentos)};
}

/** Read-only. Preserve visible legacy debts; never translate them with today's FX. */
export function resumirFiadoLojaNativo(clientes=[],moedaPadrao='BRL'){
  const totais={BRL:0,PYG:0,USD:0,EUR:0};
  let legadoContabilBRL=0,clientesComDivida=0,contasComprovadas=0;
  for(const cliente of clientes){
    if(!(cliente?.saldoDevedorBRL>0))continue;
    clientesComDivida++;
    for(const conta of efetivas(cliente)){
      const saldo=apurarSaldoNativo(conta.obrigacao,conta.recebimentos);
      totais[saldo.moeda]+=saldo.saldoNativo;
      contasComprovadas++;
    }
    legadoContabilBRL+=Math.max(0,saldoLegadoClienteBRL(cliente));
  }
  const escala=moedaPadrao==='PYG'?1:100;
  return {moedaPadrao,valorNativoComprovado:Math.round((totais[moedaPadrao]||0)*escala)/escala,
    totaisPorMoeda:totais,legadoContabilBRL:Math.round(legadoContabilBRL*100)/100,
    clientesComDivida,contasComprovadas,
    possuiPendencias:legadoContabilBRL>0.005 || Object.entries(totais).some(([m,v])=>m!==moedaPadrao&&v>0)};
}
