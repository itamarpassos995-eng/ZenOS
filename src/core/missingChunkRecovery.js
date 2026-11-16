// Recovery for stale code-split chunks after a production deployment.
// No business state is modified and the operator decides when to reload.
export function installMissingChunkRecovery() {
  if (typeof window === 'undefined' || window.__zenosMissingChunkRecovery) return;
  window.__zenosMissingChunkRecovery = true;
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault();
    if (document.getElementById('zenos-missing-chunk-dialog')) return;
    const modal = document.createElement('div');
    modal.id = 'zenos-missing-chunk-dialog';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Atualização do sistema');
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(2,6,23,.96);color:white;font:16px system-ui,sans-serif';
    const panel = document.createElement('div');
    panel.style.cssText = 'max-width:470px;padding:24px;border:1px solid #64748b;border-radius:16px;background:#0f172a;box-shadow:0 18px 55px #0008';
    const title = document.createElement('h2');
    title.textContent = 'ZenOS recebeu uma atualização';
    title.style.cssText = 'font-size:21px;font-weight:700;margin:0 0 12px';
    const message = document.createElement('p');
    message.textContent = 'Uma parte da versão antiga não está mais disponível. Reabra a versão atual sem limpar os dados do navegador. Antes de repetir uma venda ou fechamento, consulte o histórico para evitar duplicação.';
    message.style.cssText = 'line-height:1.55;color:#cbd5e1;margin:0 0 20px';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Recarregar ZenOS';
    reload.style.cssText = 'width:100%;border:0;border-radius:10px;padding:13px 16px;background:#e11d48;color:#fff;cursor:pointer;font:600 16px system-ui,sans-serif';
    reload.addEventListener('click', () => window.location.reload());
    panel.append(title,message,reload);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    reload.focus();
  });
}
