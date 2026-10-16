// Regra de quitação do PDV em centavos inteiros: não tolerar débitos de R$ 0,05.
const centavos = valor => Math.round(Number(valor) * 100);
export const validarComposicaoPagamento = ({ totalBRL, recebidoBRL, recebidoDinheiroBRL }) => {
  const valores = [totalBRL, recebidoBRL, recebidoDinheiroBRL].map(Number);
  const [total, recebido, dinheiro] = valores.map(centavos);
  const validos = valores.every(Number.isFinite)
    && [total, recebido, dinheiro].every(Number.isSafeInteger)
    && total > 0 && recebido >= 0 && dinheiro >= 0 && dinheiro <= recebido;
  if (!validos) return { podeConcluir:false, excessoEletronico:false, motivo:'valores_invalidos' };
  const excedente = recebido - total;
  const excessoEletronico = excedente > dinheiro;
  const quitado = recebido >= total;
  return {
    podeConcluir: quitado && !excessoEletronico,
    excessoEletronico,
    motivo: excessoEletronico ? 'excesso_sem_lastro_dinheiro' : quitado ? null : 'saldo_pendente',
    trocoBRL: Math.max(0, Math.min(excedente, dinheiro)) / 100,
  };
};
