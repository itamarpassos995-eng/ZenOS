import React,{useEffect,useState} from 'react';
import {auth} from '../firebase';
import {getFunctions,httpsCallable} from 'firebase/functions';

// Apenas contas que receberam custom claim assinado pelo Firebase podem acessar.
export default function FiscalAdministracaoPainel(){
 const [admin,setAdmin]=useState(false),[solicitacoes,setSolicitacoes]=useState([]),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[limitado,setLimitado]=useState(false);
 const api=(action,extra={})=>httpsCallable(getFunctions(undefined,'southamerica-east1'),'fiscalAdministracao')({action,...extra});
 const atualizar=async()=>{
   setOcupado(true);setErro('');
   try{const r=await api('listar');setSolicitacoes(r.data?.solicitacoes||[]);setLimitado(Boolean(r.data?.limitado))}
   catch(e){setErro(e?.message||'Não foi possível consultar as solicitações.')}
   finally{setOcupado(false)}
 };
 useEffect(()=>{let ativo=true;auth.currentUser?.getIdTokenResult().then(r=>{if(ativo&&r.claims?.zenosFiscalAdmin===true)setAdmin(true)}).catch(()=>{});return()=>{ativo=false}},[]);
 useEffect(()=>{if(admin)atualizar()},[admin]);
 const analisar=async(lojaId,decisao)=>{
   setOcupado(true);setErro('');
   try{await api('analisar',{lojaId,decisao});await atualizar()}
   catch(e){setErro(e?.message||'A análise não pôde ser registrada.')}finally{setOcupado(false)}
 };
 if(!admin)return null;
 return <section style={{margin:'24px 0',padding:20,border:'1px solid #d3dbe7',borderRadius:14}}>
  <h2>Administração ZenOS Fiscal</h2>
  <p>Solicitações de lojistas. Aprovar o cadastro <strong>não habilita emissão</strong>: credenciamento, cobrança e homologação continuam obrigatórios.</p>
  <button onClick={atualizar} disabled={ocupado}>Atualizar solicitações</button>
  {limitado&&<p>Exibindo apenas a primeira janela de registros. Paginação administrativa pendente.</p>}
  {erro&&<p role="alert" style={{color:'#b42318'}}>{erro}</p>}
  {solicitacoes.length===0&&!ocupado&&<p>Nenhuma solicitação encontrada.</p>}
  {solicitacoes.map(s=><article key={s.lojaId} style={{padding:'12px 0',borderBottom:'1px solid #d3dbe7'}}>
   <strong>{s.razaoSocial||s.lojaId}</strong> — {s.pais} — {s.status}
   <div style={{fontSize:13}}>{s.email||s.telefone||'Sem contato'} · Loja {s.lojaId}</div>
   {s.status==='em_analise'&&<div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
    <button disabled={ocupado} onClick={()=>analisar(s.lojaId,'aguardando_credenciamento')}>Cadastro analisado — continuar habilitação</button>
    <button disabled={ocupado} onClick={()=>analisar(s.lojaId,'rejeitado')}>Devolver para correção</button>
   </div>}
  </article>)}
 </section>;
}
