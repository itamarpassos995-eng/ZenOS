import { FiscalError, criarFiscalOperationKey, criarFiscalSaleLockKey, validarDocumentoFiscalDaLoja } from './fiscalCore.js';
import { selecionarFiscalAdapter } from './fiscalAdapters.js';

/**
 * Fundacao testavel para o backend futuro, nao conectada ao navegador/Firestore.
 * Instanciar somente apos autorizacao da loja no servidor.
 * transacionar deve serializar conflitos e fornecer somente leituras comerciais
 * e escrita fiscal no namespace da loja autorizada. Nunca enviar para governo
 * dentro do callback (transacoes podem reexecuta-lo).
 */
export const criarFiscalRepository = ({ lojaId, transacionar }) => {
  if (!lojaId || typeof transacionar !== 'function') throw new FiscalError('FISCAL_BACKEND_NAO_CONFIGURADO', 'Repositorio exige loja autorizada e transacao fiscal.');
  const lojaAutorizada = String(lojaId);
  return Object.freeze({
    async criarRascunho(comando) {
      if (String(comando?.lojaId) !== lojaAutorizada) throw new FiscalError('FISCAL_LOJA_DIVERGENTE', 'Comando fiscal fora da loja autorizada.');
      const key = criarFiscalOperationKey(comando);
      const lockKey = criarFiscalSaleLockKey(comando);
      if (comando.fiscalOperationKey !== key) throw new FiscalError('FISCAL_IDENTIDADE_INVALIDA', 'Chave fiscal nao corresponde ao comando.');
      return transacionar(async tx => {
        const existente = await tx.obterDocumento(lojaAutorizada, key);
        const trava = await tx.obterTravaVenda(lojaAutorizada, lockKey);
        // Politica conservadora da fundacao: um tipo principal por venda/ambiente.
        // Troca/liberacao de tipo exige politica futura explicita, nunca retry automatico.
        if (trava && (trava.lojaId !== lojaAutorizada || trava.fiscalSaleLockKey !== lockKey)) {
          throw new FiscalError('FISCAL_LOJA_DIVERGENTE', 'Trava fiscal fora da loja ou venda autorizada.');
        }
        if (trava && trava.fiscalOperationKey !== key) {
          throw new FiscalError('FISCAL_TIPO_CONFLITANTE', 'Esta venda ja possui reserva fiscal de outro tipo neste ambiente.');
        }
        if (existente) {
          validarDocumentoFiscalDaLoja(existente, lojaAutorizada);
          if (existente.fiscalOperationKey !== key) throw new FiscalError('FISCAL_IDENTIDADE_INVALIDA', 'Documento retornado nao corresponde a reserva fiscal.');
          if (!trava) await tx.salvarTravaVenda(lojaAutorizada, lockKey, { lojaId:lojaAutorizada, fiscalSaleLockKey:lockKey, fiscalOperationKey:key });
          return structuredClone(existente);
        }
        // O contexto e lido pelo backend na loja autorizada, nao recebido do cliente.
        const contexto = await tx.obterContextoVenda(lojaAutorizada, comando.vendaId);
        if (!contexto?.venda || String(contexto.venda.id) !== String(comando.vendaId)) {
          throw new FiscalError('FISCAL_VENDA_INEXISTENTE', 'Venda comercial nao encontrada na loja autorizada.');
        }
        for (const entidade of [contexto, contexto.perfilLoja, contexto.venda, contexto.cliente]) {
          if (entidade?.lojaId != null && String(entidade.lojaId) !== lojaAutorizada) {
            throw new FiscalError('FISCAL_LOJA_DIVERGENTE', 'Contexto comercial nao pertence a loja autorizada.');
          }
        }
        const documento = selecionarFiscalAdapter(contexto.perfilLoja).prepararDocumento({
          lojaId:lojaAutorizada, perfilLoja:contexto.perfilLoja, venda:contexto.venda,
          cliente:contexto.cliente ?? null, tipoDocumento:comando.tipoDocumento, ambiente:comando.ambiente,
        });
        await tx.salvarTravaVenda(lojaAutorizada, lockKey, { lojaId:lojaAutorizada, fiscalSaleLockKey:lockKey, fiscalOperationKey:key });
        await tx.salvarDocumento(lojaAutorizada, key, structuredClone(documento));
        return structuredClone(documento);
      });
    },
  });
};
