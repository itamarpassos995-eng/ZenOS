export class FiscalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FiscalError';
    this.code = code;
  }
}

export const STATUS_FISCAIS = Object.freeze([
  'nao_solicitado', 'pendente', 'rascunho', 'enviando', 'autorizado', 'rejeitado', 'cancelado',
]);
export const TIPOS_FISCAIS = Object.freeze({
  BR: Object.freeze(['nfe', 'nfce', 'nfse']),
  PY: Object.freeze(['factura_electronica']),
});

const exigir = (condition, code, message) => {
  if (!condition) throw new FiscalError(code, message);
};
const identificador = (value) => {
  exigir(typeof value === 'string' || typeof value === 'number', 'FISCAL_ID_INVALIDO', 'Identificador fiscal ausente ou invalido.');
  const id = String(value).trim();
  exigir(id.length > 0, 'FISCAL_ID_INVALIDO', 'Identificador fiscal obrigatorio.');
  return id;
};

export const obterPaisFiscalLoja = (perfilLoja) => {
  exigir(Object.hasOwn(TIPOS_FISCAIS, perfilLoja?.pais), 'FISCAL_PAIS_INVALIDO', 'Configure o pais BR ou PY no cadastro da loja.');
  return perfilLoja.pais;
};

export const criarFiscalOperationKey = ({ lojaId, vendaId, tipoDocumento, ambiente = 'homologacao' }) => {
  exigir(Object.values(TIPOS_FISCAIS).some(tipos => tipos.includes(tipoDocumento)), 'FISCAL_TIPO_INVALIDO', 'Tipo de documento fiscal invalido.');
  exigir(['homologacao', 'producao'].includes(ambiente), 'FISCAL_AMBIENTE_INVALIDO', 'Ambiente fiscal invalido.');
  // Tentativas e revisoes nao mudam a identidade do documento logico.
  return JSON.stringify([identificador(lojaId), identificador(vendaId), tipoDocumento, ambiente]);
};

export const criarFiscalSaleLockKey = ({ lojaId, vendaId, ambiente = 'homologacao' }) => {
  exigir(['homologacao', 'producao'].includes(ambiente), 'FISCAL_AMBIENTE_INVALIDO', 'Ambiente fiscal invalido.');
  return JSON.stringify([identificador(lojaId), identificador(vendaId), ambiente]);
};

export const validarDocumentoFiscalDaLoja = (documento, lojaId) => {
  exigir(documento && String(documento.lojaId) === identificador(lojaId), 'FISCAL_LOJA_DIVERGENTE', 'Documento fiscal nao pertence a esta loja.');
  exigir(STATUS_FISCAIS.includes(documento.statusFiscal), 'FISCAL_STATUS_INVALIDO', 'Estado fiscal invalido.');
  const key = criarFiscalOperationKey(documento);
  exigir(documento.fiscalOperationKey === key, 'FISCAL_IDENTIDADE_INVALIDA', 'Identidade do documento fiscal inconsistente.');
  exigir(documento.fiscalSaleLockKey === criarFiscalSaleLockKey(documento), 'FISCAL_IDENTIDADE_INVALIDA', 'Trava fiscal da venda inconsistente.');
  exigir(TIPOS_FISCAIS[documento.pais]?.includes(documento.tipoDocumento), 'FISCAL_TIPO_INVALIDO', 'Tipo fiscal incompativel com o pais do documento.');
  return documento;
};

