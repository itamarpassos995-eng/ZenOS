// Test host only: renders the existing PDV, with its actual persistence writer.
// This file is excluded from the production build. No replacement checkout exists.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {auth,db,ZENOS_RUNTIME} from './firebase.js';
import {onAuthStateChanged} from 'firebase/auth';
import {getOperationalSnapshot} from './core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from './core/productionSync.js';
import {traducoes} from './data.js';
import PDV from './components/PDV.jsx';
function Host(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>onAuthStateChanged(auth,async user=>{if(!user)return setError('Entre primeiro na Central de Distribuição sintética.');try{setData((await getOperationalSnapshot(db,user.uid)).data());}catch(e){setError(e.message);}}),[]);
 if(error)return <p style={{color:'white'}}>{error}</p>;if(!data)return <p style={{color:'white'}}>Conferindo V2…</p>;
 const setter=field=>value=>setData(d=>({...d,[field]:typeof value==='function'?value(d[field]):value}));
 const commit=async request=>{const result=await persistV1BusinessOperationSafe({db,userId:auth.currentUser.uid,...request,changes:(request.changes||[]).map(c=>({...c,baseValue:data[c.field]}))});if(result.cloudOk)setData(d=>({...d,...result.values}));return result;};
 const rates={BRL:1,PYG:1333,USD:.2,EUR:.17};
 return <main style={{padding:24,fontFamily:'system-ui'}}><h1 style={{color:'#5eead4',fontSize:18}}>Homologação · PDV existente / V2 real</h1><PDV userId={auth.currentUser.uid} operadorAtivo={data.vendedores.find(v=>v.id==='admin')} vendedores={data.vendedores} produtos={data.produtos} setProdutos={setter('produtos')} clientes={data.clientes} setClientes={setter('clientes')} historicoVendas={data.historicoVendas} setHistoricoVendas={setter('historicoVendas')} vouchers={data.vouchers} setVouchers={setter('vouchers')} sessaoAtiva={data.sessoesCaixa.find(s=>s.id==='CASH1')} moeda="PYG" taxasCambio={rates} converterDeBRL={(v,m)=>v*rates[m]} converterParaBRL={(v,m)=>v/rates[m]} fmt={v=>'PYG '+Math.round(v*1333).toLocaleString('es-PY')} t={key=>traducoes.pt[key]||key} tx={pt=>pt} idioma="pt" patenteUsuario="gerencia" perfilLoja={{nomeFantasia:'Homologação sintética',pais:'PY'}} regrasDesconto={{verdeMax:5,amareloMax:12,margemMinima:0,margemIdeal:30,exigirSenhaVermelho:false}} commitVendaCritica={commit} recarregarDadosPDV={async()=>setData((await getOperationalSnapshot(db,auth.currentUser.uid)).data())}/></main>;
}
if(ZENOS_RUNTIME.isHomologacao)createRoot(document.getElementById('root')).render(<Host/>);
