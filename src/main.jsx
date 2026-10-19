import React from 'react'
import ReactDOM from 'react-dom/client'
const App=React.lazy(()=>import('./App.jsx'));
import ZenCommerceStorefront from './components/ZenCommerceStorefront.jsx'
import ZenCommerceHomologacao from './components/ZenCommerceHomologacao.jsx'
// Nunca importar o Firebase operacional durante vitrine pública ou Studio HML.
const ZenCommerceOperationalHmlGate=React.lazy(()=>import('./components/ZenCommerceOperationalHmlGate.jsx'))
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import './index.css'
import './commerce.css'
const commercePublico=/^\/loja\/zc-[a-z2-9]{14}\/?$/.test(window.location.pathname);
// Defesa em profundidade: um artefato HML nunca pode montar <App /> mesmo
// que a configuração pública falte ou seja removida após o build.
const buildCommerceIsolado=import.meta.env.MODE==='commerce-hml';
const commerceSdkConfigurado=Boolean(import.meta.env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG);
const commerceOperationalHml=import.meta.env.MODE==='commerce-operational-hml';
const commerceHml=!commerceOperationalHml&&(buildCommerceIsolado||window.location.pathname==='/commerce-homologacao'||commerceSdkConfigurado);
const commerceBuildIncompleto=(buildCommerceIsolado||commerceOperationalHml)&&!commerceSdkConfigurado;
if(commercePublico||commerceHml)document.documentElement.classList.add('commerce-document');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {!commercePublico&&!commerceHml&&<EnvironmentBanner />}
    <React.Suspense fallback={<p>Carregando ZenOS...</p>}>
    {commerceBuildIncompleto
      ? <main role="alert" style={{padding:32,maxWidth:720,margin:'auto'}}>Homologação Commerce indisponível: configuração isolada ausente. Nenhum dado operacional foi acessado.</main>
      : commercePublico
      ? <ZenCommerceStorefront idPublico={window.location.pathname.split('/')[2]} />
      : commerceHml?<ZenCommerceHomologacao/>:commerceOperationalHml?<ZenCommerceOperationalHmlGate><App /></ZenCommerceOperationalHmlGate>:<App />}
    </React.Suspense>
  </React.StrictMode>,
)
