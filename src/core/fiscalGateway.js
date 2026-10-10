import { FiscalError, TIPOS_FISCAIS, criarFiscalOperationKey, validarDocumentoFiscalDaLoja } from './fiscalCore.js';
import { selecionarFiscalAdapter } from './fiscalAdapters.js';

/**
 * Contrato para backend futuro: criarRascunho atomico por fiscalOperationKey;
 * autenticar/autorizar loja, ler venda autoritativa e construir snapshots no servidor.
 * O backend nao recebe setters, pagamentos ou comandos comerciais.
 * Nao ha implementacao Firestore, cache local ou fallback em memoria neste gateway.
 */
export const criarFiscalGateway = ({ lojaId, perfilLoja, backend = null }) => {
  const adapter = selecionarFiscalAdapter(perfilLoja);
  return Object.freeze({
    configurado:typeof backend?.criarRascunho === 'function',
    adapter,
    async criarRascunho({ vendaId, tipoDocumento, ambiente = 'homologacao' }) {
      if (!backend || typeof backend.criarRascunho !== 'function') {
        throw new FiscalError('FISCAL_BACKEND_NAO_CONFIGURADO', 'Persistencia fiscal indisponivel. Configure um backend seguro antes de criar documentos persistentes.');
      }
      if (adapter.pais !== selecionarFiscalAdapter(perfilLoja).pais) {
        throw new FiscalError('FISCAL_PAIS_DIVERGENTE', 'Pais da loja mudou. Reabra o contexto fiscal.');
      }
      if (!TIPOS_FISCAIS[adapter.pais].includes(tipoDocumento)) {
        throw new FiscalError('FISCAL_TIPO_INVALIDO', 'Tipo fiscal incompativel com o pais da loja.');
      }
      const fiscalOperationKey = criarFiscalOperationKey({ lojaId, vendaId, tipoDocumento, ambiente });
      const documento = await backend.criarRascunho({
        lojaId:String(lojaId), vendaId:String(vendaId), tipoDocumento, ambiente, fiscalOperationKey,
      });
      validarDocumentoFiscalDaLoja(documento, lojaId);
      if (documento.fiscalOperationKey !== fiscalOperationKey || documento.pais !== adapter.pais) {
        throw new FiscalError('FISCAL_RESPOSTA_INVALIDA', 'Backend retornou documento de outra operacao fiscal.');
      }
      return structuredClone(documento);
    },
  });
};
