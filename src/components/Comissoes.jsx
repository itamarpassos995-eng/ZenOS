import React, { useEffect, useMemo, useState } from 'react';
import { chaveDiaLocal, deslocarMesYYYYMM, obterMesLocalAtual } from '../core/dates';
import { vendaElegivelParaComissao } from '../core/commissions';
import { classificarMargem, normalizarRegrasMargem } from '../core/profitability';
import {
  TIPOS_BONUS,
  criarRegraBonus,
  gerarRelatorioComissoes,
  normalizarRegrasComissao,
} from '../core/commissionEngine';

const estiloInput = {
  width: '100%', padding: '11px 12px', backgroundColor: '#020617', border: '1px solid #334155',
  borderRadius: '8px', color: '#f8fafc', fontWeight: 800, outline: 'none', boxSizing: 'border-box',
};

const formatarMetricaBonus = (bonus, fmt) => {
  if (bonus.tipo === 'sem_devolucoes') return bonus.atingida ? 'Nenhuma devolução' : `${bonus.atual || 0} devolução(ões)`;
  if (['faturamento', 'lucro', 'ticket_medio'].includes(bonus.tipo)) return fmt(bonus.atual || 0);
  if (bonus.tipo === 'margem_media') return `${Number(bonus.atual || 0).toFixed(1)}%`;
  return String(Math.round(Number(bonus.atual || 0)));
};

const formatarMetaBonus = (bonus, fmt) => {
  if (bonus.tipo === 'sem_devolucoes') return 'Meta: zero devoluções';
  if (['faturamento', 'lucro', 'ticket_medio'].includes(bonus.tipo)) return `Meta: ${fmt(bonus.meta || 0)}`;
  if (bonus.tipo === 'margem_media') return `Meta: ${Number(bonus.meta || 0).toFixed(1)}%`;
  return `Meta: ${Math.round(Number(bonus.meta || 0))}`;
};

