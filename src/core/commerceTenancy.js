/**
 * ZenOS Commerce — regras de identidade e licença, sem acesso à nuvem.
 * NUNCA considerar licença validada por um valor editável no navegador.
 * Em produção, validar assinatura, loja e status EXCLUSIVAMENTE no servidor.
 */
export const ESTADOS_COMMERCE = Object.freeze(['nao_contratado', 'solicitado', 'em_homologacao', 'ativo', 'suspenso', 'cancelado']);

export function validarIdPublico(id) {
  return typeof id === 'string' && /^zc-[a-z2-9]{10,24}$/.test(id);
}

export function gerarIdPublicoComAleatoriedade(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 9) throw new Error('Aleatoriedade segura obrigatória.');
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  // ID opaco, não derivado de CPF, UID de autenticação ou nome do estabelecimento.
  return 'zc-' + [...bytes].slice(0, 14).map(n => alfabeto[n % alfabeto.length]).join('');
}

export function criarUrlPublica({ urlBase, idPublico } = {}) {
  if (!validarIdPublico(idPublico)) throw new Error('Identificador de loja inválido.');
  const url = new URL(urlBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Domínio público seguro deve usar HTTPS e não conter parâmetros.');
  }
  // A rota pública resolve para o ID interno somente pelo serviço de diretório.
  return new URL('/loja/' + idPublico, url.origin).href;
}

export function podePublicarCommerce(entitlement = {}) {
  // Indicador visual APENAS: backend deve validar status e titularidade de loja novamente.
  return entitlement.status === 'ativo' && entitlement.modulo === 'commerce'
    && entitlement.ativacaoConfirmadaServidor === true && entitlement.bloqueado !== true;
}

export function estadoPlanoCommerce(licenca = {}) {
  const status = ESTADOS_COMMERCE.includes(licenca.status) ? licenca.status : 'nao_contratado';
  return {
    status,
    ativo: podePublicarCommerce(licenca),
    permitePreview: true,
    mensagem: status === 'ativo'
      ? 'Assinatura ativa. A publicação exige confirmação do servidor.'
      : status === 'solicitado' ? 'Solicitação enviada. Aguarde análise e ativação.'
      : status === 'suspenso' ? 'Loja temporariamente suspensa. Catálogo público indisponível.'
      : 'Commerce opcional: configure uma prévia e solicite a ativação, sem cobrança automática.',
  };
}

export function registroDiretorioPublico({ idPublico, lojaId, licenca }) {
  if (!validarIdPublico(idPublico) || !lojaId || !podePublicarCommerce(licenca)) {
    throw new Error('A publicação exige identificador exclusivo e licença confirmada pelo servidor.');
  }
  // SOMENTE backend pode gravar a correspondência idPublico -> lojaId.
  return { idPublico, lojaId: String(lojaId), estado: 'ativo' };
}
