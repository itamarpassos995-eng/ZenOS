import React,{useEffect,useState} from 'react';
import '../commercePremiumUX.css';
import {ZENOS_RUNTIME} from '../core/runtimeEnvironment';
import {conferirRespostaHml} from '../core/commerceHmlTenantBoundary';
import {callableCommerceZenOS,estadoSessaoCommerceZenOS,observarSessaoCommerceZenOS} from '../core/commerceZenOSSession';

// Montado no shell do ZenOS: continua ativo ao navegar entre módulos.
// Não usa notificações do navegador, WhatsApp ou serviços externos.
export default function ZenCommerceOrderNotice({userId,operadorId,onAbrir}){
 const [revision,setRevision]=useState(0),[total,setTotal]=useState(null),[erro,setErro]=useState(false),[tentativa,setTentativa]=useState(0);
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
   <button type="button" onClick={onAbrir}>Ver pedidos →</button>
   {erro&&<button type="button" onClick={()=>setTentativa(n=>n+1)}>Tentar atualizar</button>}
  </div>
 </aside>;
}
