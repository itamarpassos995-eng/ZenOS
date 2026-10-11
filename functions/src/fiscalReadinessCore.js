// Pure fiscal onboarding gate. No credentials, document writes or transmissions.
export const FISCAL_READINESS_FIELDS = Object.freeze({
  BR: Object.freeze({
    nfe: ['razaoSocial','cnpj','inscricaoEstadual','uf','municipioCodigoIbge','endereco','cep'],
    nfce: ['razaoSocial','cnpj','inscricaoEstadual','uf','municipioCodigoIbge','endereco','cep'],
    nfse: ['razaoSocial','cnpj','municipioCodigoIbge','endereco','cep','inscricaoMunicipal','codigoServico'],
  }),
  PY: Object.freeze({
    factura_electronica: ['razonSocial','ruc','dv','direccion','departamento','distrito','establecimiento','puntoExpedicion','timbrado'],
  }),
});
export const FISCAL_READINESS_LABELS = Object.freeze({
  FISCAL_PAIS_INVALIDO: ['País fiscal não suportado','País fiscal no admitido','Unsupported fiscal country'],
  FISCAL_TIPO_INVALIDO: ['Documento fiscal não suportado','Documento fiscal no admitido','Unsupported fiscal document'],
  FISCAL_CADASTRO_INCOMPLETO: ['Cadastro fiscal incompleto','Registro fiscal incompleto','Incomplete fiscal registration'],
  FISCAL_CREDENCIAMENTO_PENDENTE: ['Credenciamento fiscal pendente','Habilitación fiscal pendiente','Tax authorization pending'],
  FISCAL_CREDENCIAL_PENDENTE: ['Certificado ou credencial fiscal pendente','Certificado o credencial fiscal pendiente','Fiscal certificate or credential pending'],
  FISCAL_PROVEDOR_PENDENTE: ['Integração fiscal não homologada','Integración fiscal no homologada','Fiscal integration not certified'],
});
const texto = v => typeof v === 'string' ? v.trim() : '';
const presente = (cadastro, campo) => texto(cadastro?.[campo]).length > 0;
export function avaliarProntidaoFiscal({pais,tipoDocumento,cadastro={},credenciamentoConfirmado=false,credencialValidada=false,provedorHomologado=false} = {}) {
  const tipos = FISCAL_READINESS_FIELDS[pais];
  if (!tipos) return Object.freeze({apto:false,pendencias:['FISCAL_PAIS_INVALIDO'],camposAusentes:[]});
  const campos = tipos[tipoDocumento];
  if (!campos) return Object.freeze({apto:false,pendencias:['FISCAL_TIPO_INVALIDO'],camposAusentes:[]});
  const camposAusentes = campos.filter(campo => !presente(cadastro,campo));
  const pendencias = [];
  if (camposAusentes.length) pendencias.push('FISCAL_CADASTRO_INCOMPLETO');
  if (credenciamentoConfirmado !== true) pendencias.push('FISCAL_CREDENCIAMENTO_PENDENTE');
  if (credencialValidada !== true) pendencias.push('FISCAL_CREDENCIAL_PENDENTE');
  if (provedorHomologado !== true) pendencias.push('FISCAL_PROVEDOR_PENDENTE');
  return Object.freeze({apto:pendencias.length===0,pendencias,camposAusentes});
}
export function mensagemProntidaoFiscal(codigo,idioma='pt') {
  const indice = idioma === 'es' ? 1 : idioma === 'en' ? 2 : 0;
  return FISCAL_READINESS_LABELS[codigo]?.[indice] ?? codigo;
}