const copiarCampos = (origem, campos) => Object.fromEntries(campos.map(campo => {
  const value = origem?.[campo] ?? null;
  exigir(value === null || ['string', 'number', 'boolean'].includes(typeof value), 'FISCAL_SNAPSHOT_INVALIDO', `Campo ${campo} deve ser escalar.`);
  exigir(typeof value !== 'number' || Number.isFinite(value), 'FISCAL_SNAPSHOT_INVALIDO', `Campo ${campo} contem numero invalido.`);
  return [campo, value];
}));
const CAMPOS_EMITENTE = ['nomeFantasia', 'razaoSocial', 'pais', 'documento1', 'documento2', 'telefone', 'endereco', 'cidade'];
const CAMPOS_DESTINATARIO = ['id', 'nome', 'pais', 'tipoDocumento', 'documento', 'telefone', 'email', 'endereco', 'cidade'];
const CAMPOS_ITEM = ['id', 'produtoOriginalId', 'produtoOriginalSku', 'nome', 'descricao', 'sku', 'tipoItem', 'unidadeMedida', 'qtd', 'precoPraticadoBRL', 'precoTexto', 'qtdDevolvida', 'ncm', 'cest', 'cfop', 'origem', 'codigoDnit', 'ivaParaguai', 'unidadMedidaPy'];
const CAMPOS_PAGAMENTO = ['id', 'formaId', 'rotulo', 'moedaOrigem', 'valorOriginal', 'valorConvertidoBRL', 'voucherCodigo'];
const CAMPOS_TOTAIS = ['totalBRL', 'totalLiquidoBRL', 'trocoBRL', 'cmvBRL', 'lucroBRL', 'lucroLiquidoBRL', 'valorDevolvidoBRL', 'custoDevolvidoBRL'];
const CAMPOS_TOTAIS_ORIGINAIS = ['subtotal', 'desconto', 'total', 'totalLiquido', 'troco'];
const validarMoeda = (moeda) => {
  exigir(moeda === null || (typeof moeda === 'string' && /^[A-Z]{3}$/.test(moeda)), 'FISCAL_MOEDA_INVALIDA', 'Moeda deve ser um codigo de tres letras ou permanecer ausente.');
  return moeda;
};
const copiarValoresOriginaisItem = (item) => {
  if (item.valoresOriginais == null) return null;
  const moeda = validarMoeda(item.valoresOriginais.moeda ?? null);
  exigir(moeda !== null, 'FISCAL_MOEDA_INVALIDA', 'Valores originais do item exigem moeda explicita.');
  return { ...copiarCampos(item.valoresOriginais, ['precoUnitario', 'total', 'desconto']), moeda };
};

export const vendaElegivelParaFiscal = (venda) => Boolean(
  venda?.clienteQuerFiscal === true && ['concluida', 'parcial'].includes(venda.estado),
);

