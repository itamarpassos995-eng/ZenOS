import React,{useState,useEffect} from 'react';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from '../firebase';

const campos={
 BR:[['razaoSocial','Razão social *'],['cnpj','CNPJ (14 números) *'],['inscricaoEstadual','Inscrição estadual'],['inscricaoMunicipal','Inscrição municipal'],['uf','UF'],['municipioCodigoIbge','Código IBGE do município'],['endereco','Endereço completo'],['cep','CEP'],['codigoServico','Código de serviço (NFS-e)']],
 PY:[['razonSocial','Razón social *'],['ruc','RUC sem DV *'],['dv','Dígito verificador'],['direccion','Dirección'],['departamento','Departamento'],['distrito','Distrito'],['establecimiento','Establecimiento'],['puntoExpedicion','Punto de expedición'],['timbrado','Timbrado']]
};
export default function FiscalContratacao({lojaId,perfilLoja,tx=(pt)=>pt}){
 const [registro,setRegistro]=useState(null),[pais,setPais]=useState(perfilLoja?.pais==='PY'?'PY':'BR'),[cadastro,setCadastro]=useState({}),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[enviando,setEnviando]=useState(false),[editar,setEditar]=useState(false);
 const chamar=(action,extras={})=>httpsCallable(getFunctions(undefined,'southamerica-east1'),'fiscalSolicitacaoCliente')({action,lojaId,...extras});
 useEffect(()=>{let ativo=true;setCarregando(true);chamar('consultar').then(r=>{if(!ativo)return;setRegistro(r.data);if(r.data?.pais)setPais(r.data.pais);if(r.data?.cadastro)setCadastro(r.data.cadastro);setErro('');}).catch(e=>{if(ativo)setErro(e?.message||'Não foi possível consultar a solicitação.');}).finally(()=>{if(ativo)setCarregando(false)});return()=>{ativo=false};},[lojaId]);
 const solicitar=async(e)=>{e.preventDefault();if(!auth.currentUser){setErro('Entre em sua conta para solicitar.');return;}setEnviando(true);setErro('');try{const r=await chamar('solicitar',{pais,cadastro});setRegistro(v=>({...v,...r.data,cadastro,pais}));setEditar(false)}catch(e){setErro(e?.message||'Falha ao solicitar.')}finally{setEnviando(false)}};
 const status=registro?.status||'nao_solicitado',mostrarFormulario=status==='nao_solicitado'||editar;
 return <section className="fiscal-contratacao" style={{marginBottom:24,padding:20,border:'1px solid #d3dbe7',borderRadius:14}}>
  <h2>{tx('Contratar ZenOS Fiscal','Contratar ZenOS Fiscal','Subscribe to ZenOS Fiscal')}</h2>
  <p>{tx('O módulo é opcional e contratado separadamente. Solicite a habilitação sem interromper seu PDV. A emissão só será liberada após conferência cadastral, credenciamento, homologação e contratação.','El módulo es opcional. Solicite la habilitación sin interrumpir sus ventas. La emisión requiere validación y contratación.','The module is optional. Request activation without interrupting sales. Issuing requires verification and subscription.')}</p>
  {carregando?<p>Consultando situação fiscal…</p>:<p><strong>{status==='nao_solicitado'?'Disponível para solicitação':status==='em_analise'?'Solicitação recebida — em análise':status==='ativo'?'Módulo habilitado':status==='aprovado'?'Solicitação aprovada — aguardando ativação':status}</strong></p>}
  {erro&&<p role="alert" style={{color:'#b42318'}}>{erro}</p>}
  {!carregando&&status==='em_analise'&&!editar&&<><p>Seu pedido está registrado. Nossa equipe analisará os dados e informará as próximas etapas de credenciamento e configuração. Não há emissão fiscal ativa ainda.</p><button type="button" onClick={()=>setEditar(true)}>Corrigir dados enviados</button></>}
  {!carregando&&mostrarFormulario&&<form onSubmit={solicitar} style={{display:'grid',gap:12,maxWidth:650}}>
   <label>País da empresa <select value={pais} onChange={e=>{setPais(e.target.value);setCadastro({})}}><option value="BR">Brasil</option><option value="PY">Paraguay</option></select></label>
   {campos[pais].map(([campo,label])=><label key={campo} style={{display:'grid',gap:4}}>{label}<input value={cadastro[campo]||''} maxLength={campo==='endereco'||campo==='direccion'?300:180} onChange={e=>setCadastro(v=>({...v,[campo]:e.target.value}))} required={['razaoSocial','cnpj','razonSocial','ruc'].includes(campo)}/></label>)}
   {[['responsavel','Responsável pelo cadastro'],['telefone','Telefone de contato'],['email','E-mail para contato']].map(([campo,label])=><label key={campo} style={{display:'grid',gap:4}}>{label}<input value={cadastro[campo]||''} onChange={e=>setCadastro(v=>({...v,[campo]:e.target.value}))} type={campo==='email'?'email':'text'}/></label>)}
   <p style={{fontSize:13}}>Esta solicitação não confirma contratação, não cobra valores e não habilita emissão de notas. Credenciais e certificados serão configurados posteriormente em ambiente seguro; não os informe neste formulário.</p>
   <button type="submit" disabled={enviando}>{enviando?'Enviando…':editar?'Atualizar solicitação':'Solicitar módulo fiscal'}</button>
  </form>}
 </section>
}
