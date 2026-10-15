// Composição de pagamento de uma venda, expressa em BRL.
// Só é possível dar troco sobre o montante efetivamente recebido em espécie.
export const validarComposicaoPagamento = ({ totalBRL, recebidoBRL, recebidoDinheiroBRL }) => {
  const total = Number(totalBRL);
  const recebido = Number(recebidoBRL);
  const dinheiro = Number(recebidoDinheiroBRL);
  const valoresValidos = [total, recebido, dinheiro].every(Number.isFinite)
    && total > 0 && recebido >= 0 && dinheiro >= 0 && dinheiro <= recebido + 0.001;
  if (!valoresValidos) return { podeConcluir: false, excessoEletronico: false, motivo: 'valores_invalidos' };
  const excedente = recebido - total;
  const excessoEletronico = excedente > dinheiro + 0.001;
  const quitado = recebido >= total - 0.05;
  return {
    podeConcluir: quitado && !excessoEletronico,
    excessoEletronico,
    motivo: excessoEletronico ? 'excesso_sem_lastro_dinheiro' : quitado ? null : 'saldo_pendente',
  };
};
