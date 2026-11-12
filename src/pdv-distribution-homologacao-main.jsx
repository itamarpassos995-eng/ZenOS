// Test host only: renders the existing PDV, with its actual persistence writer.
// This file is excluded from the production build. No replacement checkout exists.
import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {auth,db,ZENOS_RUNTIME} from './firebase.js';
import {onAuthStateChanged,signInWithEmailAndPassword} from 'firebase/auth';
import {getOperationalSnapshot} from './core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from './core/productionSync.js';
import {traducoes} from './data.js';
import PDV from './components/PDV.jsx';
import {createDistributionClient} from './core/distribution/client.js';
import {validateStagingPreorderDraft,stagingPreorderErrorMessage} from './core/distribution/stagingPreorderValidation.js';
import './components/DistributionCentral.css';
function Host(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>onAuthStateChanged(auth,async user=>{if(!user)return setError('Entre primeiro na Central de Distribuição sintética.');try{setData((await getOperationalSnapshot(db,user.uid)).data());}catch(e){setError(e.message);}}),[]);
 if(error)return <p style={{color:'white'}}>{error}</p>;if(!data)return <p style={{color:'white'}}>Conferindo V2…</p>;
 const setter=field=>value=>setData(d=>({...d,[field]:typeof value==='function'?value(d[field]):value}));
 const commit=async request=>{const result=await persistV1BusinessOperationSafe({db,userId:auth.currentUser.uid,...request,changes:(request.changes||[]).map(c=>({...c,baseValue:data[c.field]}))});if(result.cloudOk)setData(d=>({...d,...result.values}));return result;};
 const rates={BRL:1,PYG:1333,USD:.2,EUR:.17};
 return <main style={{padding:24,fontFamily:'system-ui'}}><h1 style={{color:'#5eead4',fontSize:18}}>Homologação · PDV existente / V2 real</h1><PDV userId={auth.currentUser.uid} operadorAtivo={data.vendedores.find(v=>v.id==='admin')} vendedores={data.vendedores} produtos={data.produtos} setProdutos={setter('produtos')} clientes={data.clientes} setClientes={setter('clientes')} historicoVendas={data.historicoVendas} setHistoricoVendas={setter('historicoVendas')} vouchers={data.vouchers} setVouchers={setter('vouchers')} sessaoAtiva={data.sessoesCaixa.find(s=>s.id==='CASH1')} moeda="PYG" taxasCambio={rates} converterDeBRL={(v,m)=>v*rates[m]} converterParaBRL={(v,m)=>v/rates[m]} fmt={v=>'PYG '+Math.round(v*1333).toLocaleString('es-PY')} t={key=>traducoes.pt[key]||key} tx={pt=>pt} idioma="pt" patenteUsuario="gerencia" perfilLoja={{nomeFantasia:'Homologação sintética',pais:'PY'}} regrasDesconto={{verdeMax:5,amareloMax:12,margemMinima:0,margemIdeal:30,exigirSenhaVermelho:false}} commitVendaCritica={commit} recarregarDadosPDV={async()=>setData((await getOperationalSnapshot(db,auth.currentUser.uid)).data())}/></main>;
}

function StagingHost(){
 const [account,setAccount]=useState(auth.currentUser),[data,setData]=useState(null);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[operator,setOperator]=useState('admin'),[pin,setPin]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const client=useMemo(()=>account?createDistributionClient(account):null,[account]);
 useEffect(()=>onAuthStateChanged(auth,user=>{setAccount(user);if(!user)setData(null);}),[]);
 async function login(event){
  event.preventDefault();setBusy(true);setError('');
  try{
   if(!account){await signInWithEmailAndPassword(auth,email.trim(),password);setPassword('');return;}
   await client.login(operator,pin,'pdv');setPin('');
   const catalog=await client.stagingPreorder({type:'catalog'});
   setData({...catalog,orders:[]});
  }catch{setError('Não foi possível iniciar o PDV. Confira a conta, o operador e o perfil de homologação.');}
  finally{setBusy(false);}
 }
 async function commit(request){
  // Pure, staging-only preflight: never tries to write or bypass the server.
  const preflight=validateStagingPreorderDraft(request,data);
  if(!preflight.ok){
   setError(preflight.message);
   return {cloudOk:false,error:{code:preflight.code,message:preflight.message}};
  }
  try{
   setError('');
   const {sale}=await client.stagingPreorder(preflight.payload);
   // Keep the synthetic local order list in step with the confirmed response.
   setData(current=>({...current,orders:[sale,...current.orders.filter(o=>o.id!==sale.id)]}));
   return {cloudOk:true,values:{historicoVendas:[sale,...data.orders.filter(o=>o.id!==sale.id)]}};
  }catch(error){
   const code=typeof error?.code==='string'&&/^[A-Z0-9_]{3,60}$/.test(error.code)?error.code:'REQUEST_FAILED';
   const message=stagingPreorderErrorMessage(code);
   setError(message);
   return {cloudOk:false,error:{code,message}};
  }
 }
 return <main className="dist" lang="pt-BR">
  <header className="dist-top"><img src="/logo-zenos.png?v=4" alt="ZenOS"/><a href="/distribution-homologacao.html">Central de Distribuição</a></header>
  <h1>PDV de homologação</h1><p>Pré-pedidos sintéticos em PYG. Para finalizar, selecione um <strong>cliente cadastrado</strong> da lista e um produto disponível. Não é permitido concluir como consumidor avulso ou registrar pagamento neste teste.</p>
  {error&&<div className="dist-alert" role="alert">{error}</div>}
  {!data?<form className="dist-card dist-login" onSubmit={login}>
   {!account?<><label>E-mail da empresa<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha da empresa<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label></>:
   <><label>Identificador do operador<input required value={operator} onChange={e=>setOperator(e.target.value)}/></label><label>PIN do operador<input required type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)}/></label></>}
   <button className="primary" disabled={busy}>Acessar PDV</button>
  </form>:<PDV preOrderOnly userId={account.uid} operadorAtivo={{id:data.actor.operatorId,nome:data.actor.name}} produtos={data.products} clientes={data.customers} historicoVendas={data.orders}
   setHistoricoVendas={orders=>setData(current=>({...current,orders}))} moeda="PYG" taxasCambio={data.rates}
   converterDeBRL={(v,m)=>v*data.rates[m]} converterParaBRL={(v,m)=>v/data.rates[m]} fmt={v=>'PYG '+Math.round(v*data.rates.PYG).toLocaleString('es-PY')}
   t={key=>traducoes.pt[key]||key} tx={pt=>pt} idioma="pt" perfilLoja={{nomeFantasia:'Homologação sintética',pais:'PY'}}
   regrasDesconto={{verdeMax:0,amareloMax:0,margemMinima:0,margemIdeal:0,exigirSenhaVermelho:false}}
   commitVendaCritica={commit}/>}
 </main>;
}
if(ZENOS_RUNTIME.isHomologacao||ZENOS_RUNTIME.isStaging)createRoot(document.getElementById('root')).render(ZENOS_RUNTIME.isStaging?<StagingHost/>:<Host/>);
