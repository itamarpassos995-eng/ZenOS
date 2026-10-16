import React from 'react'
import ReactDOM from 'react-dom/client'
const App=React.lazy(()=>import('./App.jsx'));
import ZenCommerceStorefront from './components/ZenCommerceStorefront.jsx'
import ZenCommerceHomologacao from './components/ZenCommerceHomologacao.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import './index.css'
import './commerce.css'
const commercePublico=/^\/loja\/zc-[a-z2-9]{14}\/?$/.test(window.location.pathname);
const commerceHml=window.location.pathname==='/commerce-homologacao'||Boolean(import.meta.env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG);
if(commercePublico||commerceHml)document.documentElement.classList.add('commerce-document');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {!commercePublico&&!commerceHml&&<EnvironmentBanner />}
    <React.Suspense fallback={<p>Carregando ZenOS...</p>}>
    {commercePublico
      ? <ZenCommerceStorefront idPublico={window.location.pathname.split('/')[2]} />
      : commerceHml?<ZenCommerceHomologacao/>:<App />}
    </React.Suspense>
  </React.StrictMode>,
)
