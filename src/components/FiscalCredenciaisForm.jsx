import React,{useEffect,useRef,useState} from 'react';
import {mensagemFiscalLocalizada} from '../core/fiscalErrorUi.js';
export default function FiscalCredenciaisForm({registro,chamar,onSaved,tx=pt=>pt}){
 const [ambiente,setAmbiente]=useState('homologacao'),[idToken,setId]=useState(''),[csc,setCsc]=useState(''),[arquivo,setArquivo]=useState(null),[senha,setSenha]=useState(''),[aceite,setAceite]=useState(false),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(''),[sucesso,setSucesso]=useState(false);
 const input=useRef(null);const nfce=registro.tiposDocumento?.includes('nfce');
 const ativo=useRef(true);useEffect(()=>{ativo.current=true;return()=>{ativo.current=false;};},[]);
 const limpar=()=>{setId('');setCsc('');setArquivo(null);setSenha('');setAceite(false);if(input.current)input.current.value='';};
 const salvar=async e=>{
  e.preventDefault();if(ocupado)return;setErro('');setSucesso(false);
  if(!aceite){setErro(tx('Confirme a autorização de armazenamento.','Confirma la autorización de almacenamiento.','Confirm storage authorization.'));return;}
  if(!arquivo&&!idToken&&!csc){setErro(tx('Informe o certificado ou o ID e CSC.','Indica el certificado o ID y CSC.','Provide a certificate or ID and CSC.'));return;}
  if(arquivo&&(arquivo.size>40960||! /\.(pfx|p12)$/i.test(arquivo.name))){setErro(tx('Use um certificado A1 .pfx ou .p12 de até 40 KB.','Usa un certificado A1 .pfx o .p12 de hasta 40 KB.','Use an A1 .pfx or .p12 certificate up to 40 KB.'));return;}
  setOcupado(true);
  try{
   const credenciais={aceite:true};if(idToken||csc)credenciais[ambiente]={idToken,csc};
   if(arquivo){const bytes=new Uint8Array(await arquivo.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);credenciais.certificado={base64:btoa(binary),senha};}
   const resposta=await chamar('salvarCredenciais',{credenciais});
   if(!ativo.current)return;
   if(!resposta.data?.credenciais?.recebidoEm)throw Error('FISCAL_RESPOSTA_INVALIDA');
   limpar();setSucesso(true);onSaved(resposta.data);
  }catch(error){if(ativo.current)setErro(String(error?.code||'').includes('invalid-argument')||String(error?.code||'').includes('failed-precondition')?mensagemFiscalLocalizada(error,tx,'credenciais'):tx('Não foi possível confirmar o armazenamento seguro. Atualize o status antes de tentar novamente.','No se pudo confirmar el almacenamiento seguro. Actualiza el estado antes de reintentar.','Secure storage could not be confirmed. Refresh status before retrying.'));}
  finally{if(ativo.current)setOcupado(false);}
 };
 return <form className="fiscal-onboard-form" onSubmit={salvar}>
  <h3>{tx('Certificado e credenciais','Certificado y credenciales','Certificate and credentials')}</h3>
  <p>{tx('Preencha com seu contador. Os valores são enviados ao cofre seguro e não ficam salvos neste dispositivo.','Completa con tu contador. Los valores se envían al almacén seguro y no se guardan en este dispositivo.','Complete with your accountant. Values are sent to the secure vault and are not saved on this device.')}</p>
  {registro.credenciais&&<p role="status">{tx('Recebido: ','Recibido: ','Received: ')}{[registro.credenciais.certificadoRecebido?'Certificado A1':null,registro.credenciais.homologacao?.cscRecebido?tx("CSC homologação","CSC de homologación"):null,registro.credenciais.producao?.cscRecebido?tx("CSC produção","CSC de producción"):null].filter(Boolean).join(' · ')}. {tx('Validação pendente; emissão bloqueada.','Validación pendiente; emisión bloqueada.','Validation pending; issuing blocked.')}</p>}
  <fieldset disabled={ocupado} style={{border:0,padding:0}}>
   <div className="fiscal-onboard-grid">
    <label className="fiscal-onboard-field"><span>{tx('Certificado digital A1 (.pfx / .p12)','Certificado digital A1 (.pfx / .p12)','A1 digital certificate (.pfx / .p12)')}</span><input ref={input} type="file" accept=".pfx,.p12" onChange={e=>{setArquivo(e.target.files?.[0]||null);setSucesso(false);}}/></label>
    <label className="fiscal-onboard-field"><span>{tx('Senha do certificado','Contraseña del certificado','Certificate password')}</span><input type="password" value={senha} onChange={e=>setSenha(e.target.value)} autoComplete="new-password" maxLength={256} required={Boolean(arquivo)}/></label>
   </div>
   {nfce&&<><h4>NFC-e</h4><div className="fiscal-onboard-grid">
    <label className="fiscal-onboard-field"><span>{tx('Ambiente do CSC','Ambiente del CSC','CSC environment')}</span><select value={ambiente} onChange={e=>{setAmbiente(e.target.value);setId('');setCsc('');}}><option value="homologacao">{tx('Homologação — testes','Homologación — pruebas','Homologation — tests')}</option><option value="producao">{tx('Produção — armazenar para ativação futura','Producción — guardar para activación futura','Production — store for future activation')}</option></select></label>
    <label className="fiscal-onboard-field"><span>{tx('ID do CSC (ID Token da SEFAZ)','ID del CSC (ID Token de SEFAZ)','CSC ID (SEFAZ Token ID)')}</span><input value={idToken} onChange={e=>setId(e.target.value)} inputMode="numeric" pattern="[0-9]{1,6}" maxLength={6} required={Boolean(csc)}/></label>
    <label className="fiscal-onboard-field"><span>CSC</span><input type="password" value={csc} onChange={e=>setCsc(e.target.value)} autoComplete="new-password" maxLength={64} required={Boolean(idToken)}/></label>
   </div><p className="fiscal-onboard-note">{tx('ID e CSC são fornecidos pela SEFAZ da empresa. Não use o token da API Focus. Salvar credenciais de produção não autoriza emissão.','ID y CSC los proporciona SEFAZ. No uses el token de la API Focus. Guardar credenciales de producción no autoriza emisión.','SEFAZ provides the ID and CSC. Do not use the Focus API token. Saving production credentials does not authorize issuing.')}</p></>}
   <label className="fiscal-onboard-consent"><input type="checkbox" checked={aceite} onChange={e=>setAceite(e.target.checked)} required/><span>{tx('Sou autorizado pela empresa e autorizo o armazenamento seguro destas credenciais para configurar o módulo fiscal.','Estoy autorizado por la empresa y autorizo almacenar estas credenciales de forma segura.','I am authorized by the company and authorize secure storage of these fiscal credentials.')}</span></label>
   <button type="submit" className="fiscal-onboard-primary">{ocupado?tx('Enviando com segurança…','Enviando de forma segura…','Sending securely…'):tx('Salvar credenciais com segurança','Guardar credenciales de forma segura','Save credentials securely')}</button>
  </fieldset>
  {erro&&<p role="alert" className="fiscal-onboard-alert">{erro}</p>}
  {sucesso&&<p role="status">{tx('Credenciais recebidas no cofre seguro. A validação e a homologação da emissão continuam pendentes.','Credenciales recibidas en el almacén seguro. La validación y homologación siguen pendientes.','Credentials received in the secure vault. Validation and issuing homologation remain pending.')}</p>}
 </form>;
}
