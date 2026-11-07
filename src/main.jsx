import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
const CommerceVitrinePreview = React.lazy(() => import('./components/CommerceVitrinePreview.jsx'))
import './index.css'
import { startAutoUpdate } from './core/autoUpdate.js'

// Somente consulta a versão Vercel; o App autoriza reload quando totalmente seguro.
startAutoUpdate(__ZENOS_BUILD_ID__)

// Rota independente e somente leitura. Não inicializa o fluxo de vendas do App.
const previewMatch = window.location.pathname.match(/^\/loja\/([^/]+)\/?$/)
let previewLojaId = null
if (previewMatch) {
  try {
    previewLojaId = decodeURIComponent(previewMatch[1])
  } catch {
    previewLojaId = ''
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EnvironmentBanner />
    <React.Suspense fallback={<div role="status" style={{minHeight:"100vh",background:"#020617",color:"#cbd5e1",display:"grid",placeItems:"center"}}>ZenOS…</div>}>
    {previewMatch ? <CommerceVitrinePreview lojaIdRota={previewLojaId} /> : <App />}
    </React.Suspense>
  </React.StrictMode>,
)