export const criarRascunhoFiscal = ({ lojaId, perfilLoja, venda, cliente = null, tipoDocumento, ambiente = 'homologacao', createdAt = new Date().toISOString() }) => {
  const pais = obterPaisFiscalLoja(perfilLoja);
  exigir(TIPOS_FISCAIS[pais].includes(tipoDocumento), 'FISCAL_TIPO_INVALIDO', 'Tipo de documento incompativel com o pais da loja.');
  exigir(vendaElegivelParaFiscal(venda), 'FISCAL_VENDA_INELEGIVEL', 'A venda deve estar concluida e solicitar documento fiscal.');
  exigir(venda.lojaId == null || String(venda.lojaId) === identificador(lojaId), 'FISCAL_LOJA_DIVERGENTE', 'Venda pertence a outra loja.');
  exigir(Array.isArray(venda.itens) && venda.itens.length > 0 && Array.isArray(venda.pagamentos), 'FISCAL_SNAPSHOT_INVALIDO', 'Venda sem itens ou pagamentos compativeis.');
  const moedaComercial = validarMoeda(venda.moedaComercial ?? venda.moeda ?? perfilLoja.moedaComercial ?? perfilLoja.moeda ?? null);
  const moedaFiscal = validarMoeda(venda.moedaFiscal ?? perfilLoja.moedaFiscal ?? moedaComercial ?? (pais === 'PY' ? 'PYG' : 'BRL'));
  const totaisOriginaisSnapshot = venda.totaisComerciais == null ? null : copiarCampos(venda.totaisComerciais, CAMPOS_TOTAIS_ORIGINAIS);
  exigir(totaisOriginaisSnapshot === null || moedaComercial !== null, 'FISCAL_MOEDA_INVALIDA', 'Totais originais exigem moeda comercial identificada.');
  exigir(totaisOriginaisSnapshot === null || (Number.isFinite(totaisOriginaisSnapshot.total) && totaisOriginaisSnapshot.total > 0), 'FISCAL_SNAPSHOT_INVALIDO', 'Total original invalido.');
  exigir(totaisOriginaisSnapshot !== null || (Number.isFinite(venda.totalBRL) && venda.totalBRL > 0), 'FISCAL_SNAPSHOT_INVALIDO', 'Total comercial invalido.');
  exigir(cliente === null || (venda.clienteId != null && String(cliente.id) === String(venda.clienteId)), 'FISCAL_CLIENTE_DIVERGENTE', 'Destinatario nao corresponde ao cliente da venda.');
  exigir(Number.isFinite(Date.parse(createdAt)), 'FISCAL_DATA_INVALIDA', 'Data fiscal invalida.');
  const fiscalOperationKey = criarFiscalOperationKey({ lojaId, vendaId:venda.id, tipoDocumento, ambiente });
  const id = `FISCAL-${encodeURIComponent(fiscalOperationKey)}`;
  exigir(new TextEncoder().encode(id).length < 1500, 'FISCAL_ID_INVALIDO', 'Identificador fiscal excede o limite de armazenamento.');
  return {
    id, lojaId:identificador(lojaId), vendaId:identificador(venda.id), pais,
    moeda:moedaFiscal, moedaFiscal, moedaComercial, tipoDocumento, ambiente,
    statusFiscal:'rascunho', fiscalOperationKey,
    fiscalSaleLockKey:criarFiscalSaleLockKey({ lojaId, vendaId:venda.id, ambiente }),
    dadosEmitenteSnapshot:copiarCampos(perfilLoja, CAMPOS_EMITENTE),
    dadosDestinatarioSnapshot:cliente
      ? copiarCampos(cliente, CAMPOS_DESTINATARIO)
      : { ...copiarCampos(null, CAMPOS_DESTINATARIO), id:venda.clienteId ?? null, nome:venda.clienteNome ?? null },
    itensSnapshot:venda.itens.map(item => ({
      ...copiarCampos(item, CAMPOS_ITEM),
      // precoTexto e apenas texto de tela: sem moeda registrada, nao e preco fiscal.
      valoresOriginaisSnapshot:copiarValoresOriginaisItem(item),
    })),
    pagamentosSnapshot:venda.pagamentos.map(pagamento => copiarCampos(pagamento, CAMPOS_PAGAMENTO)),
    // Preserva os campos legados BRL sem usa-los como valores na moeda original.
    totaisComerciaisSnapshot:{ moeda:'BRL', semantica:'valores_gerenciais_legados_brl', ...copiarCampos(venda, CAMPOS_TOTAIS) },
    totaisOriginaisSnapshot,
    valoresGerenciaisSnapshot:{ moeda:'BRL', ...copiarCampos(venda, CAMPOS_TOTAIS) },
    tributosSnapshot:null, impactoFiscalSnapshot:null, cargaFiscalPercentual:null,
    createdAt, updatedAt:createdAt, protocolo:null, chave:null, numero:null, serie:null,
    urlXml:null, urlRepresentacao:null, ultimoErro:null, tentativas:[],
    metadata:{
      schemaVersion:1, revisao:1, moedaComercial, estadoComercialNaCriacao:venda.estado,
      taxasCambioVenda:copiarCampos(venda.taxasCambio, ['BRL', 'USD', 'EUR', 'PYG']),
      descontoGlobalBRL:copiarCampos(venda, ['descontoGlobalBRL']).descontoGlobalBRL,
      exigeRevisao:true,
      integracao:'nao_configurada',
    },
  };
};

