import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import CommerceVitrinePreview from './components/CommerceVitrinePreview.jsx'
import './index.css'

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
    {previewMatch ? <CommerceVitrinePreview lojaIdRota={previewLojaId} /> : <App />}
  </React.StrictMode>,
)
