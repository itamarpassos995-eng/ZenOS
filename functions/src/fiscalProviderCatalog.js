// Catálogo local compartilhado. Não consulta Firestore nem autoriza emissões.
export const DOCUMENTOS_CONFIGURACAO = Object.freeze({
 BR:Object.freeze(['nfce','nfe','nfse']),
 PY:Object.freeze(['factura_electronica','nota_credito_electronica','nota_debito_electronica','nota_remision_electronica']),
});
export const PROVEDORES_FISCAIS = Object.freeze({
 focus:Object.freeze({id:'focus',nome:'Focus NFe',pais:'BR',estado:'em_validacao',documentos:DOCUMENTOS_CONFIGURACAO.BR}),
 sifende:Object.freeze({id:'sifende',nome:'Sifende',pais:'PY',estado:'em_validacao',documentos:DOCUMENTOS_CONFIGURACAO.PY}),
 kuota:Object.freeze({id:'kuota',nome:'Kuota',pais:'PY',estado:'integracao_solicitada',documentos:DOCUMENTOS_CONFIGURACAO.PY}),
});
const PADRAO=Object.freeze({BR:'focus',PY:'sifende'});
export function provedoresDoPais(pais){return Object.values(PROVEDORES_FISCAIS).filter(p=>p.pais===pais);}
export function validarEscolhaIntegracao(pais,escolha){
 if(!Object.hasOwn(PADRAO,pais))throw Error('FISCAL_PAIS_INVALIDO');
 if(escolha==null)return null; // Cadastros legados não mudam silenciosamente.
 if(!escolha||typeof escolha!=='object'||!['zenos','propria'].includes(escolha.modalidade))throw Error('FISCAL_MODALIDADE_INVALIDA');
 const provedor=escolha.modalidade==='zenos'?PADRAO[pais]:escolha.provedor;
 if(!PROVEDORES_FISCAIS[provedor]||PROVEDORES_FISCAIS[provedor].pais!==pais)throw Error('FISCAL_PROVEDOR_PAIS_INVALIDO');
 // Salva somente preferência; status de homologação nunca vem do navegador.
 return {versao:1,modalidade:escolha.modalidade,provedor};
}
export function provedorEfetivo(config={}){
 if(config.integracao)return validarEscolhaIntegracao(config.pais,config.integracao).provedor;
 return config.pais==='BR'?'focus':null;
}
export function coberturaConfigurada(config={}){
 const provedor=provedorEfetivo(config),item=PROVEDORES_FISCAIS[provedor];
 return {provedor,nome:item?.nome||null,estado:item?.estado||'nao_configurado',emissaoHabilitada:false,
  documentos:(config.tiposDocumento||[]).map(tipo=>({tipo,previsto:item?.documentos.includes(tipo)===true,emissaoHabilitada:false}))};
}
