import React from 'react';
import { calcularResumoSessao, calcularConciliacaoEletronicaSessao } from '../core/cashSession';

export default function GestaoCaixas({ sessoesCaixa, historicoVendas = [], caixaMovimentos = [], livroFinanceiro = [], fmt, tx }) {
  const sessoes = sessoesCaixa || [];
  const abertas = sessoes.filter(s => s.status === 'aberta');
  const resumosAbertos = abertas.map(sessao => {
    const resumo = calcularResumoSessao({ sessao, historicoVendas, caixaMovimentos });
    if (!resumo) return null;
    const eletronico = calcularConciliacaoEletronicaSessao({ sessao, livroFinanceiro }) || {};
    return { ...resumo, ...eletronico };
  }).filter(Boolean);
  const dinheiroCirculando = resumosAbertos.reduce((acc, r) => acc + (Number(r.saldoEsperado) || 0), 0);
  const ultimosLancamentos = (livroFinanceiro || []).slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Auditoria de Turnos de Caixa','Auditoría de Turnos de Caja','Cash Shift Audit')}</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('Acompanhe caixas abertos, dinheiro físico e histórico de turnos sem alterar o fluxo operacional aprovado.','Acompañe cajas abiertas, dinero físico e historial de turnos sin alterar el flujo operativo aprobado.','Monitor open registers, physical cash and shift history without changing the approved operational flow.')}</span>
      </div>

      <section style={{ background:'linear-gradient(135deg,#071a16,#0b1120)', border:'1px solid rgba(16,185,129,.35)', borderRadius:20, padding:22 }}>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap',marginBottom:18}}>
          <div><div style={{fontSize:11,fontWeight:900,color:'#34d399',letterSpacing:1.2}}>{tx('CAIXAS ABERTOS AGORA','CAJAS ABIERTAS AHORA','OPEN REGISTERS NOW')}</div><h3 style={{margin:'4px 0 0',fontSize:20,color:'#fff'}}>{tx('Visão gerencial em tempo real','Vista gerencial en tiempo real','Real-time management view')}</h3></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#94a3b8',fontWeight:900}}>{tx('DINHEIRO FÍSICO CIRCULANDO NOS CAIXAS','DINERO FÍSICO EN CIRCULACIÓN EN CAJAS','PHYSICAL CASH IN REGISTERS')}</div><div style={{fontSize:28,fontWeight:900,color:'#34d399'}}>{fmt(dinheiroCirculando,'BRL')}</div></div>
        </div>

        {resumosAbertos.length === 0 ? <div style={{padding:26,textAlign:'center',color:'#64748b',background:'#020617',borderRadius:14,border:'1px solid #1e293b'}}>{tx('Nenhum turno aberto neste momento.','Ningún turno abierto en este momento.','No shift is open right now.')}</div> :
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
            {resumosAbertos.map(r => <div key={r.sessaoId} style={{background:'#020617',border:'1px solid #1e293b',borderRadius:16,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start',marginBottom:12}}><div><strong style={{color:'#fff',fontSize:14}}>{r.operadorNome}</strong><div style={{fontSize:10,color:'#64748b'}}>{tx("Código:","Código:")} {r.operadorId || '—'} {tx("• Abertura:","• Apertura:")} {r.abertura || '—'}</div></div><span style={{fontSize:10,fontWeight:900,color:'#34d399',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',padding:'4px 7px',borderRadius:7}}>{tx('ABERTO','ABIERTO','OPEN')}</span></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px 12px',fontSize:11,color:'#94a3b8'}}>
                <span>{tx('Fundo de caixa','Fondo de caja','Opening Float')}</span><strong style={{textAlign:'right',color:'#cbd5e1'}}>{fmt(r.saldoInicial,'BRL')}</strong>
                <span>{tx('Vendas em dinheiro','Ventas en efectivo','Cash Sales')}</span><strong style={{textAlign:'right',color:'#34d399'}}>{fmt(r.vendasDinheiro,'BRL')}</strong>
                <span>{tx('Recebimentos em dinheiro','Cobros en efectivo','Cash Receipts')}</span><strong style={{textAlign:'right',color:'#34d399'}}>{fmt(r.recebimentosDinheiro,'BRL')}</strong>
                <span>{tx('Suprimentos','Refuerzos','Cash In')}</span><strong style={{textAlign:'right',color:'#34d399'}}>{fmt(r.suprimentos,'BRL')}</strong>
                <span>{tx('Sangrias','Retiros','Cash Out')}</span><strong style={{textAlign:'right',color:'#fb7185'}}>{fmt(r.sangrias,'BRL')}</strong>
                <span>{tx('Devoluções em dinheiro','Devoluciones en efectivo','Cash Returns')}</span><strong style={{textAlign:'right',color:'#fb7185'}}>{fmt(r.devolucoesDinheiro,'BRL')}</strong>
                <span>{tx('Despesas em dinheiro','Gastos en efectivo','Cash Expenses')}</span><strong style={{textAlign:'right',color:'#fb7185'}}>{fmt(r.despesasDinheiro,'BRL')}</strong>
                <span>{tx('Compras em dinheiro','Compras en efectivo','Cash Purchases')}</span><strong style={{textAlign:'right',color:'#fb7185'}}>{fmt(r.comprasDinheiro,'BRL')}</strong>
                <span>{tx('PIX registrado','PIX registrado','PIX Recorded')}</span><strong style={{textAlign:'right',color:'#38bdf8'}}>{fmt(r.pixRegistrado,'BRL')}</strong>
                <span>{tx('Cartões registrados','Tarjetas registradas','Cards Recorded')}</span><strong style={{textAlign:'right',color:'#a78bfa'}}>{fmt(r.cartoesRegistrados,'BRL')}</strong>
                <span>{tx('PIX saídas/estornos','PIX salidas/reversiones','PIX Outflows/Refunds')}</span><strong style={{textAlign:'right',color:'#fb7185'}}>{fmt(r.pixSaidas,'BRL')}</strong>
                <span>{tx('PIX líquido','PIX neto','Net PIX')}</span><strong style={{textAlign:'right',color:'#38bdf8'}}>{fmt(r.pixLiquido,'BRL')}</strong>
                <span>{tx('Cartão crédito líquido','Tarjeta crédito neta','Net Credit Card')}</span><strong style={{textAlign:'right',color:'#a78bfa'}}>{fmt(r.cartaoCreditoLiquido,'BRL')}</strong>
                <span>{tx('Cartão débito líquido','Tarjeta débito neta','Net Debit Card')}</span><strong style={{textAlign:'right',color:'#a78bfa'}}>{fmt(r.cartaoDebitoLiquido,'BRL')}</strong>
              </div>
              <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #1e293b',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:11,fontWeight:900,color:'#94a3b8'}}>{tx('SALDO FÍSICO ESPERADO','SALDO FÍSICO ESPERADO','EXPECTED PHYSICAL CASH')}</span><strong style={{fontSize:20,color:'#fff'}}>{fmt(r.saldoEsperado,'BRL')}</strong></div>
            </div>)}
          </div>}
      </section>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div><strong style={{color:'#fff'}}>{tx('Histórico de Turnos','Historial de Turnos','Shift History')}</strong><div style={{fontSize:11,color:'#64748b'}}>{tx('Área original de auditoria preservada.','Área original de auditoría preservada.','Original audit area preserved.')}</div></div>
        {sessoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>{tx('Nenhum turno de caixa registado no sistema.','Ningún turno de caja registrado en el sistema.','No cash shift recorded in the system.')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}><th style={{ padding: '16px 8px' }}>{tx('Operador','Operador','Operator')}</th><th style={{ padding: '16px 8px' }}>{tx('Abertura','Apertura','Opening')}</th><th style={{ padding: '16px 8px' }}>{tx('Fundo Inicial','Fondo Inicial','Opening Float')}</th><th style={{ padding: '16px 8px' }}>{tx('Estado','Estado','Status')}</th><th style={{ padding: '16px 8px' }}>{tx('Fecho (Sistema)','Cierre (Sistema)','Close (System)')}</th><th style={{ padding: '16px 8px' }}>{tx('Gaveta (Real)','Caja (Real)','Drawer (Actual)')}</th><th style={{ padding: '16px 8px', textAlign: 'right' }}>{tx('Diferença','Diferencia','Difference')}</th></tr></thead>
              <tbody>{sessoes.map(s => <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', color: '#cbd5e1' }}><td style={{ padding: '16px 8px', fontWeight: 800, color: '#f8fafc' }}>{s.operadorNome}</td><td style={{ padding: '16px 8px', color: '#64748b' }}>{s.abertura}</td><td style={{ padding: '16px 8px' }}>{fmt(s.saldoInicial, 'BRL')}</td><td style={{ padding: '16px 8px' }}><span style={{ backgroundColor: s.status === 'aberta' ? 'rgba(16,185,129,.1)' : 'rgba(100,116,139,.1)', color: s.status === 'aberta' ? '#34d399' : '#94a3b8', padding:'4px 8px',borderRadius:6,fontWeight:900,fontSize:10 }}>{s.status === 'aberta' ? 'EM CURSO' : 'FECHADO'}</span></td><td style={{ padding: '16px 8px' }}>{s.status === 'fechada' ? fmt(s.saldoSistema, 'BRL') : '-'}</td><td style={{ padding: '16px 8px', fontWeight: 800, color: s.status === 'fechada' ? '#fff' : '#64748b' }}>{s.status === 'fechada' ? fmt(s.saldoInformado, 'BRL') : '-'}</td><td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 900, color: s.diferenca < 0 ? '#f43f5e' : (s.diferenca > 0 ? '#fbbf24' : '#34d399') }}>{s.status === 'fechada' ? (s.diferenca === 0 ? 'CERTINHO ✅' : fmt(s.diferenca, 'BRL')) : '-'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <section style={{background:'#0b1120',border:'1px solid #1e293b',borderRadius:20,padding:22}}>
        <div style={{marginBottom:14}}><strong style={{color:'#fff'}}>{tx('Livro Financeiro — novos lançamentos','Libro Financiero — nuevos movimientos','Financial Ledger — new entries')}</strong><div style={{fontSize:11,color:'#64748b'}}>{tx('Trilha aditiva da ATT 07. Nenhum movimento antigo é reconstruído por inferência.','Rastro aditivo de ATT 07. Ningún movimiento antiguo se reconstruye por inferencia.','ATT 07 additive trail. No old movement is reconstructed by inference.')}</div></div>
        {ultimosLancamentos.length===0 ? <div style={{padding:28,textAlign:'center',color:'#475569'}}>{tx('Nenhum lançamento novo no Livro Financeiro.','Ningún movimiento nuevo en el Libro Financiero.','No new entries in the Financial Ledger.')}</div> : <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:900}}><thead><tr style={{color:'#64748b',textTransform:'uppercase',borderBottom:'1px solid #1e293b'}}><th style={{padding:10,textAlign:'left'}}>{tx('Data','Fecha','Date')}</th><th style={{textAlign:'left'}}>{tx('Tipo','Tipo','Type')}</th><th style={{textAlign:'left'}}>{tx('Origem','Origen','Source')}</th><th style={{textAlign:'left'}}>{tx('Referência','Referencia','Reference')}</th><th style={{textAlign:'left'}}>{tx('Forma','Forma','Method')}</th><th style={{textAlign:'left'}}>{tx('Operador','Operador','Operator')}</th><th style={{textAlign:'right'}}>{tx('Valor','Valor','Amount')}</th><th style={{textAlign:'center'}}>{tx('Gaveta','Caja','Drawer')}</th><th style={{textAlign:'center'}}>{tx('Resultado','Resultado','Result')}</th></tr></thead><tbody>{ultimosLancamentos.map(l=><tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,.05)',color:'#cbd5e1'}}><td style={{padding:10,color:'#94a3b8'}}>{l.createdAt?new Date(l.createdAt).toLocaleString('pt-BR'):'—'}</td><td style={{fontWeight:800}}>{l.tipo}</td><td>{l.origem}</td><td>{l.referenciaId}</td><td>{l.formaPagamento}</td><td>{l.operadorNome}</td><td style={{textAlign:'right',fontWeight:900,color:l.direcao==='saida'?'#fb7185':'#34d399'}}>{l.direcao==='saida'?'- ':'+ '}{fmt(l.valor,'BRL')}</td><td style={{textAlign:'center'}}>{l.afetaCaixaFisico?'✓':'—'}</td><td style={{textAlign:'center'}}>{l.afetaResultado?'✓':'—'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
