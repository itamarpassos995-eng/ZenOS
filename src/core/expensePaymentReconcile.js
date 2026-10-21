export function avaliarPagamentoExistente({despesa,lancamento,movimentos=[]}){
 if(!despesa?.id||!lancamento)return {status:'unverified',reason:'missing_ledger'};
 const valor=Number(despesa.valorBRL);
 const compra=despesa.naturezaContabil==='estoque_ativo';
 const expected={
  id:`DESPESA-${despesa.id}`,
  referenciaId:String(despesa.compraId||despesa.id),
  tipo:compra?'pagamento_compra':'pagamento_despesa',
  origem:compra?'despesas_compra':'despesas',
 };
 const equal=(a,b)=>String(a??'')===String(b??'');
 if(!Number.isFinite(valor)||valor<=0||
  !equal(lancamento.id,expected.id)||
  !equal(lancamento.referenciaId,expected.referenciaId)||
  !equal(lancamento.tipo,expected.tipo)||
  !equal(lancamento.origem,expected.origem)||
  !Number.isFinite(Number(lancamento.valor))||
  Math.abs(Number(lancamento.valor)-valor)>0.001)
  return {status:'conflict',reason:'ledger_identity_amount_mismatch'};
 const isCash=lancamento.afetaCaixaFisico===true;
 if(isCash){
  const matched=(Array.isArray(movimentos)?movimentos:[]).filter(m=>equal(m?.id,`MOV-DESP-${despesa.id}`));
  if(matched.length!==1)return {status:'conflict',reason:'cash_movement_not_unique'};
  const m=matched[0];
  if(!equal(m.despesaId,despesa.id)||
    !equal(m.sessaoId,lancamento.sessaoId)||
    !['saida_compra','saida_despesa'].includes(String(m.tipo))||
    m.direcao!=='saida'||
    m.afetaGaveta!==true||
    Math.abs(Number(m.valorBRL)-valor)>0.001)
   return {status:'conflict',reason:'cash_movement_mismatch'};
 }
 return {status:'verified',cash:isCash,createdAt:String(lancamento.createdAt||'')};
}
