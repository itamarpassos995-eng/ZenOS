import {validarCadastroSolicitacao, FiscalSolicitacaoError} from './fiscalSolicitacaoCore.js';

export const TIPOS_ATIVACAO = Object.freeze({BR:['nfce','nfe','nfse'],PY:['factura_electronica']});
const UF_IBGE = Object.freeze({AC:'12',AL:'27',AP:'16',AM:'13',BA:'29',CE:'23',DF:'53',ES:'32',GO:'52',MA:'21',MT:'51',MS:'50',MG:'31',PA:'15',PB:'25',PR:'41',PE:'26',PI:'22',RJ:'33',RN:'24',RS:'43',RO:'11',RR:'14',SC:'42',SP:'35',SE:'28',TO:'17'});
const text = value => typeof value==='string'?value.trim():'';
const requireValue = (valid,message) => {if(!valid)throw new FiscalSolicitacaoError(message);};

export function validarConfiguracaoFiscal(data={}) {
  requireValue(data.aceiteConfiguracao===true,'Confirme a revisão dos dados e a configuração do módulo.');
  const {pais,cadastro}=validarCadastroSolicitacao(data);
  requireValue(Array.isArray(data.tiposDocumento)&&data.tiposDocumento.length>0&&data.tiposDocumento.length<=3,'Escolha ao menos um documento fiscal.');
  requireValue(data.tiposDocumento.every(tipo=>TIPOS_ATIVACAO[pais].includes(tipo)),'Documento incompatível com o país da empresa.');
  if(pais==='BR') {
    cadastro.uf=text(cadastro.uf).toUpperCase();
    cadastro.cep=cadastro.cep.replace(/\D/g,'');
    requireValue(!cadastro.uf||Object.hasOwn(UF_IBGE,cadastro.uf),'Selecione um estado brasileiro válido.');
    requireValue(!cadastro.cep||/^\d{8}$/.test(cadastro.cep),'Informe um CEP com 8 dígitos.');
    requireValue(!cadastro.regimeTributario||['1','2','3','4'].includes(cadastro.regimeTributario),'Selecione o regime tributário da empresa.');
    requireValue(!cadastro.municipioCodigoIbge||/^\d{7}$/.test(cadastro.municipioCodigoIbge),'Selecione um município válido.');
    requireValue(!cadastro.uf||!cadastro.municipioCodigoIbge||cadastro.municipioCodigoIbge.startsWith(UF_IBGE[cadastro.uf]),'O município não pertence ao estado selecionado.');
  }
  return {pais,cadastro,tiposDocumento:[...new Set(data.tiposDocumento)],aceiteConfiguracao:true};
}

export function avaliarConfiguracaoFiscal({pais,cadastro={},tiposDocumento=[],validacaoProvedor=null}={}) {
  const fields=pais==='BR'
    ? ['razaoSocial','cnpj','regimeTributario','uf','municipio','municipioCodigoIbge','logradouro','numero','bairro','cep']
    : ['razonSocial','ruc','dv','direccion','departamento','distrito','establecimiento','puntoExpedicion','timbrado'];
  const missing=fields.filter(field=>!text(cadastro[field]));
  if(pais==='BR'&&tiposDocumento.some(tipo=>['nfe','nfce'].includes(tipo))&&!text(cadastro.inscricaoEstadual))missing.push('inscricaoEstadual');
  if(pais==='BR'&&tiposDocumento.includes('nfse'))for(const field of ['inscricaoMunicipal','codigoServico'])if(!text(cadastro[field]))missing.push(field);
  const steps=[
    {codigo:'cadastro',estado:missing.length||!tiposDocumento.length?'pendente':'concluido',camposAusentes:missing},
    {codigo:'provedor',estado:validacaoProvedor?.cadastroValidado===true?'concluido':'pendente',responsavel:'zenos'},
    {codigo:'credenciais',estado:'pendente',responsavel:'empresa'},
    {codigo:'credenciamento',estado:'pendente',responsavel:'empresa'},
    {codigo:'tributacao',estado:'pendente',responsavel:'empresa'},
    {codigo:'emissao_validada',estado:'pendente',responsavel:'zenos'},
  ];
  return {versao:1,provedor:pais==='BR'?'focus':null,emissaoHabilitada:false,cadastroCompleto:steps[0].estado==='concluido',tiposDocumento,etapas:steps,validacaoProvedor:validacaoProvedor?{cadastroValidado:validacaoProvedor.cadastroValidado===true,codigo:validacaoProvedor.codigo,verificadoEm:validacaoProvedor.verificadoEm}:null};
}

export function prepararCadastroFocus(cadastro) {
  return {nome:cadastro.razaoSocial,nome_fantasia:cadastro.nomeFantasia||cadastro.razaoSocial,cnpj:cadastro.cnpj,
    inscricao_estadual:cadastro.inscricaoEstadual||undefined,inscricao_municipal:cadastro.inscricaoMunicipal||undefined,
    regime_tributario:Number(cadastro.regimeTributario),logradouro:cadastro.logradouro,numero:cadastro.numero,
    complemento:cadastro.complemento||undefined,bairro:cadastro.bairro,municipio:cadastro.municipio,uf:cadastro.uf,cep:cadastro.cep,
    email:cadastro.email||undefined,telefone:cadastro.telefone||undefined,
    habilita_nfe:false,habilita_nfce:false,habilita_nfse:false,habilita_nfsen_producao:false,habilita_nfsen_homologacao:false,
    certificado_especifico:true,enviar_email_homologacao:false,enviar_email_destinatario:false};
}
