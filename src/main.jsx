import React from 'react'
import ReactDOM from 'react-dom/client'
const App=React.lazy(()=>import('./App.jsx'));
import ZenCommerceStorefront from './components/ZenCommerceStorefront.jsx'
import ZenCommerceHomologacao from './components/ZenCommerceHomologacao.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.location.pathname!=='/commerce-homologacao'&&<EnvironmentBanner />}
    <React.Suspense fallback={<p>Carregando ZenOS...</p>}>
    {/^\/loja\/zc-[a-z2-9]{14}\/?$/.test(window.location.pathname)
      ? <ZenCommerceStorefront idPublico={window.location.pathname.split('/')[2]} />
      : (window.location.pathname==='/commerce-homologacao'||import.meta.env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG)?<ZenCommerceHomologacao/>:<App />}
    </React.Suspense>
  </React.StrictMode>,
)
