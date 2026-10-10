import { FiscalError, criarRascunhoFiscal, obterPaisFiscalLoja } from './fiscalCore.js';

const naoConfigurado = async () => {
  throw new FiscalError('FISCAL_NAO_CONFIGURADO', 'Integracao fiscal indisponivel nesta fase. Nenhum documento foi transmitido ou autorizado.');
};

const criarAdapter = (pais, nome) => Object.freeze({
  pais, nome,
  validarCadastro({ perfilLoja, cliente = null }) {
    if (obterPaisFiscalLoja(perfilLoja) !== pais) throw new FiscalError('FISCAL_PAIS_DIVERGENTE', 'Adapter nao corresponde ao pais da loja.');
    const pendencias = [
      ...['razaoSocial', 'documento1', 'endereco', 'cidade'].filter(campo => !String(perfilLoja[campo] || '').trim()).map(campo => `emitente.${campo}`),
      ...(!cliente ? ['destinatario.revisar'] : []),
      'classificacao_fiscal.revisar', 'endereco_estruturado.revisar', 'integracao.nao_configurada',
    ];
    return { configurado:false, aptoParaTransmissao:false, pendencias };
  },
  prepararDocumento(dados) {
    if (obterPaisFiscalLoja(dados.perfilLoja) !== pais) throw new FiscalError('FISCAL_PAIS_DIVERGENTE', 'Adapter nao corresponde ao pais da loja.');
    return criarRascunhoFiscal(dados);
  },
  emitir:naoConfigurado,
  consultar:naoConfigurado,
  cancelar:naoConfigurado,
  corrigir:naoConfigurado,
  gerarRepresentacao:naoConfigurado,
  obterDocumentoEletronico:naoConfigurado,
});

export const BrazilFiscalAdapter = criarAdapter('BR', 'BrazilFiscalAdapter');
export const ParaguayFiscalAdapter = criarAdapter('PY', 'ParaguayFiscalAdapter');
export const selecionarFiscalAdapter = (perfilLoja) => {
  if (perfilLoja?.pais === 'BR') return BrazilFiscalAdapter;
  if (perfilLoja?.pais === 'PY') return ParaguayFiscalAdapter;
  throw new FiscalError('FISCAL_PAIS_NAO_SUPORTADO', 'Pais fiscal ausente ou nao suportado. Configure BR ou PY na loja.');
};
