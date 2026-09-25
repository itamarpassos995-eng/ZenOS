import React, { useState, useRef } from 'react';
import { normalizarCliente } from '../data';

export default function Clientes({ clientes, setClientes, moeda, fmt, t, converterDeBRL, converterParaBRL }) {
  const [filtroPaisCliente, setFiltroPaisCliente] = useState('todos');
  const [buscaClienteTexto, setBuscaClienteTexto] = useState('');
  
  const [modalClienteAberto, setModalClienteAberto] = useState(false);
  const [clienteEmEdicao, setClienteEmEdicao] = useState(null);
  
  // MODAL DE RECEBIMENTO DE FIADO (CONTAS)
  const [modalReceberFiadoAberto, setModalReceberFiadoAberto] = useState(false);
  const [clienteReceberFiado, setClienteReceberFiado] = useState(null);
  const [valorAmortizacaoInput, setValorAmortizacaoInput] = useState('');
  const [formaAmortizacaoSel, setFormaAmortizacaoSel] = useState('Dinheiro / Caixa');

  const [formCliente, setFormCliente] = useState(normalizarCliente({}));
  const inputValorAmortizacaoRef = useRef(null);

  const totalEmFiadoAbertoBRL = clientes.reduce((acc, c) => acc + (c.saldoDevedorBRL || 0), 0);

  const clientesListaFiltrada = clientes.filter(c => {
    if (!c) return false;
    const batePais = filtroPaisCliente === 'todos' || (filtroPaisCliente === 'com_divida' ? (c.saldoDevedorBRL || 0) > 0 : c.pais === filtroPaisCliente);
    const texto = buscaClienteTexto.toLowerCase().trim();
    const nomeLower = (c.nome || '').toLowerCase();
    const docLower = (c.documento || '').toLowerCase();
    const telLower = (c.telefone || '').toLowerCase();
    const bateTexto = texto === '' || nomeLower.includes(texto) || docLower.includes(texto) || telLower.includes(texto);
    return batePais && bateTexto;
  });

  const abrirCadastroNovoCliente = () => {
    setClienteEmEdicao(null);
    setFormCliente(normalizarCliente({ pais: 'BR', tipoDocumento: 'CPF', perfilPreco: 'preco1' }));
    setModalClienteAberto(true);
  };

  const abrirEdicaoCliente = (cli) => {
    setClienteEmEdicao(cli);
    setFormCliente({ 
      ...normalizarCliente(cli), 
      limiteCreditoBRL: (cli.limiteCreditoBRL ?? 1000).toString(), 
      diasAtraso: (cli.diasAtraso ?? 0).toString() 
    });
    setModalClienteAberto(true);
  };

  const salvarCliente = () => {
    if (!formCliente.nome || !formCliente.nome.trim()) return alert('Por favor, informe o nome do cliente.');
    const limiteNum = Math.max(0, parseFloat(String(formCliente.limiteCreditoBRL).replace(',', '.')) || 0);
    const diasNum = Math.max(0, parseInt(formCliente.diasAtraso) || 0);
    const dadosFinais = normalizarCliente({ ...formCliente, limiteCreditoBRL: limiteNum, diasAtraso: diasNum });

    if (clienteEmEdicao) { 
      setClientes(clientes.map(c => c.id === clienteEmEdicao.id ? dadosFinais : c)); 
    } else { 
      setClientes([dadosFinais, ...clientes]); 
    }
    setModalClienteAberto(false);
  };

  const excluirCliente = (id, saldoDevedor) => {
    if (saldoDevedor > 0) {
      return alert('Não é possível excluir um cliente que possui saldo devedor (fiado) em aberto.');
    }
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      setClientes(clientes.filter(c => c.id !== id));
    }
  };

  // FLUXO DE RECEBER CONTA / FIADO
  const abrirRecebimentoFiado = (cli) => {
    setClienteReceberFiado(cli);
    setValorAmortizacaoInput(cli.saldoDevedorBRL > 0 ? String(cli.saldoDevedorBRL) : '');
    setFormaAmortizacaoSel('Dinheiro / Caixa');
    setModalReceberFiadoAberto(true);
  };

  const confirmarRecebimentoFiado = () => {
    const valBRL = converterParaBRL(parseFloat(valorAmortizacaoInput.replace(',', '.')) || 0, moeda);
    if (valBRL <= 0) return alert('Informe um valor válido para recebimento.');

    if (valBRL > clienteReceberFiado.saldoDevedorBRL) {
      if (!window.confirm('O valor recebido é maior do que a dívida atual. Deseja continuar e zerar o saldo?')) return;
    }

    setClientes(clientes.map(c => {
      if (c.id === clienteReceberFiado.id) {
        const novoSaldo = Math.max(0, (c.saldoDevedorBRL || 0) - valBRL);
        return { ...c, saldoDevedorBRL: novoSaldo };
      }
      return c;
    }));

    alert(`Recebimento de ${fmt(valBRL, moeda)} registrado com sucesso!`);
    setModalReceberFiadoAberto(false);
    setClienteReceberFiado(null);
  };

  const abrirWhatsApp = (cli) => {
    if (!cli.telefone) return alert('Cliente sem telefone.');
    const msg = encodeURIComponent(`Olá, ${cli.nome}! O saldo da sua conta é de R$ ${(cli.saldoDevedorBRL || 0).toFixed(2)}.`);
    window.open(`https://wa.me/${cli.telefone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{t('clientesTitulo')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{t('clientesSub')}</span>
        </div>
        <button onClick={abrirCadastroNovoCliente} type="button" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', border: '1px solid #fbbf24', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(217, 119, 6, 0.3)' }}>
          {t('novoClienteBtn')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{t('totalFiado')}</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: totalEmFiadoAbertoBRL > 0 ? '#fb7185' : '#34d399', marginTop: '6px' }}>{fmt(totalEmFiadoAbertoBRL, 'BRL')}</div>
        </div>
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{t('clientesCadastrados')}</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#f8fafc', marginTop: '6px' }}>{clientes.length}</div>
        </div>
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{t('contasAbertas')}</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#fbbf24', marginTop: '6px' }}>{clientes.filter(c => (c.saldoDevedorBRL || 0) > 0).length}</div>
        </div>
        <div style={{ backgroundColor: '#0b1120', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: '16px', padding: '20px' }}>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase' }}>{t('limiteTotal')}</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', marginTop: '6px' }}>{fmt(clientes.reduce((acc, c) => acc + (c.limiteCreditoBRL || 0), 0), 'BRL')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '16px 20px', borderRadius: '16px', border: '1px solid #1e293b', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[{ id: 'todos', r: t('todosClientes') }, { id: 'com_divida', r: `⚠️ ${t('comDivida')}` }].map(f => (
            <button key={f.id} onClick={() => setFiltroPaisCliente(f.id)} type="button" style={{ backgroundColor: filtroPaisCliente === f.id ? '#451a03' : '#020617', color: filtroPaisCliente === f.id ? '#fbbf24' : '#94a3b8', border: `1px solid ${filtroPaisCliente === f.id ? '#d97706' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>{f.r}</button>
          ))}
        </div>
        <input type="text" value={buscaClienteTexto} onChange={(e) => setBuscaClienteTexto(e.target.value)} placeholder={t('buscarCli')} style={{ width: '320px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '8px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }} />
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <th style={{ padding: '16px 20px', width: '22%' }}>{t('clienteRazao')}</th>
                <th style={{ padding: '16px 12px', width: '14%' }}>{t('documento')}</th>
                <th style={{ padding: '16px 12px', width: '18%' }}>{t('contatoWhats')}</th>
                <th style={{ padding: '16px 12px', width: '14%' }}>{t('tabela')}</th>
                <th style={{ padding: '16px 12px', width: '10%', textAlign: 'right' }}>{t('limite')}</th>
                <th style={{ padding: '16px 12px', width: '10%', textAlign: 'right' }}>{t('saldoDevedor')}</th>
                <th style={{ padding: '16px 12px', width: '12%', textAlign: 'center' }}>{t('situacao')}</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>{t('acoes')}</th>
              </tr>
            </thead>
            <tbody>
              {clientesListaFiltrada.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>{t('nenhumCli')}</td></tr>
              ) : (
                clientesListaFiltrada.map((cli) => {
                  const saldoDevedor = cli.saldoDevedorBRL || 0; const limiteCredito = cli.limiteCreditoBRL || 0;
                  const temDivida = saldoDevedor > 0; const estourouLimite = saldoDevedor > limiteCredito; const dias = cli.diasAtraso || 0;

                  return (
                    <tr key={cli.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 20px' }}><div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '14px' }}>{cli.nome}</div></td>
                      <td style={{ padding: '16px 12px', fontFamily: 'monospace', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '11px', color: '#818cf8', marginRight: '6px', fontWeight: 800 }}>{cli.tipoDocumento}</span>{cli.documento || '—'}
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#ffffff', fontWeight: 600 }}>{cli.telefone || '—'}</span>
                          {cli.telefone && (
                            <button onClick={() => abrirWhatsApp(cli)} type="button" title="WhatsApp" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>💬</span><span>WhatsApp</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ backgroundColor: cli.perfilPreco === 'preco2' ? '#082f49' : '#020617', color: cli.perfilPreco === 'preco2' ? '#38bdf8' : '#94a3b8', border: '1px solid #334155', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, display: 'inline-block' }}>
                          {cli.perfilPreco === 'preco2' ? t('tabelaPintor') : t('tabelaBalcao')}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmt(limiteCredito, 'BRL')}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: temDivida ? '#fb7185' : '#34d399', fontSize: '15px', whiteSpace: 'nowrap' }}>{fmt(saldoDevedor, 'BRL')}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {estourouLimite ? <span style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', border: '1px solid #f43f5e', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>🔴 {t('limiteExcedido')}</span>
                        : dias > 0 ? <span style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', border: '1px solid #f43f5e', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 900 }}>🔴 {dias}D {t('diasAtraso')}</span>
                        : temDivida ? <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid #d97706', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>🟡 {t('aberto')}</span>
                        : <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid #10b981', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>🟢 {t('emDia')}</span>}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                          {temDivida && (
                            <button onClick={() => abrirRecebimentoFiado(cli)} type="button" style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', color: '#34d399', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>
                              Receber Conta
                            </button>
                          )}
                          <button onClick={() => abrirEdicaoCliente(cli)} type="button" style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{t('editar')}</button>
                          <button onClick={() => excluirCliente(cli.id, cli.saldoDevedorBRL)} type="button" style={{ backgroundColor: 'transparent', border: '1px solid #1e293b', color: '#f43f5e', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE CLIENTE (UNIVERSAL) */}
      {modalClienteAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #d97706', borderRadius: '24px', width: '100%', maxWidth: '520px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>CRM Zênite OS</span>
                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0' }}>{clienteEmEdicao ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</h3>
              </div>
              <button onClick={() => setModalClienteAberto(false)} type="button" style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px', maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Nome Completo / Empresa *</label>
                <input type="text" value={formCliente.nome} onChange={e => setFormCliente({ ...formCliente, nome: e.target.value })} placeholder="Ex: Pinturas Silva" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>País / Região</label>
                  <select value={formCliente.pais} onChange={e => setFormCliente({ ...formCliente, pais: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}>
                    <option value="BR">Brasil (BR)</option>
                    <option value="PY">Paraguai (PY)</option>
                    <option value="AR">Argentina (AR)</option>
                    <option value="US">Estados Unidos (US)</option>
                    <option value="OUTRO">Outro / Internacional</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Tipo de Documento</label>
                  <select value={formCliente.tipoDocumento} onChange={e => setFormCliente({ ...formCliente, tipoDocumento: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}>
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="CI / RUC">CI / RUC</option>
                    <option value="PASSAPORTE">Passaporte</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Número do Documento</label>
                  <input type="text" value={formCliente.documento} onChange={e => setFormCliente({ ...formCliente, documento: e.target.value })} placeholder="000.000.000-00" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Telefone / WhatsApp</label>
                  <input type="text" value={formCliente.telefone} onChange={e => setFormCliente({ ...formCliente, telefone: e.target.value })} placeholder="(00) 00000-0000" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Endereço Completo</label>
                <input type="text" value={formCliente.endereco} onChange={e => setFormCliente({ ...formCliente, endereco: e.target.value })} placeholder="Rua, Número, Bairro, Cidade" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Tabela de Preços</label>
                  <select value={formCliente.perfilPreco} onChange={e => setFormCliente({ ...formCliente, perfilPreco: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}>
                    <option value="preco1">Tabela 1 (Balcão / Padrão)</option>
                    <option value="preco2">Tabela 2 (Pintor / Atacado)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Limite de Crédito ({moeda})</label>
                  <input type="text" value={formCliente.limiteCreditoBRL} onChange={e => setFormCliente({ ...formCliente, limiteCreditoBRL: e.target.value })} placeholder="1000.00" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #38bdf8', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <button onClick={salvarCliente} type="button" style={{ width: '100%', background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', color: '#fff', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(217, 119, 6, 0.3)' }}>
              {clienteEmEdicao ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RECEBER CONTA / QUITAR FIADO */}
      {modalReceberFiadoAberto && clienteReceberFiado && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #10b981', borderRadius: '24px', width: '420px', padding: '28px', color: '#fff' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px 0', color: '#34d399' }}>Receber Conta de Cliente</h3>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '16px' }}>{clienteReceberFiado.nome}</div>
            
            <div style={{ backgroundColor: '#020617', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Dívida Atual:</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#fb7185' }}>{fmt(clienteReceberFiado.saldoDevedorBRL, moeda)}</div>
              </div>
            </div>
            
            <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>Valor a Receber / Quitar ({moeda}):</label>
            <input type="text" ref={inputValorAmortizacaoRef} value={valorAmortizacaoInput} onChange={e => setValorAmortizacaoInput(e.target.value)} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '12px', color: '#34d399', fontSize: '24px', fontWeight: 900, textAlign: 'center', padding: '14px', outline: 'none', marginTop: '8px', marginBottom: '16px', boxSizing: 'border-box' }} autoFocus />

            <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>Forma de Recebimento:</label>
            <select value={formaAmortizacaoSel} onChange={e => setFormaAmortizacaoSel(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '6px', marginBottom: '24px', boxSizing: 'border-box' }}>
              <option value="Dinheiro / Caixa">💵 Dinheiro (Entra na Gaveta)</option>
              <option value="Pix">📲 Pix</option>
              <option value="Cartão">💳 Cartão de Crédito/Débito</option>
            </select>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalReceberFiadoAberto(false)} type="button" style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarRecebimentoFiado} type="button" style={{ flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>Baixar e Quitar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}