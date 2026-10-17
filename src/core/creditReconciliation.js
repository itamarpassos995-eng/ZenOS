// Reconcilia exclusivamente o fiado demonstrado por venda + pagamento + lançamento auditado.
// Não reconstrói dívidas antigas por estimativa e nunca altera caixa, venda nem livro financeiro.
const centavos = valor => {
  const n=Number(valor);
  return Number.isFinite(n)?Math.round(n*100):null;
};
const mesmoId=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const isCredit=entry=>entry?.tipo==='venda_fiada'&&entry?.formaPagamento==='crediario';
const isDebtMutation=entry=>isCredit(entry)||entry?.tipo==='recebimento_fiado'
  ||(entry?.tipo==='devolucao'&&entry?.formaPagamento==='credito_fiado');

// O incidente #32 foi ativado em 16/10/2026. Não inferir valores anteriores.
const INCIDENT_START=Date.parse('2026-10-16T00:00:00.000Z');

export function planejarReconciliacoesFiado({clientes=[],historicoVendas=[],livroFinanceiro=[]}={}){
  if(!Array.isArray(clientes)||!Array.isArray(historicoVendas)||!Array.isArray(livroFinanceiro))return [];
  const propostas=[];
  for(const cliente of clientes){
    if(!cliente?.id)continue;
    const lancamentos=livroFinanceiro.filter(e=>mesmoId(e?.clienteId,cliente.id)&&isDebtMutation(e))
      .sort((a,b)=>(Date.parse(a.createdAt||0)||0)-(Date.parse(b.createdAt||0)||0));
    if(!lancamentos.length)continue;
    const f=lancamentos.at(-1);
    // A única movimentação ainda não refletida deve ser a última. Caso existam
    // outras movimentações depois (inclusive pagamento), não conciliar.
    if(!isCredit(f)||!f?.id||!f?.referenciaId||!f?.createdAt
      ||!(Date.parse(f.createdAt)>=INCIDENT_START))continue;
    const saldoAntes=centavos(f.saldoClienteAntes),saldoDepois=centavos(f.saldoClienteDepois);
    const valor=centavos(f.valor),saldoCadastrado=centavos(cliente.saldoDevedorBRL);
    if([saldoAntes,saldoDepois,valor,saldoCadastrado].some(n=>n===null)||valor<=0)continue;
    if(saldoDepois!==saldoAntes+valor||saldoCadastrado!==saldoAntes)continue;
    // Se o registro anterior ainda não está refletido no saldo antes desta
    // operação, não é seguro reparar apenas a última venda.
    if(lancamentos.length>1){
      const anterior=lancamentos.at(-2);
      const saldoAnteriorAuditado=centavos(anterior.saldoClienteDepois);
      if(saldoAnteriorAuditado===null||saldoAnteriorAuditado!==saldoAntes)continue;
    }
    const venda=historicoVendas.find(v=>mesmoId(v?.id,f.referenciaId));
    if(!venda||!mesmoId(venda.clienteId,cliente.id)||venda.estado!=='concluida'
        ||venda.tipoDocumento!=='venda'||!Array.isArray(venda.pagamentos)
        ||(Array.isArray(venda.devolucoes)&&venda.devolucoes.length))continue;
    const parcelas=venda.pagamentos.filter(p=>p?.formaId==='crediario');
    if(!parcelas.length||parcelas.some(p=>centavos(p.valorConvertidoBRL)===null))continue;
    const fiadoVenda=parcelas.reduce((s,p)=>s+centavos(p.valorConvertidoBRL),0);
    if(fiadoVenda!==valor)continue;
    propostas.push({
      clienteId:String(cliente.id),vendaId:String(venda.id),lancamentoId:String(f.id),
      saldoAnteriorBRL:saldoAntes/100,saldoNovoBRL:saldoDepois/100,
      operationKey:`reconcile-credit:${String(f.id)}`,
    });
  }
  return propostas;
}
