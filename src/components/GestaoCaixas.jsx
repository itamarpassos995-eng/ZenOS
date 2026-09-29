import React from 'react';

export default function GestaoCaixas({ sessoesCaixa, fmt, tx }) {
  const sessoes = sessoesCaixa || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Auditoria de Turnos de Caixa</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>Acompanhe as aberturas, fechos e quebras de caixa por operador.</span>
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {sessoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Nenhum turno de caixa registado no sistema.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '16px 8px' }}>Operador</th>
                  <th style={{ padding: '16px 8px' }}>Abertura</th>
                  <th style={{ padding: '16px 8px' }}>Fundo Inicial</th>
                  <th style={{ padding: '16px 8px' }}>Estado</th>
                  <th style={{ padding: '16px 8px' }}>Fecho (Sistema)</th>
                  <th style={{ padding: '16px 8px' }}>Gaveta (Real)</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right' }}>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {sessoes.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', color: '#cbd5e1' }}>
                    <td style={{ padding: '16px 8px', fontWeight: 800, color: '#f8fafc' }}>{s.operadorNome}</td>
                    <td style={{ padding: '16px 8px', color: '#64748b' }}>{s.abertura}</td>
                    <td style={{ padding: '16px 8px' }}>{fmt(s.saldoInicial, 'BRL')}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ backgroundColor: s.status === 'aberta' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)', color: s.status === 'aberta' ? '#34d399' : '#94a3b8', padding: '4px 8px', borderRadius: '6px', fontWeight: 900, fontSize: '10px' }}>
                        {s.status === 'aberta' ? 'EM CURSO' : 'FECHADO'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 8px' }}>{s.status === 'fechada' ? fmt(s.saldoSistema, 'BRL') : '-'}</td>
                    <td style={{ padding: '16px 8px', fontWeight: 800, color: s.status === 'fechada' ? '#fff' : '#64748b' }}>{s.status === 'fechada' ? fmt(s.saldoInformado, 'BRL') : '-'}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 900, color: s.diferenca < 0 ? '#f43f5e' : (s.diferenca > 0 ? '#fbbf24' : '#34d399') }}>
                      {s.status === 'fechada' ? (s.diferenca === 0 ? 'CERTINHO ✅' : fmt(s.diferenca, 'BRL')) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
