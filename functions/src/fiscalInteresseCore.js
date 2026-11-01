import { DOCUMENTOS_CONFIGURACAO } from './fiscalProviderCatalog.js';
// Interesse comercial não autoriza emissão nem transmite dados ao provedor.
export function registrarInteresseFiscal(atual,{pais,uid,agora}) {
 if(!['BR','PY'].includes(pais))throw new Error('FISCAL_PAIS_INVALIDO');
 if(atual)return atual; // Repetir um clique nunca substitui cadastro ou aprovação existente.
 return {pais,status:'solicitado',habilitado:false,createdAt:agora,updatedAt:agora,solicitadoPor:uid,
  interesse:{versao:1,em:agora,por:uid},historico:[{tipo:'interesse_registrado',por:uid,em:agora}]};
}
export function resumirDemandaFiscal(itens,agora=new Date()) {
 const inicio=new Date(agora.getTime()-30*86400000).toISOString();
 const recentes=itens.filter(x=>x.createdAt>=inicio&&x.createdAt<=agora.toISOString());
 return {janelaDias:30,desde:inicio,solicitacoes:recentes.length,
  brasil:recentes.filter(x=>x.pais==='BR').length,paraguai:recentes.filter(x=>x.pais==='PY').length,
  cadastrosCompletos:recentes.filter(x=>x.cadastroCompleto).length,
  solicitantesPorDocumento:Object.fromEntries(Object.values(DOCUMENTOS_CONFIGURACAO).flat().map(tipo=>[tipo,recentes.filter(x=>x.tiposDocumento?.includes(tipo)).length])),
  emissoesVerificadas:null}; // Sem integração homologada, não inventar consumo de notas.
}