export default function Comissoes({ commitOperacaoNegocio, historicoVendas, fmt, tx, patenteUsuario, operadorAtivo, regrasDesconto, regrasComissao, setRegrasComissao }) {
  const [filtroMes, setFiltroMes] = useState(() => obterMesLocalAtual());
  const [modoPeriodo, setModoPeriodo] = useState('mes');
  const [dataInicio, setDataInicio] = useState(() => `${obterMesLocalAtual()}-01`);
  const [dataFim, setDataFim] = useState(() => chaveDiaLocal(new Date()));
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState(false);
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const [erroSalvarRegras, setErroSalvarRegras] = useState('');
  const [rascunho, setRascunho] = useState(() => normalizarRegrasComissao(regrasComissao || {}));

  useEffect(() => {
    setRascunho(normalizarRegrasComissao(regrasComissao || {}));
  }, [regrasComissao]);

  const filtroPeriodo = modoPeriodo === 'intervalo'
    ? { tipo: 'intervalo', inicio: dataInicio, fim: dataFim }
    : { tipo: 'mes', mes: filtroMes };

  const vendasElegiveis = (historicoVendas || []).filter(v => vendaElegivelParaComissao(v, filtroPeriodo));
  const idVendedorLogado = operadorAtivo?.id || 'admin';
  const ehAdmin = patenteUsuario === 'gerencia' || operadorAtivo?.permissoes?.admin === true;
  const vendasVisiveis = ehAdmin ? vendasElegiveis : vendasElegiveis.filter(v => String(v.vendedorId) === String(idVendedorLogado));
  const regrasAtivas = normalizarRegrasComissao(regrasComissao || {});
  const relatorio = useMemo(
    () => gerarRelatorioComissoes(vendasVisiveis, regrasAtivas, regrasDesconto || {}),
    [vendasVisiveis, regrasAtivas, regrasDesconto]
  );
  const { margemIdeal, margemMinima } = normalizarRegrasMargem(regrasDesconto || {});

  const salvarRegras = async () => {
    if (salvandoRegras) return;
    const normalizadas = normalizarRegrasComissao(rascunho);
    setSalvandoRegras(true);
    setErroSalvarRegras('');
    setSalvoAgora(false);
    try {
      let confirmadas = normalizadas;
      if (typeof commitOperacaoNegocio === 'function') {
        const resultado = await commitOperacaoNegocio({ changes:[{ field:'regrasComissao', value:normalizadas, storageSuffix:'regras_comissao' }] });
        if (!resultado?.cloudOk) throw resultado?.error || new Error('A nuvem não confirmou as regras de comissão.');
        confirmadas = resultado.values?.regrasComissao || normalizadas;
      }
      if (typeof setRegrasComissao === 'function') setRegrasComissao(confirmadas);
      setRascunho(confirmadas);
      setSalvoAgora(true);
      window.setTimeout(() => setSalvoAgora(false), 1800);
    } catch (error) {
      setErroSalvarRegras(error?.message || 'Não foi possível confirmar as regras na nuvem.');
    } finally {
      setSalvandoRegras(false);
    }
  };

  const adicionarBonus = () => {
    setRascunho(prev => ({ ...prev, bonusRegras: [...(prev.bonusRegras || []), criarRegraBonus('faturamento')] }));
  };

  const atualizarBonus = (id, campo, valor) => {
    setRascunho(prev => ({
      ...prev,
      bonusRegras: (prev.bonusRegras || []).map(regra => regra.id === id ? { ...regra, [campo]: valor } : regra),
    }));
  };

  const removerBonus = (id) => {
    setRascunho(prev => ({ ...prev, bonusRegras: (prev.bonusRegras || []).filter(regra => regra.id !== id) }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1240px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Comissões, Metas e Bonificações', 'Comisiones, Metas y Bonificaciones', 'Commissions, Goals and Bonuses')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {ehAdmin ? 'Visão gerencial da equipa com proteção permanente de margem.' : 'Acompanhe suas vendas, margem, metas e comissão.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {ehAdmin && <button onClick={() => setMostrarConfig(!mostrarConfig)} style={{ backgroundColor: mostrarConfig ? '#1e293b' : '#020617', border: '1px solid #334155', color: '#f8fafc', padding: '10px 16px', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}>⚙️ Regras e Metas</button>}
          <select value={modoPeriodo} onChange={(e) => setModoPeriodo(e.target.value)} style={{ ...estiloInput, width: 'auto' }}>
            <option value="mes">Por mês</option>
            <option value="intervalo">Período personalizado</option>
          </select>
          {modoPeriodo === 'mes' ? <>
            <button onClick={() => setFiltroMes(deslocarMesYYYYMM(filtroMes, -1))} style={{ backgroundColor: '#020617', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontWeight: 900 }}>←</button>
            <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={{ ...estiloInput, width: 'auto' }} />
            <button onClick={() => setFiltroMes(deslocarMesYYYYMM(filtroMes, 1))} style={{ backgroundColor: '#020617', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontWeight: 900 }}>→</button>
          </> : <>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ ...estiloInput, width: 'auto' }} />
            <span style={{ color: '#64748b', fontWeight: 800 }}>até</span>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ ...estiloInput, width: 'auto' }} />
          </>}
        </div>
      </div>

      <div style={{ padding: '16px 18px', borderRadius: '14px', border: '1px solid rgba(16,185,129,.35)', background: 'linear-gradient(90deg, rgba(16,185,129,.10), rgba(15,23,42,.9))' }}>
        <div style={{ color: '#34d399', fontSize: '12px', fontWeight: 900, letterSpacing: '.6px' }}>🛡️ PROTEÇÃO FINANCEIRA SEMPRE ATIVA</div>
        <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '5px' }}>
          O semáforo é independente da base de comissão. Venda com lucro zero ou prejuízo gera <b style={{ color: '#fff' }}>R$ 0,00 de comissão</b> e a comissão nunca pode ultrapassar o lucro líquido positivo da própria venda. A base atual é <b style={{ color: '#38bdf8' }}>{regrasAtivas.baseCalculo === 'faturamento' ? 'FATURAMENTO LÍQUIDO' : 'LUCRO LÍQUIDO'}</b>.
        </div>
      </div>

      {ehAdmin && mostrarConfig && (
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #38bdf8', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', color: '#38bdf8', fontWeight: 900 }}>Motor de Comissão</h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Escolha sobre qual valor o percentual será aplicado. O semáforo e o bloqueio de prejuízo continuam obrigatórios.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 900 }}>Base da comissão</label>
              <select value={rascunho.baseCalculo} onChange={e => setRascunho({ ...rascunho, baseCalculo: e.target.value })} style={estiloInput}>
                <option value="lucro">Lucro líquido da venda</option>
                <option value="faturamento">Faturamento líquido da venda</option>
              </select>
            </div>
            <div><label style={{ fontSize: '11px', color: '#34d399', fontWeight: 900 }}>% Verde</label><input min="0" max="100" step="0.01" type="number" value={rascunho.pctVerde} onChange={e => setRascunho({ ...rascunho, pctVerde: e.target.value })} style={estiloInput} /></div>
            <div><label style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 900 }}>% Amarelo</label><input min="0" max="100" step="0.01" type="number" value={rascunho.pctAmarelo} onChange={e => setRascunho({ ...rascunho, pctAmarelo: e.target.value })} style={estiloInput} /></div>
            <div><label style={{ fontSize: '11px', color: '#fb7185', fontWeight: 900 }}>% Vermelho</label><input min="0" max="100" step="0.01" type="number" value={rascunho.pctVermelho} onChange={e => setRascunho({ ...rascunho, pctVermelho: e.target.value })} style={estiloInput} /></div>
            <div><label style={{ fontSize: '11px', color: '#c084fc', fontWeight: 900 }}>Bônus fixo por venda</label><input min="0" step="0.01" type="number" value={rascunho.bonusFixo} onChange={e => setRascunho({ ...rascunho, bonusFixo: e.target.value })} style={estiloInput} /></div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 900 }}>
            <span style={{ color: '#34d399' }}>🟢 margem ≥ {margemIdeal}%</span>
            <span style={{ color: '#fbbf24' }}>🟡 {margemMinima}% a &lt; {margemIdeal}%</span>
            <span style={{ color: '#fb7185' }}>🔴 margem &lt; {margemMinima}%</span>
            <span style={{ color: '#fb7185' }}>⛔ prejuízo = comissão zero</span>
          </div>

          <div style={{ borderTop: '1px solid #1e293b', paddingTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div><h3 style={{ margin: 0, color: '#c084fc', fontSize: '16px' }}>Bonificações automáticas</h3><span style={{ color: '#64748b', fontSize: '11px' }}>Cadastre quantas metas quiser. Cada regra atingida soma seu bônus ao total do vendedor.</span></div>
              <button onClick={adicionarBonus} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #7c3aed', background: 'rgba(124,58,237,.15)', color: '#c4b5fd', fontWeight: 900, cursor: 'pointer' }}>+ Nova bonificação</button>
            </div>
            {(rascunho.bonusRegras || []).length === 0 ? <div style={{ color: '#64748b', fontSize: '12px', padding: '14px', background: '#020617', borderRadius: '10px' }}>Nenhuma bonificação por meta cadastrada.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(rascunho.bonusRegras || []).map(regra => (
                  <div key={regra.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.2fr) minmax(180px,1fr) minmax(120px,.7fr) minmax(120px,.7fr) auto auto', gap: '10px', alignItems: 'end', background: '#020617', border: '1px solid #1e293b', padding: '12px', borderRadius: '12px' }}>
                    <div><label style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900 }}>Nome</label><input value={regra.nome} onChange={e => atualizarBonus(regra.id, 'nome', e.target.value)} style={estiloInput} /></div>
                    <div><label style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900 }}>Critério</label><select value={regra.tipo} onChange={e => atualizarBonus(regra.id, 'tipo', e.target.value)} style={estiloInput}>{TIPOS_BONUS.map(tipo => <option key={tipo.id} value={tipo.id}>{tipo.label}</option>)}</select></div>
                    <div><label style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900 }}>Meta</label><input disabled={regra.tipo === 'sem_devolucoes'} min="0" step="0.01" type="number" value={regra.meta} onChange={e => atualizarBonus(regra.id, 'meta', e.target.value)} style={{ ...estiloInput, opacity: regra.tipo === 'sem_devolucoes' ? .45 : 1 }} /></div>
                    <div><label style={{ color: '#c084fc', fontSize: '10px', fontWeight: 900 }}>Bônus R$</label><input min="0" step="0.01" type="number" value={regra.valorBonus} onChange={e => atualizarBonus(regra.id, 'valorBonus', e.target.value)} style={estiloInput} /></div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', fontSize: '11px', paddingBottom: '10px' }}><input type="checkbox" checked={regra.ativo !== false} onChange={e => atualizarBonus(regra.id, 'ativo', e.target.checked)} /> Ativa</label>
                    <button onClick={() => removerBonus(regra.id)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(244,63,94,.35)', background: 'rgba(244,63,94,.08)', color: '#fb7185', cursor: 'pointer', fontWeight: 900 }}>Remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
            {salvoAgora && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 900 }}>✓ Regras salvas e sincronizadas</span>}
            {erroSalvarRegras && <span style={{ color: '#fb7185', fontSize: '12px', fontWeight: 900 }}>⚠ {erroSalvarRegras}</span>}
            <button disabled={salvandoRegras} onClick={salvarRegras} style={{ padding: '12px 20px', borderRadius: '9px', border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 900, cursor: salvandoRegras ? 'wait' : 'pointer', opacity: salvandoRegras ? .65 : 1 }}>{salvandoRegras ? 'Confirmando…' : 'Salvar regras'}</button>
          </div>
        </div>
      )}

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px' }}>
        {relatorio.length === 0 ? <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Sem vendas elegíveis neste período.</div> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1050px' }}>
            <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px' }}>
              <th style={{ padding: '14px 8px' }}>Operador</th><th style={{ textAlign: 'center' }}>Vendas</th><th style={{ textAlign: 'right' }}>Faturamento</th><th style={{ textAlign: 'right' }}>Lucro</th><th style={{ textAlign: 'center' }}>Margem Média</th><th style={{ textAlign: 'center' }}>Semáforo</th><th style={{ textAlign: 'right' }}>Comissão</th><th style={{ textAlign: 'right' }}>Bônus</th><th style={{ textAlign: 'right', color: '#34d399' }}>Total</th>
            </tr></thead>
            <tbody>{relatorio.map(linha => {
              const metasAtingidas = linha.bonusAvaliados.filter(b => b.atingida).length;
              const faixaMedia = classificarMargem(linha.margemMediaPct, regrasDesconto || {});
              return <tr key={linha.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', color: '#cbd5e1', fontSize: '12px' }}>
                <td style={{ padding: '16px 8px', color: '#f8fafc', fontWeight: 900 }}>{linha.nome}{linha.qtdPrejuizo > 0 && <div style={{ color: '#fb7185', fontSize: '10px', marginTop: '4px' }}>⛔ {linha.qtdPrejuizo} venda(s) sem comissão por prejuízo</div>}{linha.qtdComissaoLimitada > 0 && <div style={{ color: '#fbbf24', fontSize: '10px', marginTop: '3px' }}>🛡️ {linha.qtdComissaoLimitada} comissão(ões) limitada(s) ao lucro da venda</div>}</td>
                <td style={{ textAlign: 'center' }}>{linha.totalAtendimentos}</td><td style={{ textAlign: 'right' }}>{fmt(linha.totalVendas)}</td><td style={{ textAlign: 'right' }}>{fmt(linha.totalLucro)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: faixaMedia.cor, background: faixaMedia.fundo, border: `1px solid ${faixaMedia.borda}`, padding: '4px 7px', borderRadius: '6px', fontWeight: 900 }}>{linha.margemMediaPct.toFixed(1)}%</span></td>
                <td style={{ textAlign: 'center' }}><div style={{ display: 'flex', gap: '5px', justifyContent: 'center', fontWeight: 900 }}><span style={{ color: '#34d399' }}>● {linha.qtdVerde}</span><span style={{ color: '#fbbf24' }}>● {linha.qtdAmarelo}</span><span style={{ color: '#fb7185' }}>● {linha.qtdVermelho}</span></div></td>
                <td style={{ textAlign: 'right' }}><div style={{ fontWeight: 900 }}>{fmt(linha.comissaoBaseTotal)}</div><div style={{ color: '#64748b', fontSize: '10px' }}>sobre {linha.baseCalculo === 'faturamento' ? 'faturamento' : 'lucro'}</div></td>
                <td style={{ textAlign: 'right', color: '#c084fc' }}><div style={{ fontWeight: 900 }}>{linha.totalBonus > 0 ? fmt(linha.totalBonus) : '-'}</div>{linha.bonusAvaliados.length > 0 && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{metasAtingidas}/{linha.bonusAvaliados.length} metas</div>}</td>
                <td style={{ textAlign: 'right', color: '#34d399', fontWeight: 900, fontSize: '15px' }}>{fmt(linha.comissaoTotal)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </div>

      {relatorio.some(l => l.bonusAvaliados.length > 0) && <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div><h3 style={{ margin: 0, color: '#fff', fontSize: '17px' }}>Acompanhamento de metas</h3><span style={{ color: '#64748b', fontSize: '11px' }}>O sistema qualifica automaticamente cada bonificação conforme o resultado do período.</span></div>
        {relatorio.map(linha => linha.bonusAvaliados.length > 0 && <div key={`metas-${linha.id}`} style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '18px' }}>
          <div style={{ color: '#f8fafc', fontWeight: 900, marginBottom: '12px' }}>{linha.nome}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
            {linha.bonusAvaliados.map(bonus => <div key={bonus.id} style={{ padding: '13px', borderRadius: '11px', border: `1px solid ${bonus.atingida ? 'rgba(16,185,129,.4)' : '#1e293b'}`, background: bonus.atingida ? 'rgba(16,185,129,.08)' : '#020617' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 900 }}>{bonus.nome}</span><span style={{ color: bonus.atingida ? '#34d399' : '#fbbf24', fontSize: '10px', fontWeight: 900 }}>{bonus.atingida ? '✓ QUALIFICADO' : 'EM ANDAMENTO'}</span></div>
              <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '6px' }}>{formatarMetaBonus(bonus, fmt)} • Atual: {formatarMetricaBonus(bonus, fmt)}</div>
              <div style={{ marginTop: '8px', height: '6px', background: '#1e293b', borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${bonus.progressoPct}%`, height: '100%', background: bonus.atingida ? '#10b981' : '#8b5cf6' }} /></div>
              <div style={{ color: '#c084fc', marginTop: '7px', fontSize: '11px', fontWeight: 900 }}>Bônus: {fmt(bonus.valorBonus)}</div>
            </div>)}
          </div>
        </div>)}
      </div>}
    </div>
  );
}
