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

export function planejarReconciliacoesFiado({clientes=[],historicoVendas=[],livroFinanceiro=[]}={}){
  if(!Array.isArray(clientes)||!Array.isArray(historicoVendas)||!Array.isArray(livroFinanceiro))return [];
  const propostas=[];
  for(const cliente of clientes){
    if(!cliente?.id)continue;
    const lancamentos=livroFinanceiro.filter(entry=>mesmoId(entry?.clienteId,cliente.id)&&isDebtMutation(entry));
    const fiados=lancamentos.filter(isCredit);
    // Mais de uma movimentação de fiado exige uma conciliação de eventos encadeados.
    // Não aplicar uma cobrança parcial por heurística nem ignorar recebimentos.
    if(fiados.length!==1||lancamentos.length!==1)continue;
    const f=fiados[0];
    if(!f?.id||!f?.referenciaId||!f?.createdAt)continue;
    const saldoAntes=centavos(f.saldoClienteAntes),saldoDepois=centavos(f.saldoClienteDepois);
    const valor=centavos(f.valor),saldoCadastrado=centavos(cliente.saldoDevedorBRL);
    if([saldoAntes,saldoDepois,valor,saldoCadastrado].some(n=>n===null)||valor<=0)continue;
    if(saldoDepois!==saldoAntes+valor||saldoCadastrado!==saldoAntes)continue;
    const venda=historicoVendas.find(v=>mesmoId(v?.id,f.referenciaId));
    if(!venda||!mesmoId(venda.clienteId,cliente.id)||venda.estado!=='concluida'
        ||venda.tipoDocumento!=='venda'||!Array.isArray(venda.pagamentos)
        ||Array.isArray(venda.devolucoes)&&venda.devolucoes.length)continue;
    const fiadoVenda=venda.pagamentos.filter(p=>p?.formaId==='crediario')
      .reduce((s,p)=>s+(centavos(p.valorConvertidoBRL)??0),0);
    if(fiadoVenda!==valor)continue;
    propostas.push({
      clienteId:String(cliente.id),
      vendaId:String(venda.id),
      lancamentoId:String(f.id),
      saldoAnteriorBRL:saldoAntes/100,
      saldoNovoBRL:saldoDepois/100,
      operationKey:`reconcile-credit:${String(f.id)}`,
    });
  }
  return propostas;
}
