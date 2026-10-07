import React from 'react';
import { ZENOS_RUNTIME } from '../core/runtimeEnvironment';

export default function EnvironmentBanner() {
  if (!ZENOS_RUNTIME.isHomologacao) return null;

  return (
    <div
      role="status"
      aria-label="Ambiente de homologação"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        minHeight: '28px',
        padding: '6px 12px',
        boxSizing: 'border-box',
        background: '#f59e0b',
        color: '#111827',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        fontSize: '11px',
        lineHeight: 1.35,
        fontWeight: 900,
        textAlign: 'center',
        letterSpacing: '0.5px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}
    >
      🧪 MODO TESTE / HOMOLOGAÇÃO — Firebase local — DADOS DE PRODUÇÃO NÃO SÃO USADOS NESTE AMBIENTE
    </div>
  );
}