export const listarPendenciasFiscais = ({ lojaId, perfilLoja = {}, vendas = [], documentos = [], ambiente = 'homologacao' }) => {
  const loja = identificador(lojaId);
  exigir(perfilLoja.lojaId == null || String(perfilLoja.lojaId) === loja, 'FISCAL_LOJA_DIVERGENTE', 'Perfil de outra loja na fila fiscal.');
  exigir(['homologacao', 'producao'].includes(ambiente), 'FISCAL_AMBIENTE_INVALIDO', 'Ambiente fiscal invalido.');
  exigir(Array.isArray(vendas) && Array.isArray(documentos), 'FISCAL_FILA_INVALIDA', 'Fila fiscal exige listas de vendas e documentos.');
  documentos.forEach(documento => validarDocumentoFiscalDaLoja(documento, loja));
  const documentosAmbiente = documentos.filter(documento => documento.ambiente === ambiente);
  const vistos = new Set();
  return vendas.filter(venda => {
    exigir(venda.lojaId == null || String(venda.lojaId) === loja, 'FISCAL_LOJA_DIVERGENTE', 'Venda de outra loja na fila fiscal.');
    if (!vendaElegivelParaFiscal(venda)) return false;
    const id = identificador(venda.id);
    if (vistos.has(id)) return false;
    vistos.add(id);
    // Documento autorizado ou cancelado nao deve gerar uma nova emissao automatica.
    return !documentosAmbiente.some(doc => doc.vendaId === id && ['autorizado', 'cancelado'].includes(doc.statusFiscal));
  }).map(venda => {
    const moedaComercial = validarMoeda(venda.moedaComercial ?? venda.moeda ?? perfilLoja.moedaComercial ?? perfilLoja.moeda ?? null);
    const totalComercialOriginal = copiarCampos(venda.totaisComerciais, ['total']).total;
    exigir(totalComercialOriginal === null || moedaComercial !== null, 'FISCAL_MOEDA_INVALIDA', 'Total original da fila exige moeda comercial identificada.');
    return {
      lojaId:loja, vendaId:identificador(venda.id), clienteNome:venda.clienteNome ?? null,
      createdAt:venda.createdAt ?? null, totalBRL:venda.totalBRL ?? null,
      moedaComercial, totalComercialOriginal,
      exigeRevisao:true,
      statusFiscal:documentosAmbiente.find(doc => doc.vendaId === String(venda.id))?.statusFiscal || 'pendente',
    };
  });
};

// Reducer de eventos internos, sem efeitos comerciais ou autorizacao governamental.
export const aplicarEventoFiscalInterno = ({ documento, lojaId, evento }) => {
  validarDocumentoFiscalDaLoja(documento, lojaId);
  exigir(evento && typeof evento.id === 'string' && evento.id.trim(), 'FISCAL_EVENTO_INVALIDO', 'Evento fiscal exige identificador estavel.');
  const registro = copiarCampos(evento, ['id', 'statusFiscal', 'createdAt', 'codigoErro', 'mensagem']);
  const repetido = documento.tentativas.find(tentativa => tentativa.id === evento.id);
  if (repetido) {
    exigir(JSON.stringify(repetido) === JSON.stringify(registro), 'FISCAL_EVENTO_CONFLITANTE', 'Identificador fiscal reutilizado com outro evento.');
    return structuredClone(documento);
  }
  const transicoes = {
    pendente:['rascunho', 'cancelado'],
    rascunho:['cancelado'],
    enviando:['rejeitado'],
    rejeitado:['rascunho', 'cancelado'],
  };
  exigir(transicoes[documento.statusFiscal]?.includes(evento.statusFiscal), 'FISCAL_TRANSICAO_BLOQUEADA', 'Transicao indisponivel nesta fase. Autorizacao e cancelamento de documento autorizado exigem backend/provedor.');
  exigir(Number.isFinite(Date.parse(evento.createdAt)), 'FISCAL_DATA_INVALIDA', 'Evento fiscal exige data valida.');
  return {
    ...structuredClone(documento),
    statusFiscal:evento.statusFiscal,
    updatedAt:evento.createdAt,
    ultimoErro:evento.statusFiscal === 'rejeitado'
      ? { codigo:registro.codigoErro, mensagem:registro.mensagem } : null,
    tentativas:[...structuredClone(documento.tentativas), registro],
    metadata:{ ...structuredClone(documento.metadata), revisao:documento.metadata.revisao + 1 },
  };
};
