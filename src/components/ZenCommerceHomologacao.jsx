import React,{useEffect,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {obterSessaoOperadorCommerce,entrarOperadorCommerce} from '../core/commerceOperatorAuth';
import ZenCommercePortal from './ZenCommercePortal';
export default function ZenCommerceHomologacao(){
 const [auth]=useState(()=>{try{return obterSessaoOperadorCommerce();}catch{return null;}}),[uid,setUid]=useState(null),[loja,setLoja]=useState(null),[erro,setErro]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0),[produtoFoco,setProdutoFoco]=useState('');
 useEffect(()=>auth?onAuthStateChanged(auth,user=>setUid(user?.uid||null)):undefined,[auth]);
 useEffect(()=>{let active=true;setLoja(null);setErro('');if(uid)httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commercePedidosAdmin')({action:'consultarLoja'}).then(r=>{if(active)setLoja(r.data);}).catch(e=>{if(active)setErro(e.message||'Acesso não autorizado.');});return()=>{active=false;};},[uid,auth,reload]);
 return <main className="commerce-admin-shell"><div>
  <div className="commerce-admin-heading"><div><h1>Commerce Studio</h1><p>Sua identidade, seus produtos e seus pedidos em um só lugar.</p></div></div><div className="commerce-admin-notice">HOMOLOGAÇÃO · Use somente lojas e produtos fictícios. Sem cobrança ou movimentação financeira.</div>
  {!auth&&<p>Configure o projeto Firebase de homologação para abrir este ambiente.</p>}
  {auth&&!uid&&<button onClick={async()=>{try{await entrarOperadorCommerce();}catch(e){setErro(e.message);}}}>Entrar com conta individual autorizada</button>}
  {erro&&<div role="alert"><p>{erro}</p>{uid&&<button disabled={loading} onClick={async()=>{setLoading(true);try{await httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commerceHmlBootstrap')({});setReload(x=>x+1);}catch(e){setErro(e.message||'Não foi possível preparar a loja fictícia.');}finally{setLoading(false);}}}>{loading?'Preparando...':'Preparar minha loja fictícia de teste'}</button>}</div>}
  {uid&&!loja&&!erro&&<p>Carregando loja autorizada...</p>}
  {loja&&<><nav aria-label="Editor Commerce" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}><button type="button" onClick={()=>setProdutoFoco('')} aria-pressed={!produtoFoco}>Layout e catálogo</button>{loja.produtos.slice(0,20).map(p=><button type="button" key={p.id} aria-pressed={produtoFoco===String(p.id)} onClick={()=>setProdutoFoco(String(p.id))}>Loja Online: {String(p.nome).slice(0,28)}</button>)}</nav><ZenCommercePortal key={produtoFoco||'layout'} produtos={loja.produtos} produtoFocoId={produtoFoco||null} userId={loja.lojaId} operadorAtivo={{id:uid}} nuvemSincronizada={true}/></>}
 </div></main>;
}
