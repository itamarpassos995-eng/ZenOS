import { useEffect, useState } from 'react';
import { CLIENT_BUILD_ID } from '../core/clientBuildRecovery.js';

export const ZENOS_UPDATE_ACK_KEY = 'zenos_acknowledged_version';

/**
 * Apenas na area autenticada do ZenOS: aviso visual uma vez por build/browser.
 * Nao usa Firestore, notificacao nativa ou timers de auto-fechamento.
 */
export default function ZenOSUpdateWelcome() {
  const [visible,setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ZENOS_UPDATE_ACK_KEY) === CLIENT_BUILD_ID) return;
      // Persist BEFORE displaying so StrictMode, refresh and next login
      // cannot repeat the same notification.
      localStorage.setItem(ZENOS_UPDATE_ACK_KEY, CLIENT_BUILD_ID);
      setVisible(true);
    } catch (error) {
      // The optional notice must never block checkout or login.
      console.warn('[ZenOS] Aviso de versao indisponivel:',error);
    }
  }, []);

  if (!visible) return null;
  const close = () => setVisible(false);

  return (
    <aside
      aria-label="ZenOS atualizado com sucesso"
      role="status"
      aria-live="polite"
      data-testid="zenos-update-welcome"
      className="fixed bottom-24 right-4 z-[80] w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl sm:bottom-28 sm:right-6"
    >
      <div className="h-1 bg-gradient-to-r from-rose-600 via-rose-400 to-emerald-400" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <circle cx="12" cy="12" r="10" />
              <path d="m8 12 2.5 2.5L16 9" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300">ZenOS · Sistema de Gestão</p>
            <h2 className="text-lg font-bold leading-snug tracking-tight">ZenOS Atualizado com Sucesso!</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Parabéns! Você já está utilizando a versão mais recente e segura do sistema.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar aviso de atualização" className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] text-emerald-400" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Sistema atualizado
          </div>
          <button type="button" onClick={close} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">
            Entendido / Continuar
          </button>
        </div>
      </div>
    </aside>
  );
}
