import { TIPOS_FISCAIS, listarPendenciasFiscais } from './fiscalCore.js';
import { selecionarFiscalAdapter } from './fiscalAdapters.js';

export const TIPOS_FISCAIS_LABEL = Object.freeze({
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfse: 'NFS-e',
  factura_electronica: 'Factura eletrônica',
});

export const listarFilaFiscalOperacional = ({
  lojaId,
  perfilLoja,
  vendas = [],
  documentos = [],
  ambiente = 'homologacao',
}) => {
  selecionarFiscalAdapter(perfilLoja);
  const fila = listarPendenciasFiscais({ lojaId, perfilLoja, vendas, documentos, ambiente });
  const vendasPorId = new Map(vendas.map(venda => [String(venda?.id), venda]));
  return fila.map(item => ({ ...item, venda:vendasPorId.get(item.vendaId) || null }));
};

export const prepararPreviaFiscal = ({
  lojaId,
  perfilLoja,
  venda,
  clientes = [],
  tipoDocumento,
  ambiente = 'homologacao',
  createdAt = new Date().toISOString(),
}) => {
  const adapter = selecionarFiscalAdapter(perfilLoja);
  if (!TIPOS_FISCAIS[adapter.pais].includes(tipoDocumento)) {
    const error = new Error('Tipo fiscal incompatível com o país da loja.');
    error.code = 'FISCAL_TIPO_INVALIDO';
    throw error;
  }
  const cliente = venda?.clienteId == null
    ? null
    : clientes.find(item => String(item?.id) === String(venda.clienteId)) || null;
  const cadastro = adapter.validarCadastro({ perfilLoja, cliente });
  const snapshot = adapter.prepararDocumento({
    lojaId,
    perfilLoja,
    venda,
    cliente,
    tipoDocumento,
    ambiente,
    createdAt,
  });
  return { adapter:adapter.nome, cadastro, snapshot };
};
