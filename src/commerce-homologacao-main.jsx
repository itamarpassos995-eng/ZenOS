import React,{useEffect,useState} from 'react';
import ReactDOM from 'react-dom/client';
import ZenCommerceStorefront from './components/ZenCommerceStorefront';
import {carregarCatalogoPublico} from './core/commerceCdnClient';
import './index.css';
import './commerce.css';
import './components/CommerceVitrinePreview.css';

// Entrada HTML isolada: NÃO importa App, Firebase, Auth, listeners ou PDV.
function CommerceCdnHomologacao(){
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState({status:'carregando'});
  // O endereço oficial é /loja/<apelido>. O lojista configura o apelido no ZenOS.
  const slug=window.location.pathname.match(/^\/(?:loja|vitrine)\/([^/]+)\/?$/)?.[1]
    || new URLSearchParams(window.location.search).get('slug') || '';
  useEffect(()=>{
    document.documentElement.classList.add('commerce-document');
    return ()=>document.documentElement.classList.remove('commerce-document');
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setState({status:'carregando'});
    carregarCatalogoPublico(slug,{signal:controller.signal}).then(data=>{
      if(!controller.signal.aborted)setState({status:'pronto',data});
    }).catch(async(err)=>{
      if(controller.signal.aborted)return;
      if(err?.message==='loja-nao-publicada' && window.location.pathname.startsWith('/loja/')){
        // Lojas existentes ainda não migradas conservam a experiência antiga.
        // Firebase somente entra aqui, em um import assíncrono; lojas na CDN
        // jamais o carregam e não fazem leituras Firestore por visita.
        try {
          const old=await import('./components/CommerceVitrinePreview');
          if(!controller.signal.aborted)setState({status:'legada',Component:old.default});
        }catch{
          if(!controller.signal.aborted)setState({status:'indisponivel'});
        }
        return;
      }
      setState({status:err?.message==='loja-nao-publicada'?'nao-publicada':'indisponivel'});
    });
    return ()=>controller.abort();
  },[slug,attempt]);
  if(state.status==='legada'){
    const Legacy=state.Component;
    return <Legacy lojaIdRota={slug}/>;
  }
  if(state.status==='pronto'){
    const {data}=state;
    return <main className="commerce-public-view" data-commerce-cdn-homologacao="true">
      <ZenCommerceStorefront idPublico={data.idPublico} configCommerce={data.configCommerce}
        produtos={data.produtos} isLivePreview={import.meta.env.VITE_ZENOS_CDN_WHATSAPP_CHECKOUT !== 'true'}
        checkoutViaWhatsApp={import.meta.env.VITE_ZENOS_CDN_WHATSAPP_CHECKOUT === 'true' &&
          import.meta.env.VITE_ZENOS_PRIVATE_ORDERS_ENABLED !== 'true'}
        checkoutPrivado={import.meta.env.VITE_ZENOS_PRIVATE_ORDERS_ENABLED === 'true'}/>
    </main>;
  }
  return <main className="commerce-public-loading"><div className="commerce-loading-card" role="status">
    <h1>{state.status==='carregando'?'Carregando loja…':
      state.status==='nao-publicada'?'Loja ainda não publicada':'Loja temporariamente indisponível'}</h1>
    <p>Se você é o lojista, abra Minha Loja Online no ZenOS e escolha Publicar Loja Online.</p>
    {state.status!=='carregando'&&<button type="button" className="btn-refresh-public"
      onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</button>}
  </div></main>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><CommerceCdnHomologacao/></React.StrictMode>);
