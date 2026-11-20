/**
 * Recognize settled exchange variance only when a manual operating expense
 * has a confirmed payment. This does not touch purchasing/stock cost.
 * A positive delta means a realized FX loss (more BRL to pay); a negative
 * delta means a realized gain. Never infer rates for legacy expenses.
 */
export function apurarDespesasEVariacaoCambial(despesas=[], noPeriodo=()=>true) {
  let custoHistoricoBRL=0, variacaoCambialBRL=0;
  let quantidadeComAjuste=0;
  for(const d of despesas) {
    if(!noPeriodo(d) || !(d?.status==='paga' || (d?.status==='excluida' && d?.financeiroMantido===true))
      || d.afetaResultado===false || d.naturezaContabil==='estoque_ativo'
      || d.categoria==='Mercadoria para Revenda') continue;
    const valor=Number(d.valorBRL);
    if(!Number.isFinite(valor) || valor<0) continue;
    custoHistoricoBRL+=valor;
    if(d.status==='paga' && Object.prototype.hasOwnProperty.call(d,'diferencaCambialBRL')) {
      const fx=Number(d.diferencaCambialBRL);
      if(Number.isFinite(fx) && Math.abs(fx)>=0.005){
        variacaoCambialBRL+=fx;
        quantidadeComAjuste++;
      }
    }
  }
  const round=x=>Math.round((x+Number.EPSILON)*100)/100;
  return {despesasHistoricasBRL:round(custoHistoricoBRL),variacaoCambialBRL:round(variacaoCambialBRL),
    despesaRealizadaBRL:round(custoHistoricoBRL+variacaoCambialBRL),quantidadeComAjuste};
}
