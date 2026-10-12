// Validação pura: não acessa banco, credenciais ou rede.
export class FiscalSolicitacaoError extends Error {
  constructor(message){super(message);this.name='FiscalSolicitacaoError';}
}
const obrigar=(ok,mensagem)=>{if(!ok)throw new FiscalSolicitacaoError(mensagem);};
const texto=(v,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
const camposComuns=['responsavel','telefone','email'];
const camposPais={
 BR:['razaoSocial','nomeFantasia','cnpj','inscricaoEstadual','inscricaoMunicipal','regimeTributario','uf','municipio','municipioCodigoIbge','logradouro','numero','complemento','bairro','endereco','cep','codigoServico'],
 PY:['razonSocial','ruc','dv','direccion','departamento','distrito','establecimiento','puntoExpedicion','timbrado'],
};
export function cnpjValido(v) {
 const d=String(v||'').replace(/\D/g,'');
 if(!/^\d{14}$/.test(d)||/^(\d)\1+$/.test(d))return false;
 const digito=tam=>{
   const pesos=tam===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];
   const soma=pesos.reduce((acc,p,i)=>acc+Number(d[i])*p,0);
   const resto=soma%11;return resto<2?0:11-resto;
 };
 return digito(12)===Number(d[12])&&digito(13)===Number(d[13]);
}
export function validarCadastroSolicitacao(data={}) {
 const pais=data?.pais;
 obrigar(Object.hasOwn(camposPais,pais),'Selecione Brasil ou Paraguai.');
 const cadastro={};
 for(const campo of [...camposPais[pais],...camposComuns]){
   cadastro[campo]=texto(data?.cadastro?.[campo],['endereco','direccion'].includes(campo)?300:180);
 }
 if(pais==='BR'){
   obrigar(Boolean(cadastro.razaoSocial),'Informe a razão social.');
   obrigar(cnpjValido(cadastro.cnpj),'Informe um CNPJ válido, com dígitos verificadores corretos.');
   cadastro.cnpj=cadastro.cnpj.replace(/\D/g,'');
 }else{
   obrigar(Boolean(cadastro.razonSocial),'Informe a razón social.');
   obrigar(/^\d{3,12}$/.test(cadastro.ruc.replace(/\D/g,'')),'Informe o RUC numérico da empresa.');
   cadastro.ruc=cadastro.ruc.replace(/\D/g,'');
 }
 obrigar(Boolean(cadastro.telefone||cadastro.email),'Informe telefone ou e-mail para contato.');
 if(cadastro.email)obrigar(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cadastro.email),'E-mail inválido.');
 return {pais,cadastro};
}
