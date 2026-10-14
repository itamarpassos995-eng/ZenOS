const invalid=()=>{throw new Error('FISCAL_CREDENCIAIS_INVALIDAS');};
export function validarCredenciaisFiscais(input={},tipos=[]){
 if(input.aceite!==true)throw new Error('FISCAL_ACEITE_OBRIGATORIO');
 const result={};
 for(const ambiente of ['homologacao','producao']){
  const value=input[ambiente];if(value==null)continue;
  if(!tipos.includes('nfce')||typeof value!=='object')invalid();
  const id=typeof value.idToken==='string'?value.idToken.trim():'';
  const csc=typeof value.csc==='string'?value.csc.trim():'';
  if(!/^\d{1,6}$/.test(id)||Number(id)<1||!/^[A-Za-z0-9-]{16,64}$/.test(csc))invalid();
  result[ambiente]={idToken:id,csc};
 }
 if(input.certificado!=null){
  const {base64,senha}=input.certificado;
  if(typeof base64!=='string'||!base64.length||base64.length>55000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)||typeof senha!=='string'||!senha.length||senha.length>256)invalid();
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length>40960||bytes.length<32||bytes[0]!==0x30)invalid();
  result.certificado={base64,senha}; // Recebido; validação criptográfica pelo provedor ainda pendente.
 }
 if(!Object.keys(result).length)invalid();
 return result;
}
export function metadataCredenciais(payload,agora){
 return {recebidoEm:agora,certificadoRecebido:Boolean(payload.certificado),certificadoValidado:false,
  homologacao:{cscRecebido:Boolean(payload.homologacao)},producao:{cscRecebido:Boolean(payload.producao)},
  validacaoPendente:true,emissaoHabilitada:false};
}
