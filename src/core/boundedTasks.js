// Aguarda todas as tarefas do lote antes de propagar erro: nenhuma consulta
// pendente pode contaminar uma tentativa posterior de hidratação do cache.
export async function executarLotes(itens, executar, tamanho=3) {
  for(let i=0;i<itens.length;i+=tamanho){
    const resultados=await Promise.allSettled(itens.slice(i,i+tamanho).map(executar));
    const erro=resultados.find(r=>r.status==='rejected');
    if(erro)throw erro.reason;
  }
}
