import React from 'react'
import ReactDOM from 'react-dom/client'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import './index.css'
import {checkBuildAtBootstrap,installRecoveryPrompt} from './core/clientBuildRecovery.js'

installRecoveryPrompt()

// Render a minimal escape hatch BEFORE importing App or any Firebase module.
// A damaged persistent Chrome Auth/IndexedDB database can stall module startup;
// an uncaught chunk failure must never leave a permanent blank page.
const rootElement = document.getElementById('root')
const bootPanel = document.createElement('div')
bootPanel.setAttribute('role','status')
bootPanel.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:22px;background:#020617;color:#cbd5e1;font:14px system-ui,sans-serif;'
const bootContent = document.createElement('div')
bootContent.style.cssText = 'max-width:480px;width:100%;text-align:center;'
const bootTitle = document.createElement('div')
bootTitle.style.cssText = 'color:#e2e8f0;font-size:24px;font-weight:900;letter-spacing:1px;'
bootTitle.textContent = 'ZenOS'
const bootStatus = document.createElement('p')
bootStatus.textContent = 'A iniciar sistema…'
bootStatus.style.cssText = 'color:#94a3b8;margin:18px 0;'
const bootActions = document.createElement('div')
bootActions.style.display = 'none'
const recoveryText = document.createElement('p')
recoveryText.textContent = 'O carregamento deste navegador está demorando. É possível abrir uma sessão protegida sem apagar seus carrinhos, IndexedDB ou informações locais.'
recoveryText.style.cssText = 'line-height:1.6;color:#cbd5e1;'
const safeButton = document.createElement('button')
safeButton.type = 'button'
safeButton.textContent = 'Entrar em sessão temporária protegida'
safeButton.style.cssText = 'padding:14px;width:100%;border:0;border-radius:10px;background:#0284c7;color:white;font:700 14px system-ui;cursor:pointer;'
safeButton.onclick = () => {
  // Only the active TAB gets a temporary Auth/Firestore session. No local
  // data, old Firebase databases, drafts or customer receipts are deleted.
  try { window.sessionStorage.setItem('zenos_safe_session','1') } catch (_) {}
  window.location.assign('/?login=1&zenos_safe_session=1')
}
const alternate = document.createElement('a')
alternate.textContent = 'Abrir pelo domínio alternativo'
alternate.href = window.location.hostname === 'www.zenos.app.br'
  ? 'https://zenos.app.br/?login=1&zenos_safe_session=1'
  : 'https://www.zenos.app.br/?login=1&zenos_safe_session=1'
alternate.style.cssText = 'display:block;margin-top:14px;color:#7dd3fc;font-weight:700;'
const safetyNotice = document.createElement('p')
safetyNotice.textContent = 'Não limpe os dados do site. Confira vendas pendentes antes de repetir pagamentos.'
safetyNotice.style.cssText = 'margin-top:18px;color:#fbbf24;font-size:12px;line-height:1.6;'
bootActions.append(recoveryText,safeButton,alternate,safetyNotice)
bootContent.append(bootTitle,bootStatus,bootActions)
bootPanel.append(bootContent)
rootElement.append(bootPanel)
const recoveryTimer = window.setTimeout(() => {
  bootStatus.textContent = 'Inicialização não concluída neste navegador'
  bootActions.style.display = 'block'
  if (new URLSearchParams(window.location.search).get('zenos_safe_session') === '1') {
    safeButton.style.display = 'none'
  }
}, 12000)

const CommerceVitrinePreview = React.lazy(() => import('./components/CommerceVitrinePreview.jsx'))
// Rota independente e somente leitura.
const previewMatch = window.location.pathname.match(/^\/loja\/([^/]+)\/?$/)
let previewLojaId = null
if (previewMatch) {
  try { previewLojaId = decodeURIComponent(previewMatch[1]) }
  catch { previewLojaId = '' }
}

const renderApp = async () => {
  const App = previewMatch ? null : (await import('./App.jsx')).default
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <EnvironmentBanner />
      <React.Suspense fallback={<div role="status" style={{minHeight:'100vh',background:'#020617',color:'#cbd5e1',display:'grid',placeItems:'center'}}>ZenOS…</div>}>
        {previewMatch ? <CommerceVitrinePreview lojaIdRota={previewLojaId} /> : <App />}
      </React.Suspense>
    </React.StrictMode>,
  )
  window.clearTimeout(recoveryTimer)
}

void checkBuildAtBootstrap().then(reloading => {
  if (!reloading) return renderApp()
}).catch(error => {
  console.error('[ZenOS Boot] Falha ao carregar a interface (armazenamento preservado):', error)
  // Do not mount a partially initialized App. Keep the recovery controls
  // available instead of forcing a destructive browser reset or reload loop.
  bootStatus.textContent = 'Falha na inicialização: use o acesso protegido abaixo'
  bootActions.style.display = 'block'
})
