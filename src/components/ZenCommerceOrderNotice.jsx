import React,{useEffect,useState} from 'react';
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
    if(!Number.isSafeInteger(r.novos)||r.novos<0)throw Error('Contagem inválida.');
    if(ativo){setTotal(r.novos);setErro(false);}
   }catch{if(ativo)setErro(true);}finally{emCurso=false;}
  };
  void consultar();const timer=setInterval(consultar,90000);document.addEventListener('visibilitychange',consultar);
  return()=>{ativo=false;clearInterval(timer);document.removeEventListener('visibilitychange',consultar);};
 },[userId,operadorId,revision,pronto,tentativa]);
 if(!pronto)return null;
 return <aside aria-label="Pedidos da Loja Online" style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',padding:'10px 14px',marginBottom:14,border:'1px solid #51644b',borderRadius:12,background:'#12251f',color:'#e3f4e7'}}>
  <span role="status">{erro?'Não foi possível atualizar os pedidos online.':total===null?'Consultando pedidos online…':total?`${total} novo(s) pedido(s) online`:'Nenhum novo pedido online'}</span>
  <button type="button" onClick={onAbrir} style={{padding:'8px 12px',borderRadius:8,cursor:'pointer'}}>Abrir pedidos</button>
  {erro&&<button type="button" onClick={()=>setTentativa(n=>n+1)}>Tentar atualizar</button>}
 </aside>;
}
