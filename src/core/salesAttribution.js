// A autoria comercial pertence a quem iniciou o atendimento, não a quem recebeu.
// A identidade é gravada junto da venda; não há consulta adicional ao Firestore.
const identidade = (id, nome) => {
  const vendedorId = String(id ?? '').trim();
  if (!vendedorId) return null;
  return { vendedorId, vendedorNome: String(nome || vendedorId).trim() || vendedorId };
};

export const autoriaDoOperador = operador =>
  identidade(operador?.id || 'admin', operador?.nome || 'Administrador');

export const autoriaDoDocumento = documento =>
  identidade(documento?.vendedorId, documento?.vendedorNome);

export function resolverAutoriaVenda({ operadorAtivo, autoriaAtendimento, documentoConfirmado } = {}) {
  // Para pré-pedidos, o documento confirmado pelo servidor já foi lido pelo
  // fluxo de liquidação existente: sua autoria prevalece sobre o rascunho local.
  return autoriaDoDocumento(documentoConfirmado)
    || identidade(autoriaAtendimento?.vendedorId, autoriaAtendimento?.vendedorNome)
    || autoriaDoOperador(operadorAtivo);
}
