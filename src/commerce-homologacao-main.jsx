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
  const slug=new URLSearchParams(window.location.search).get('slug') ||
    window.location.pathname.match(/^\/vitrine\/([a-zA-Z0-9-]+)\/?$/)?.[1] || '';
  useEffect(()=>{
    document.documentElement.classList.add('commerce-document');
    return ()=>document.documentElement.classList.remove('commerce-document');
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setState({status:'carregando'});
    carregarCatalogoPublico(slug,{signal:controller.signal}).then(data=>{
      if(!controller.signal.aborted)setState({status:'pronto',data});
    }).catch(err=>{
      if(!controller.signal.aborted)setState({
        status:err?.message==='loja-nao-publicada'?'nao-publicada':'indisponivel'
      });
    });
    return ()=>controller.abort();
  },[slug,attempt]);
  if(state.status==='pronto'){
    const {data}=state;
    return <main className="commerce-public-view" data-commerce-cdn-homologacao="true">
      <ZenCommerceStorefront idPublico={data.idPublico} configCommerce={data.configCommerce}
        produtos={data.produtos} isLivePreview={import.meta.env.VITE_ZENOS_CDN_WHATSAPP_CHECKOUT !== 'true'}
        checkoutViaWhatsApp={import.meta.env.VITE_ZENOS_CDN_WHATSAPP_CHECKOUT === 'true'}/>
    </main>;
  }
  return <main className="commerce-public-loading"><div className="commerce-loading-card" role="status">
    <h1>{state.status==='carregando'?'Carregando catálogo…':
      state.status==='nao-publicada'?'Catálogo ainda não publicado':'Prévia temporariamente indisponível'}</h1>
    <p>Catálogo em homologação. A loja online só aparece depois de publicada pelo proprietário.</p>
    {state.status!=='carregando'&&<button type="button" className="btn-refresh-public"
      onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</button>}
  </div></main>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><CommerceCdnHomologacao/></React.StrictMode>);
