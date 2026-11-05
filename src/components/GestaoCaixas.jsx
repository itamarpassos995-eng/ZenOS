import React, {useState,useRef,useEffect} from 'react';
import {db} from '../firebase';
import {collection,query,where,orderBy,limit,startAfter,getDocsFromServer} from 'firebase/firestore';
import {intervaloCaixa,filtrarTurnosCaixa,diferencaHistoricaCaixa} from '../core/cashAuditHistory.js';
import {formatarDinheiroNativo} from '../core/cashHistoryDisplay.js';
import { calcularResumoSessao, calcularConciliacaoEletronicaSessao } from '../core/cashSession';

export default function GestaoCaixas({ userId, sessoesCaixa, historicoVendas = [], caixaMovimentos = [], livroFinanceiro = [], fmt, tx }) {
  const [periodo,setPeriodo]=useState('hoje'),[inicio,setInicio]=useState(''),[fim,setFim]=useState('');
  const [detalhe,setDetalhe]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false);
  const [consultado,setConsultado]=useState(false);
  const [paginaLivro,setPaginaLivro]=useState([]),[cursor,setCursor]=useState(null),[mais,setMais]=useState(false);
  const consultaRef=useRef(0);
  useEffect(()=>{consultaRef.current++;setConsultado(false);setPaginaLivro([]);setCursor(null);setMais(false);setCarregando(false);setErro('');},[periodo,inicio,fim,userId]);
  let intervalo=null;
  try{intervalo=intervaloCaixa(periodo,new Date(),inicio,fim);}catch{}
  const sessoes = intervalo?filtrarTurnosCaixa(sessoesCaixa||[],intervalo):[];
  const carregarLivro=async(proxima=false)=>{
    if(!intervalo||!userId)return;
    const id=++consultaRef.current;setCarregando(true);setErro('');
    try{
      const snap=await getDocsFromServer(query(collection(db,'lojas',String(userId),'financeiro_livro'),
        where('createdAt','>=',intervalo.inicio),
        where('createdAt','<',intervalo.fim),
        orderBy('createdAt','desc'),
        ...(proxima&&cursor?[startAfter(cursor)]:[]),limit(100)));
      if(id!==consultaRef.current)return;
      setConsultado(true);
      const rows=snap.docs.map(d=>({...d.data(),id:d.id}));
      setPaginaLivro(prev=>proxima?[...prev,...rows]:rows);setCursor(snap.docs.at(-1)||null);setMais(snap.size===100);
    }catch(e){if(id===consultaRef.current)setErro(e.message);}
    finally{if(id===consultaRef.current)setCarregando(false);}
  };
  const imprimirTurno=()=>{
    const popup=window.open('','_blank');
    if(!popup){setErro(tx('Impressão bloqueada pelo navegador.','Impresión bloqueada por el navegador.','Printing blocked by the browser.'));return;}
    const section=document.getElementById('zenos-caixa-fechado-detalhe');
    popup.document.title=tx('Comprovante de caixa — segunda via','Comprobante de caja — copia','Cash receipt — copy');
    const pre=popup.document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=section?.innerText||section?.textContent||'';
    popup.document.body.appendChild(pre);popup.document.close();popup.focus();popup.print();
  };
  const abertas = (sessoesCaixa||[]).filter(s => s.status === 'aberta');
  const resumosAbertos = abertas.map(sessao => {
    const resumo = calcularResumoSessao({ sessao, historicoVendas, caixaMovimentos });
    if (!resumo) return null;
    const eletronico = calcularConciliacaoEletronicaSessao({ sessao, livroFinanceiro }) || {};
    return { ...resumo, ...eletronico };
  }).filter(Boolean);
  const dinheiroCirculando = resumosAbertos.reduce((acc, r) => acc + (Number(r.saldoEsperado) || 0), 0);
  const ultimosLancamentos = paginaLivro;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Auditoria de Turnos de Caixa','Auditoría de Turnos de Caja','Cash Shift Audit')}</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('Acompanhe caixas abertos, dinheiro físico e histórico de turnos sem alterar o fluxo operacional aprovado.','Acompañe cajas abiertas, dinero físico e historial de turnos sin alterar el flujo operativo aprobado.','Monitor open registers, physical cash and shift history without changing the approved operational flow.')}</span>
      </div>

      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        {[['hoje',tx('Hoje','Hoy','Today')],['mes',tx('Este mês','Este mes','This month')],['anterior',tx('Mês passado','Mes pasado','Last month')],['personalizado',tx('Personalizado','Personalizado','Custom')]].map(([id,label])=><button key={id} aria-pressed={periodo===id} onClick={()=>setPeriodo(id)}>{label}</button>)}
        {periodo==='personalizado'&&<><input aria-label={tx('Data inicial','Fecha inicial','Start date')} type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/><input aria-label={tx('Data final','Fecha final','End date')} type="date" value={fim} onChange={e=>setFim(e.target.value)}/></>}
        {!intervalo&&<span role="alert">{tx('Informe um período válido.','Informe un período válido.','Enter a valid period.')}</span>}
      </div>
      {detalhe&&<section style={{background:'#0b1120',padding:24,border:'1px solid #38bdf8',borderRadius:16}}>
        <div id="zenos-caixa-fechado-detalhe">
          <h3>{tx('Caixa fechado — conferência e segunda via','Caja cerrada — revisión y copia','Closed shift — review and copy')}</h3>
          <p>{detalhe.id} · {detalhe.operadorNome||detalhe.operadorId}</p>
          <p>{tx('Abertura','Apertura','Opening')}: {detalhe.abertura||detalhe.createdAt}</p>
          <p>{tx('Fechamento','Cierre','Closing')}: {detalhe.fechamentoLocal||detalhe.fechamento}</p>
          <p>{tx('Sistema registrado','Sistema registrado','Recorded expected')}: {fmt(detalhe.saldoSistema,'BRL')} · {tx('Contagem registrada','Conteo registrado','Recorded count')}: {fmt(detalhe.saldoInformado,'BRL')}</p>
          <p>{diferencaHistoricaCaixa(detalhe).pendente?tx('Auditoria pendente — diferença indeterminada','Auditoría pendiente — diferencia indeterminada','Audit pending — undetermined difference'):tx('Diferença registrada','Diferencia registrada','Recorded difference')+': '+fmt(detalhe.diferenca,'BRL')}</p>
          {['BRL','PYG','USD','EUR'].map(m=><p key={m}>{m}: {tx('Esperado','Esperado','Expected')} {detalhe.composicaoEsperadaNativa?.[m]!=null?formatarDinheiroNativo(detalhe.composicaoEsperadaNativa[m],m):'—'} · {tx('Contado','Contado','Counted')} {detalhe.composicaoContadaNativa?.[m]!=null?formatarDinheiroNativo(detalhe.composicaoContadaNativa[m],m):'—'}</p>)}
          <p>{tx('Resumo eletrônico registrado','Resumen electrónico registrado','Recorded electronic summary')}: {JSON.stringify(detalhe.conciliacaoEletronica||{})}</p>
          <p>{tx('Cotação registrada','Cotización registrada','Recorded exchange rate')}: {JSON.stringify(detalhe.taxasCambioFechamento||{})}</p>
          {(detalhe.pendenciasConciliacao||[]).map((p,i)=><p key={i}>{p}</p>)}
          <p>{tx('Cópia do registro original. Valores antigos não foram alterados.','Copia del registro original. Los valores anteriores no se modificaron.','Copy of the original record. Previous amounts have not been changed.')}</p>
        </div>
        <button onClick={imprimirTurno}>{tx('Reimprimir','Reimprimir','Reprint')}</button> <button onClick={()=>setDetalhe(null)}>{tx('Fechar','Cerrar','Close')}</button>
      </section>}
      {erro&&<p role="alert">{erro}</p>}
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
              <tbody>{sessoes.map(s => <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', color: '#cbd5e1' }}><td style={{ padding: '16px 8px', fontWeight: 800, color: '#f8fafc' }}>{s.operadorNome}{s.status==='fechada'&&<div><button onClick={()=>setDetalhe(s)}>{tx('Conferir / Reimprimir','Revisar / Reimprimir','Review / Reprint')}</button></div>}</td><td style={{ padding: '16px 8px', color: '#64748b' }}>{s.abertura}</td><td style={{ padding: '16px 8px' }}>{fmt(s.saldoInicial, 'BRL')}</td><td style={{ padding: '16px 8px' }}><span style={{ backgroundColor: s.status === 'aberta' ? 'rgba(16,185,129,.1)' : 'rgba(100,116,139,.1)', color: s.status === 'aberta' ? '#34d399' : '#94a3b8', padding:'4px 8px',borderRadius:6,fontWeight:900,fontSize:10 }}>{s.status === 'aberta' ? 'EM CURSO' : 'FECHADO'}</span></td><td style={{ padding: '16px 8px' }}>{s.status === 'fechada' ? fmt(s.saldoSistema, 'BRL') : '-'}</td><td style={{ padding: '16px 8px', fontWeight: 800, color: s.status === 'fechada' ? '#fff' : '#64748b' }}>{s.status === 'fechada' ? fmt(s.saldoInformado, 'BRL') : '-'}</td><td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 900, color: diferencaHistoricaCaixa(s).pendente ? '#fbbf24' : s.diferenca < 0 ? '#f43f5e' : (s.diferenca > 0 ? '#fbbf24' : '#34d399') }}>{s.status === 'fechada' ? (diferencaHistoricaCaixa(s).pendente ? tx('Auditoria pendente','Auditoría pendiente','Audit pending') : s.diferenca === 0 ? tx("CERTINHO ✅","CORRECTO ✅") : fmt(s.diferenca, 'BRL')) : '-'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <section style={{background:'#0b1120',border:'1px solid #1e293b',borderRadius:20,padding:22}}>
        <div style={{marginBottom:14}}><strong style={{color:'#fff'}}>{tx('Livro Financeiro — novos lançamentos','Libro Financiero — nuevos movimientos','Financial Ledger — new entries')}</strong><div style={{fontSize:11,color:'#64748b'}}>{tx('Trilha aditiva da ATT 07. Nenhum movimento antigo é reconstruído por inferência.','Rastro aditivo de ATT 07. Ningún movimiento antiguo se reconstruye por inferencia.','ATT 07 additive trail. No old movement is reconstructed by inference.')}</div></div>
        <button disabled={carregando||!intervalo} onClick={()=>carregarLivro(false)}>{tx('Consultar lançamentos do período','Consultar movimientos del período','Load period entries')}</button>
        {mais&&<button disabled={carregando} onClick={()=>carregarLivro(true)}>{tx('Carregar mais','Cargar más','Load more')}</button>}
        {ultimosLancamentos.length===0 ? <div style={{padding:28,textAlign:'center',color:'#475569'}}>{consultado?tx('Nenhum lançamento neste período.','Ningún movimiento en este período.','No entries in this period.'):tx('Use Consultar para carregar os lançamentos do período selecionado.','Utilice Consultar para cargar los movimientos del período seleccionado.','Use Load to fetch entries for the selected period.')}</div> : <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:900}}><thead><tr style={{color:'#64748b',textTransform:'uppercase',borderBottom:'1px solid #1e293b'}}><th style={{padding:10,textAlign:'left'}}>{tx('Data','Fecha','Date')}</th><th style={{textAlign:'left'}}>{tx('Tipo','Tipo','Type')}</th><th style={{textAlign:'left'}}>{tx('Origem','Origen','Source')}</th><th style={{textAlign:'left'}}>{tx('Referência','Referencia','Reference')}</th><th style={{textAlign:'left'}}>{tx('Forma','Forma','Method')}</th><th style={{textAlign:'left'}}>{tx('Operador','Operador','Operator')}</th><th style={{textAlign:'right'}}>{tx('Valor','Valor','Amount')}</th><th style={{textAlign:'center'}}>{tx('Gaveta','Caja','Drawer')}</th><th style={{textAlign:'center'}}>{tx('Resultado','Resultado','Result')}</th></tr></thead><tbody>{ultimosLancamentos.map(l=><tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,.05)',color:'#cbd5e1'}}><td style={{padding:10,color:'#94a3b8'}}>{l.createdAt?new Date(l.createdAt).toLocaleString('pt-BR'):'—'}</td><td style={{fontWeight:800}}>{l.tipo}</td><td>{l.origem}</td><td>{l.referenciaId}</td><td>{l.formaPagamento}</td><td>{l.operadorNome}</td><td style={{textAlign:'right',fontWeight:900,color:l.direcao==='saida'?'#fb7185':'#34d399'}}>{l.direcao==='saida'?'- ':'+ '}{fmt(l.valor,'BRL')}</td><td style={{textAlign:'center'}}>{l.afetaCaixaFisico?'✓':'—'}</td><td style={{textAlign:'center'}}>{l.afetaResultado?'✓':'—'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
