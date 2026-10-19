import React,{useEffect,useState} from 'react';
import {GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut} from 'firebase/auth';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from '../firebase';

const hml=(action,extra={})=>httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commerceHmlOperationalSeed',{timeout:30000})({action,...extra});
// Interface apenas do build especial de HOMOLOGAÇÃO, nunca integrada à versão do lojista.
export default function ZenCommerceOperationalHmlGate({children}){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [erro,setErro]=useState(''),[pinA,setPinA]=useState(''),[pinB,setPinB]=useState('');
 useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setReady(false);setLoading(Boolean(u));setErro('');
  if(!u)return;
  hml('consultar').then(r=>setReady(r.data?.preparada===true))
   .catch(e=>setErro(e.message||'Não foi possível validar o ambiente isolado.'))
   .finally(()=>setLoading(false));
 }),[]);
 if(loading)return <main role="status" style={{padding:30}}>Validando ambiente operacional fictício…</main>;
 if(ready)return children;
 const entrar=async()=>{setErro('');try{const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,p);}
  catch(e){setErro(e.message||'Autenticação de homologação indisponível.');}};
 const preparar=async e=>{e.preventDefault();if(busy)return;setBusy(true);setErro('');
  try{const r=await hml('preparar',{pinAdmin:pinA,pinSegundo:pinB});
   if(r.data?.preparada!==true||r.data.lojaId!==user.uid)throw new Error('Criação fictícia não confirmada.');
   setPinA('');setPinB('');setReady(true);}
  catch(e){setErro(e.message||'Não foi possível preparar o teste. Nada foi alterado na produção.');}
  finally{setBusy(false);}
 };
 return <main style={{minHeight:'100vh',background:'#09131d',color:'#e2e8f0',padding:'70px 20px 30px'}}>
  <section style={{maxWidth:500,margin:'auto',padding:24,border:'1px solid #334155',borderRadius:18,display:'grid',gap:16}}>
   <h1 style={{fontSize:22,margin:0}}>ZenOS — homologação operacional interna</h1>
   <p style={{margin:0,color:'#94a3b8'}}>Acesso restrito. Somente produtos, clientes e caixas fictícios; nenhuma loja real será conectada.</p>
   {!user?<button onClick={entrar} type="button">Entrar com a conta autorizada de testes</button>:
    <form onSubmit={preparar} style={{display:'grid',gap:12}}>
     <p style={{margin:0}}>Conta de testes autenticada. Informe dois PINs distintos para gerar a loja fictícia e seus operadores.</p>
     <label>PIN operador teste A<input type="password" inputMode="numeric" autoComplete="off" minLength={8} maxLength={12}
      value={pinA} onChange={e=>setPinA(e.target.value)} required style={{display:'block',width:'100%',padding:10,boxSizing:'border-box'}} /></label>
     <label>PIN operador teste B<input type="password" inputMode="numeric" autoComplete="off" minLength={8} maxLength={12}
      value={pinB} onChange={e=>setPinB(e.target.value)} required style={{display:'block',width:'100%',padding:10,boxSizing:'border-box'}} /></label>
     <small style={{color:'#94a3b8'}}>Use de 8 a 12 dígitos. Os PINs não serão copiados para logs ou armazenamento do navegador.</small>
     <button type="submit" disabled={busy}>{busy?'Criando apenas dados fictícios…':'Preparar loja e PDV fictícios'}</button>
     <button type="button" disabled={busy} onClick={()=>void signOut(auth)}>Trocar conta</button>
    </form>}
   {erro&&<p role="alert" style={{color:'#fb7185'}}>{erro}</p>}
  </section>
 </main>;
}
