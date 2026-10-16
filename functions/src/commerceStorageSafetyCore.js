/**
 * Segurança adicional: homologação Commerce nunca pode utilizar o projeto/bucket
 * operacional ZenOS. Sem configuração EXPLÍCITA => nenhuma gravação.
 * Este módulo é puro e pode ser testado sem credenciais Firebase.
 */
export const PROJETO_PRODUCAO_ZENOS = 'zenos-ac6b2';
const BUCKET_PRODUCAO = 'zenos-ac6b2.firebasestorage.app';
const ID_PROJETO = /^[a-z][a-z0-9-]{4,62}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{2,180}$/;
const EMULADOR_LOCAL = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;

export function protegerAmbienteMidiaCommerce({
  mediaEnabled, homologacao, projectId, bucket, storageEmulatorHost,
} = {}) {
  if (mediaEnabled !== 'true' || homologacao !== 'true') {
    throw new Error('COMMERCE_HML_DESATIVADO');
  }
  if (typeof projectId !== 'string' || !ID_PROJETO.test(projectId)) {
    throw new Error('COMMERCE_HML_PROJETO_NAO_IDENTIFICADO');
  }
  if (projectId === PROJETO_PRODUCAO_ZENOS) {
    throw new Error('COMMERCE_HML_PRODUCAO_BLOQUEADA');
  }
  if (typeof bucket !== 'string' || !BUCKET.test(bucket) || bucket === BUCKET_PRODUCAO || bucket === `${PROJETO_PRODUCAO_ZENOS}.appspot.com`) {
    throw new Error('COMMERCE_HML_BUCKET_NAO_AUTORIZADO');
  }
  if (projectId === 'demo-zenos-local') {
    // Apenas emulação LOCAL; nunca serviço remoto com identidade fictícia.
    if (!EMULADOR_LOCAL.test(storageEmulatorHost || '') || bucket !== 'demo-zenos-local.appspot.com') {
      throw new Error('COMMERCE_HML_EMULADOR_LOCAL_OBRIGATORIO');
    }
    return { bucket, modo: 'emulador' };
  }
  if (storageEmulatorHost) {
    throw new Error('COMMERCE_HML_EMULADOR_NAO_PERMITIDO_COM_PROJETO_NUVEM');
  }
  // Bucket novo, exclusivo e explicitamente nomeado para homologação;
  // o nome não é prova de que o recurso exista, nem de sua propriedade/IAM.
  if (!bucket.startsWith(`zenos-commerce-hml-${projectId}`)) {
    throw new Error('COMMERCE_HML_BUCKET_DEVE_SER_EXCLUSIVO');
  }
  return { bucket, modo: 'nuvem-homologacao' };
}

export function ambienteMidiaCommercePronto(env = {}) {
  try {
    protegerAmbienteMidiaCommerce({
      mediaEnabled: env.ZENOS_COMMERCE_MEDIA_ENABLED,
      homologacao: env.ZENOS_COMMERCE_HOMOLOGACAO,
      projectId: env.GCLOUD_PROJECT || env.GCP_PROJECT,
      bucket: env.ZENOS_COMMERCE_STORAGE_BUCKET,
      storageEmulatorHost: env.FIREBASE_STORAGE_EMULATOR_HOST,
    });
    return true;
  } catch { return false; }
}
