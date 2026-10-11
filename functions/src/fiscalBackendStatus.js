import { randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { exigirIdentidadeFiscal, resolverLojaFiscalAutorizada } from './fiscalAuthorization.js';

const logFiscal = (level, fields) => {
  logger[level]('fiscal_backend_status', {
    action:'fiscal_backend_status',
    ...fields,
  });
};

export const fiscalBackendStatus = onCall(
  {
    region:'southamerica-east1',
    timeoutSeconds:30,
    memory:'256MiB',
  },
  async request => {
    const requestId = randomUUID();
    try {
      // Reject unauthenticated/cross-store requests before initializing Admin SDK.
      exigirIdentidadeFiscal(request.auth, request.data?.requestedLojaId ?? null);
      const adminFirestore = await obterAdminFirestore();
      const lojaAutorizada = await resolverLojaFiscalAutorizada({
        auth:request.auth,
        requestedLojaId:request.data?.requestedLojaId ?? null,
        firestore:adminFirestore,
      });

      // Leitura não destrutiva comprova que o Admin SDK alcança o namespace
      // fiscal mesmo quando o Client SDK está integralmente bloqueado pelas rules.
      await adminFirestore.doc(`lojas/${lojaAutorizada}/fiscal_documents/backend-status-probe`).get();

      logFiscal('info', {
        success:true,
        uid:request.auth.uid,
        lojaAutorizada,
        requestId,
      });

      return {
        ok:true,
        backendFiscal:true,
        lojaAutorizada,
        adminFiscalAccessOperational:true,
        persistenceEnabled:false,
        governmentIntegrationEnabled:false,
      };
    } catch (error) {
      const knownError = error instanceof HttpsError;
      const fiscalCode = knownError
        ? error.details?.fiscalCode
        : 'FISCAL_BACKEND_INDISPONIVEL';
      logFiscal('warn', {
        success:false,
        uid:request.auth?.uid || null,
        lojaAutorizada:null,
        fiscalCode,
        backendErrorCode:knownError ? null : String(error?.code || 'UNKNOWN'),
        backendErrorName:knownError ? null : String(error?.name || 'Error'),
        requestId,
      });
      if (knownError) throw error;
      throw new HttpsError(
        'internal',
        'Backend fiscal temporariamente indisponível.',
        { fiscalCode:'FISCAL_BACKEND_INDISPONIVEL' },
      );
    }
  },
);
