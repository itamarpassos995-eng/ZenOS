import React,{useEffect,useState} from 'react';
import {auth} from '../firebase';
import {getFunctions,httpsCallable} from 'firebase/functions';

// Apenas contas que receberam custom claim assinado pelo Firebase podem acessar.
export default function FiscalAdministracaoPainel({tx=pt=>pt}){
 const [admin,setAdmin]=useState(false),[solicitacoes,setSolicitacoes]=useState([]),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[limitado,setLimitado]=useState(false);
 const [demanda,setDemanda]=useState(null);
 const api=(action,extra={})=>httpsCallable(getFunctions(undefined,'southamerica-east1'),'fiscalAdministracao')({action,...extra});
 const atualizar=async()=>{
   setOcupado(true);setErro('');
   try{const r=await api('listar');setSolicitacoes(r.data?.solicitacoes||[]);setLimitado(Boolean(r.data?.limitado));setDemanda(r.data?.demanda||null)}
   catch(e){setErro(e?.message||tx("Não foi possível consultar as solicitações.","No se pudieron consultar las solicitudes."))}
   finally{setOcupado(false)}
 };
 useEffect(()=>{let ativo=true;auth.currentUser?.getIdTokenResult().then(r=>{if(ativo&&r.claims?.zenosFiscalAdmin===true)setAdmin(true)}).catch(()=>{});return()=>{ativo=false}},[]);
 useEffect(()=>{if(admin)atualizar()},[admin]);
 const analisar=async(lojaId,decisao)=>{
   setOcupado(true);setErro('');
   try{await api('analisar',{lojaId,decisao});await atualizar()}
   catch(e){setErro(e?.message||tx("A análise não pôde ser registrada.","No se pudo registrar la revisión."))}finally{setOcupado(false)}
 };
 if(!admin)return null;
 return <section style={{margin:'24px 0',padding:20,border:'1px solid #d3dbe7',borderRadius:14}}>
  <h2>{tx("Administração ZenOS Fiscal","Administración ZenOS Fiscal")}</h2>
  <p>{tx("Solicitações e configurações de lojistas. As etapas de integração e credenciamento são verificadas separadamente; salvar ou revisar o cadastro","Solicitudes y configuraciones de las tiendas. Las etapas de integración y habilitación se verifican por separado; guardar o revisar el registro")} <strong>{tx("não habilita emissão","no habilita la emisión")}</strong>.</p>
  <button onClick={atualizar} disabled={ocupado}>{tx("Atualizar solicitações","Actualizar solicitudes")}</button>
  {demanda&&<div role="status"><h3>{tx("Demanda fiscal — últimos 30 dias","Demanda fiscal — últimos 30 días")}</h3><p>{demanda.solicitacoes} {tx("lojas solicitaram ·","tiendas solicitaron ·")} {demanda.brasil} {tx("Brasil ·","Brasil ·")} {demanda.paraguai} {tx("Paraguai ·","Paraguay ·")} {demanda.cadastrosCompletos} {tx("cadastros completos","registros completos")}</p><p>NFC-e: {demanda.solicitantesPorDocumento.nfce} · NF-e: {demanda.solicitantesPorDocumento.nfe} · NFS-e: {demanda.solicitantesPorDocumento.nfse}</p><p>{tx("Volume de emissões ainda não medido. Interesse não representa contratação ou notas emitidas.","Volumen de emisiones aún no medido. El interés no representa contratación ni documentos emitidos.")}{limitado?tx(" Os números são parciais nesta janela de registros."," Las cifras son parciales en este intervalo de registros."):''}</p></div>}
  {limitado&&<p>{tx("Exibindo apenas a primeira janela de registros. Paginação administrativa pendente.","Se muestra solamente la primera ventana de registros. La paginación administrativa está pendiente.")}</p>}
  {erro&&<p role="alert" style={{color:'#b42318'}}>{erro}</p>}
  {solicitacoes.length===0&&!ocupado&&<p>{tx("Nenhuma solicitação encontrada.","No se encontró ninguna solicitud.")}</p>}
  {solicitacoes.map(s=><article key={s.lojaId} style={{padding:'12px 0',borderBottom:'1px solid #d3dbe7'}}>
   <strong>{s.razaoSocial||s.lojaId}</strong> — {s.pais} — {s.status}
   <div style={{fontSize:13}}>{s.email||s.telefone||tx("Sem contato","Sin contacto")} {tx("· Loja","· Tienda")} {s.lojaId}</div>
   {s.status==='configuracao_pendente'&&<p>{tx("Configuração guiada pelo cliente. A emissão permanece desabilitada enquanto existirem requisitos pendentes.","Configuración guiada por el cliente. La emisión permanece deshabilitada mientras existan requisitos pendientes.")}</p>}
   {s.status==='em_analise'&&<div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
    <button disabled={ocupado} onClick={()=>analisar(s.lojaId,'aguardando_credenciamento')}>{tx("Cadastro analisado — continuar habilitação","Registro revisado — continuar habilitación")}</button>
    <button disabled={ocupado} onClick={()=>analisar(s.lojaId,'rejeitado')}>{tx("Devolver para correção","Devolver para corregir")}</button>
   </div>}
  </article>)}
 </section>;
}
