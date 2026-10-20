// Fonte única do semáforo de resultado: despesa removida da listagem
// continua afetando o resultado SOMENTE se a gerência escolheu preservá-lo.
export function calcularDespesasPagasResultado(despesas=[]){
 return (Array.isArray(despesas)?despesas:[]).filter(d=>
   (d.status==='paga' || (d.status==='excluida' && d.financeiroMantido===true)) &&
   d.afetaResultado!==false &&
   d.naturezaContabil!=='estoque_ativo' &&
   d.categoria!=='Mercadoria para Revenda'
 ).reduce((s,d)=>s+(Number(d.valorBRL)||0),0);
}
