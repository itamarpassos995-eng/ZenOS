import React,{useEffect,useRef,useState} from 'react';
import '../commercePremiumUX.css';
import {ZENOS_RUNTIME} from '../core/runtimeEnvironment';
import {conferirRespostaHml} from '../core/commerceHmlTenantBoundary';
import {callableCommerceZenOS,estadoSessaoCommerceZenOS,observarSessaoCommerceZenOS} from '../core/commerceZenOSSession';

// Montado no shell do ZenOS: continua ativo ao navegar entre módulos.
// Não usa notificações do navegador, WhatsApp ou serviços externos.
export default function ZenCommerceOrderNotice({userId,operadorId,onAbrir}){
 const [revision,setRevision]=useState(0),[total,setTotal]=useState(null),[erro,setErro]=useState(false),[tentativa,setTentativa]=useState(0);
 const [aberto,setAberto]=useState(false),[fila,setFila]=useState([]),[filaErro,setFilaErro]=useState(''),[filaBusy,setFilaBusy]=useState(false);
 const consultaFila=useRef(0);
 useEffect(()=>{consultaFila.current++;setAberto(false);setFila([]);setFilaErro('');setFilaBusy(false);},[userId,operadorId,revision]);
 useEffect(()=>observarSessaoCommerceZenOS(()=>setRevision(n=>n+1)),[]);
 const pronto=estadoSessaoCommerceZenOS().pronto;
 useEffect(()=>{
  let ativo=true,emCurso=false;setTotal(null);setErro(false);
  if(!userId||!operadorId||!pronto)return()=>{ativo=false;};
  const consultar=async()=>{
   if(emCurso||document.visibilityState==='hidden')return;
   emCurso=true;
   try{const r=(await callableCommerceZenOS('commercePedidosAdmin')({action:'resumoPedidos'})).data;
    if(ZENOS_RUNTIME.isCloudCommerceHml)conferirRespostaHml(r,userId);
    if(!Number.isSafeInteger(r.novos)||r.novos<0)throw Error('Contagem inválida.');
    if(ativo){setTotal(r.novos);setErro(false);}
   }catch{if(ativo)setErro(true);}finally{emCurso=false;}
  };
  void consultar();const timer=setInterval(consultar,90000);document.addEventListener('visibilitychange',consultar);
  return()=>{ativo=false;clearInterval(timer);document.removeEventListener('visibilitychange',consultar);};
 },[userId,operadorId,revision,pronto,tentativa]);
 const abrirPrevia=async()=>{
  if(aberto){consultaFila.current++;setAberto(false);return;}
  const versao=++consultaFila.current;
  setAberto(true);setFilaBusy(true);setFilaErro('');
  try{
   const r=(await callableCommerceZenOS('commercePedidosAdmin')({action:'listarPedidos'})).data;
   if(ZENOS_RUNTIME.isCloudCommerceHml)conferirRespostaHml(r,userId);
   if(versao!==consultaFila.current)return;
   setFila((Array.isArray(r.pedidos)?r.pedidos:[]).filter(p=>['recebido','em_atendimento'].includes(p.status)).slice(0,5));
  }catch{
   if(versao===consultaFila.current)setFilaErro('Não foi possível consultar a fila agora. Abra a central para conferir.');
  }finally{if(versao===consultaFila.current)setFilaBusy(false);}
 };
 if(!pronto)return null;
 return <aside aria-label="Pedidos da Loja Online" className="zen-online-notice">
  <div className="zen-online-notice-content">
   <span className="zen-online-notice-symbol" aria-hidden="true">▣</span>
   <div>
    <strong role="status">{erro?'Atualização dos pedidos indisponível':total===null?'Consultando pedidos online…':total>0?<><span className="zen-online-count">{total}</span> {total===1?'novo pedido online':'novos pedidos online'}</>:'Pedidos online em dia'}</strong>
    <small>{erro?'A fila pode ser aberta para conferência.':'Acompanhe e atenda direto no ZenOS, sem sair do sistema.'}</small>
   </div>
  </div>
  <div className="zen-online-notice-actions">
   <button type="button" onClick={abrirPrevia} aria-expanded={aberto} aria-controls="zen-online-notice-popover">▤ Ver notificações</button>
   <button type="button" onClick={onAbrir}>Ver pedidos →</button>
   {erro&&<button type="button" onClick={()=>setTentativa(n=>n+1)}>Tentar atualizar</button>}
  </div>
  {aberto&&<div id="zen-online-notice-popover" className="zen-online-notice-popover" role="region" aria-label="Últimos pedidos que exigem atenção">
   <div className="zen-online-notice-popover-head"><strong>Pedidos aguardando atenção</strong><button type="button" aria-label="Fechar notificações de pedidos" onClick={()=>{consultaFila.current++;setAberto(false);}}>×</button></div>
   {filaBusy?<p role="status">Consultando fila…</p>:filaErro?<p role="alert">{filaErro}</p>:fila.length===0?<p>Nenhum pedido ativo entre os últimos registros carregados.</p>:
    <div className="zen-online-notice-mini-list">{fila.map(p=><div key={p.id} className="zen-online-notice-mini">
     <span><strong>#{String(p.id||'').slice(0,10).toUpperCase()}</strong><small>{p?.cliente?.nome||'Cliente não informado'}</small></span><span>{p.status==='recebido'?'Novo':'Em atendimento'}</span>
    </div>)}</div>}
   <button type="button" className="zen-online-notice-all" onClick={()=>{consultaFila.current++;setAberto(false);onAbrir();}}>Ver fila completa de pedidos →</button>
  </div>}
 </aside>;
}
