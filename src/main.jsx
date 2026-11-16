import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
const CommerceVitrinePreview = React.lazy(() => import('./components/CommerceVitrinePreview.jsx'))
import './index.css'
import {checkBuildAtBootstrap,installRecoveryPrompt} from './core/clientBuildRecovery.js'

installRecoveryPrompt()

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

const renderApp = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EnvironmentBanner />
    <React.Suspense fallback={<div role="status" style={{minHeight:"100vh",background:"#020617",color:"#cbd5e1",display:"grid",placeItems:"center"}}>ZenOS…</div>}>
    {previewMatch ? <CommerceVitrinePreview lojaIdRota={previewLojaId} /> : <App />}
    </React.Suspense>
  </React.StrictMode>,
)

// Starts without top-level await; Vite 5 still targets browsers that do not
// support it. A scheduled reload never mounts an obsolete app instance.
void checkBuildAtBootstrap().then(reloading => {
  if (!reloading) renderApp()
}).catch(error => {
  console.warn('[ZenOS Build] Verificação local indisponível; carregando sem apagar dados',error)
  renderApp()
})
