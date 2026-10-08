import React, { useState, useRef } from 'react';
import { normalizarCliente } from '../data';
import ZenModal from './ZenModal';
import { formaEhDinheiro, lancamentosDoCliente } from '../core/financialLedger';

export default function Clientes({ commitOperacaoNegocio, livroFinanceiro = [], registrarFinanceiro, caixaMovimentos = [], setCaixaMovimentos, sessaoAtiva, operadorAtivo, clientes, setClientes, moeda, fmt, t, converterDeBRL, converterParaBRL }) {
  const [filtroPaisCliente, setFiltroPaisCliente] = useState('todos');
  const [buscaClienteTexto, setBuscaClienteTexto] = useState('');
  
  const [modalClienteAberto, setModalClienteAberto] = useState(false);
  const [clienteEmEdicao, setClienteEmEdicao] = useState(null);
  
  // MODAL DE RECEBIMENTO DE FIADO (CONTAS) COM CATÁLOGO COMPLETO
  const [modalReceberFiadoAberto, setModalReceberFiadoAberto] = useState(false);
  const [clienteReceberFiado, setClienteReceberFiado] = useState(null);
  const [valorAmortizacaoInput, setValorAmortizacaoInput] = useState('');
  const [formaAmortizacaoSel, setFormaAmortizacaoSel] = useState('dinheiro_brl');
  const [clienteExtrato, setClienteExtrato] = useState(null);
  const [modalZen, setModalZen] = useState(null);

  const catalogoFormas = [
    { id: 'dinheiro_brl', rotulo: 'Dinheiro (R$)', moedaOrigem: 'BRL', icone: '💵' }, 
    { id: 'dinheiro_usd', rotulo: 'Dólar ($)', moedaOrigem: 'USD', icone: '💵' },
    { id: 'dinheiro_pyg', rotulo: 'Guarani (₲)', moedaOrigem: 'PYG', icone: '💵' }, 
    { id: 'dinheiro_eur', rotulo: 'Euro (€)', moedaOrigem: 'EUR', icone: '💶' },
    { id: 'pix', rotulo: 'Pix QR Code', moedaOrigem: 'BRL', icone: '⚡' }, 
    { id: 'cartaoCredito', rotulo: 'Cartão Crédito', moedaOrigem: 'BRL', icone: '💳' },
    { id: 'cartaoDebito', rotulo: 'Cartão Débito', moedaOrigem: 'BRL', icone: '💳' }, 
    { id: 'voucher', rotulo: 'Voucher / Vale', moedaOrigem: 'BRL', icone: '🎟️' },
    { id: 'cheque', rotulo: 'Cheque', moedaOrigem: 'BRL', icone: '📝' }
  ];

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

  const salvarCliente = async () => {
    if (!formCliente.nome || !formCliente.nome.trim()) return setModalZen({ variante:'warning', titulo:'Nome obrigatório', mensagem:'Informe o nome do cliente antes de salvar.', apenasConfirmar:true });
    const limiteNum = Math.max(0, parseFloat(String(formCliente.limiteCreditoBRL).replace(',', '.')) || 0);
    const diasNum = Math.max(0, parseInt(formCliente.diasAtraso) || 0);
    const dadosFinais = normalizarCliente({ ...formCliente, limiteCreditoBRL: limiteNum, diasAtraso: diasNum });
    const listaProposta = clienteEmEdicao
      ? clientes.map(c => c.id === clienteEmEdicao.id ? dadosFinais : c)
      : [dadosFinais, ...clientes];
    try {
      let clientesConfirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({ changes:[{ field:'clientes', value:listaProposta, storageSuffix:'clientes' }] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o cliente.');
        clientesConfirmados = confirmado.values?.clientes || listaProposta;
      }
      setClientes(clientesConfirmados);
      setModalClienteAberto(false);
    } catch (erro) {
      setModalZen({ variante:'danger', titulo:'Cliente não salvo', mensagem:'A nuvem não confirmou o cadastro. Nenhuma alteração foi considerada concluída.', detalhes:[erro?.message || 'Falha de persistência'], apenasConfirmar:true });
    }
  };

  const excluirCliente = (id, saldoDevedor) => {
    if (saldoDevedor > 0) {
      return setModalZen({ variante:'danger', titulo:'Exclusão bloqueada', mensagem:'Não é possível excluir um cliente que possui saldo devedor (fiado) em aberto.', apenasConfirmar:true });
    }
    setModalZen({
      variante:'warning',
      titulo:'Excluir cliente?',
      mensagem:'Confirme a exclusão deste cadastro de cliente.',
      confirmarTexto:'Excluir',
      cancelarTexto:'Cancelar',
      apenasConfirmar:false,
      aoConfirmar: async () => {
        const listaProposta = clientes.filter(c => c.id !== id);
        try {
          let clientesConfirmados = listaProposta;
          if (typeof commitOperacaoNegocio === 'function') {
            const confirmado = await commitOperacaoNegocio({ changes:[{ field:'clientes', value:listaProposta, storageSuffix:'clientes' }] });
            if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a exclusão.');
            clientesConfirmados = confirmado.values?.clientes || listaProposta;
          }
          setClientes(clientesConfirmados);
        } catch (erro) {
          setModalZen({ variante:'danger', titulo:'Cliente não excluído', mensagem:'A nuvem não confirmou a exclusão. O cadastro foi preservado.', detalhes:[erro?.message || 'Falha de persistência'], apenasConfirmar:true });
        }
      },
    });
  };

  // FLUXO DE RECEBER CONTA / FIADO
  const abrirRecebimentoFiado = (cli) => {
    setClienteReceberFiado(cli);
    setValorAmortizacaoInput(cli.saldoDevedorBRL > 0 ? String(cli.saldoDevedorBRL) : '');
    setFormaAmortizacaoSel('dinheiro_brl');
    setModalReceberFiadoAberto(true);
  };

  const confirmarRecebimentoFiado = async () => {
    const formaCfg = catalogoFormas.find(f => f.id === formaAmortizacaoSel) || catalogoFormas[0];
    const valorOriginal = parseFloat(valorAmortizacaoInput.replace(',', '.')) || 0;
    const valBRL = converterParaBRL(valorOriginal, formaCfg.moedaOrigem || moeda);
    if (valBRL <= 0) return setModalZen({ variante:'warning', titulo:'Valor inválido', mensagem:'Informe um valor válido para recebimento.', apenasConfirmar:true });

    const saldoAntes = Number(clienteReceberFiado?.saldoDevedorBRL || 0);
    if (valBRL > saldoAntes + 0.001) {
      return setModalZen({ variante:'warning', titulo:'Valor acima da dívida', mensagem:`A dívida atual é ${fmt(saldoAntes, 'BRL')}. O recebimento não pode ultrapassar esse saldo.`, apenasConfirmar:true });
    }

    const dinheiroFisico = formaEhDinheiro(formaAmortizacaoSel);
    if (dinheiroFisico && !sessaoAtiva) {
      return setModalZen({ variante:'danger', titulo:'Caixa fechado', mensagem:'Para receber fiado em dinheiro, abra primeiro o turno de caixa do operador.', apenasConfirmar:true });
    }

    const saldoDepois = Math.max(0, saldoAntes - valBRL);
    const recebimentoId = `REC-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const clientesPropostos = clientes.map(c => c.id === clienteReceberFiado.id ? { ...c, saldoDevedorBRL: saldoDepois } : c);
    const mov = dinheiroFisico ? {
      id: `MOV-${recebimentoId}`,
      sessaoId: sessaoAtiva.id,
      createdAt,
      dataHora: new Date(createdAt).toLocaleString('pt-BR'),
      tipo: 'recebimento_fiado',
      direcao: 'entrada',
      afetaGaveta: true,
      valorBRL: valBRL,
      detalhesMoedas: { [formaCfg.moedaOrigem || 'BRL']: valorOriginal },
      descricao: `Recebimento fiado • ${clienteReceberFiado.nome}`,
      clienteId: clienteReceberFiado.id,
      operador: operadorAtivo?.nome || 'Administrador',
    } : null;
    const caixaProposto = mov ? [mov, ...(caixaMovimentos || [])] : caixaMovimentos;
    const financeiro = {
      id: recebimentoId,
      tipo: 'recebimento_fiado',
      origem: 'clientes',
      referenciaId: recebimentoId,
      valor: valBRL,
      formaPagamento: formaAmortizacaoSel,
      createdAt,
      afetaCaixaFisico: dinheiroFisico,
      afetaResultado: false,
      direcao: 'entrada',
      sessaoId: sessaoAtiva?.id || null,
      clienteId: clienteReceberFiado.id,
      clienteNome: clienteReceberFiado.nome,
      saldoClienteAntes: saldoAntes,
      saldoClienteDepois: saldoDepois,
      observacao: `Recebimento de conta do cliente ${clienteReceberFiado.nome}`,
      operadorId: operadorAtivo?.id || 'admin',
      operadorNome: operadorAtivo?.nome || 'Administrador',
    };

    try {
      let clientesConfirmados = clientesPropostos;
      let caixaConfirmado = caixaProposto;
      if (typeof commitOperacaoNegocio === 'function') {
        const changes = [{ field:'clientes', value:clientesPropostos, storageSuffix:'clientes' }];
        if (mov) changes.push({ field:'caixaMovimentos', value:caixaProposto, storageSuffix:'caixa_movs' });
        const confirmado = await commitOperacaoNegocio({ changes, financialEntries:[financeiro] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o recebimento.');
        clientesConfirmados = confirmado.values?.clientes || clientesPropostos;
        caixaConfirmado = confirmado.values?.caixaMovimentos || caixaProposto;
      } else if (typeof registrarFinanceiro === 'function') {
        await registrarFinanceiro(financeiro);
      }
      setClientes(clientesConfirmados);
      if (mov && typeof setCaixaMovimentos === 'function') setCaixaMovimentos(caixaConfirmado);
    } catch (err) {
      console.error('[ZenOS][ATT10.2] Falha no recebimento:', err);
      return setModalZen({ variante:'danger', titulo:'Recebimento não concluído', mensagem:'A nuvem não confirmou o recebimento. Nenhum saldo foi alterado.', detalhes:[err?.message || 'Falha de persistência'], apenasConfirmar:true });
    }

    setModalZen({ variante:'success', titulo:'Recebimento registrado', mensagem:`${fmt(valBRL, 'BRL')} recebidos de ${clienteReceberFiado.nome}.`, detalhes:[`Saldo anterior: ${fmt(saldoAntes, 'BRL')}`, `Saldo atual: ${fmt(saldoDepois, 'BRL')}`, dinheiroFisico ? 'Entrada registrada na gaveta do turno.' : 'Recebimento financeiro sem movimentar a gaveta física.'], apenasConfirmar:true });
    setModalReceberFiadoAberto(false);
    setClienteReceberFiado(null);
  };

  const abrirWhatsApp = (cli) => {
    if (!cli.telefone) return setModalZen({ variante:'warning', titulo:'Telefone não cadastrado', mensagem:'Este cliente não possui telefone/WhatsApp cadastrado.', apenasConfirmar:true });
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
                          <button onClick={() => setClienteExtrato(cli)} type="button" style={{ backgroundColor: '#111827', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>📒 Extrato</button>
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

      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto||'OK'} cancelarTexto={modalZen?.cancelarTexto||'Cancelar'} apenasConfirmar={modalZen?.apenasConfirmar} onConfirmar={()=>{ const fn=modalZen?.aoConfirmar; setModalZen(null); if(fn) fn(); }} onCancelar={()=>setModalZen(null)} />

      {clienteExtrato && (() => {
        const linhas = lancamentosDoCliente(livroFinanceiro, clienteExtrato.id);
        return <div style={{ position:'fixed', inset:0, zIndex:1800, background:'rgba(2,6,23,.88)', backdropFilter:'blur(7px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ width:'100%', maxWidth:900, maxHeight:'82vh', overflow:'hidden', background:'#0b1120', border:'1px solid #38bdf8', borderRadius:22, color:'#fff', boxShadow:'0 30px 80px rgba(0,0,0,.55)' }}>
            <div style={{ padding:22, borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
              <div><div style={{ color:'#38bdf8', fontSize:11, fontWeight:900, letterSpacing:1 }}>CONTA CORRENTE DO CLIENTE</div><h3 style={{ margin:'4px 0 0', fontSize:20 }}>{clienteExtrato.nome}</h3><div style={{ color:'#94a3b8', fontSize:12, marginTop:4 }}>Saldo atual cadastrado: <strong style={{color:'#fb7185'}}>{fmt(clienteExtrato.saldoDevedorBRL||0,'BRL')}</strong></div></div>
              <button onClick={()=>setClienteExtrato(null)} style={{width:36,height:36,borderRadius:9,border:'1px solid #334155',background:'#020617',color:'#94a3b8',cursor:'pointer'}}>✕</button>
            </div>
            <div style={{ padding:14, color:'#94a3b8', fontSize:11, borderBottom:'1px solid #1e293b' }}>O extrato auditável começa com os novos lançamentos da ATT 07. O histórico anterior não é reconstruído por inferência.</div>
            <div style={{ overflow:'auto', maxHeight:'58vh' }}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:760}}><thead><tr style={{color:'#64748b',textTransform:'uppercase',fontSize:10,borderBottom:'1px solid #1e293b'}}><th style={{padding:12,textAlign:'left'}}>Data</th><th style={{textAlign:'left'}}>Tipo</th><th style={{textAlign:'left'}}>Descrição</th><th style={{textAlign:'right'}}>Débito</th><th style={{textAlign:'right'}}>Crédito</th><th style={{textAlign:'right'}}>Saldo</th><th style={{textAlign:'left',paddingLeft:14}}>Forma / Operador</th></tr></thead><tbody>
              {linhas.length===0 ? <tr><td colSpan="7" style={{padding:30,textAlign:'center',color:'#475569'}}>Nenhum lançamento ATT 07 para este cliente.</td></tr> : linhas.map(l=>{ const aumenta=l.tipo==='venda_fiada'; const reduz=l.tipo==='recebimento_fiado'||(l.tipo==='devolucao'&&l.formaPagamento==='credito_fiado'); return <tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,.05)'}}><td style={{padding:12,color:'#94a3b8'}}>{l.createdAt?new Date(l.createdAt).toLocaleString('pt-BR'):'—'}</td><td style={{fontWeight:800,color:aumenta?'#fb7185':'#34d399'}}>{l.tipo}</td><td>{l.observacao||l.referenciaId}</td><td style={{textAlign:'right',color:'#fb7185'}}>{aumenta?fmt(l.valor,'BRL'):'—'}</td><td style={{textAlign:'right',color:'#34d399'}}>{reduz?fmt(l.valor,'BRL'):'—'}</td><td style={{textAlign:'right',fontWeight:900}}>{l.saldoClienteDepois==null?'—':fmt(l.saldoClienteDepois,'BRL')}</td><td style={{paddingLeft:14,color:'#94a3b8'}}>{l.formaPagamento}<br/><span style={{fontSize:10}}>{l.operadorNome}</span></td></tr>})}
              </tbody></table>
            </div>
          </div>
        </div>;
      })()}

      {/* MODAL DE RECEBER CONTA / QUITAR FIADO COM CATÁLOGO COMPLETO */}
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
              {catalogoFormas.map(f => (
                <option key={f.id} value={f.id}>
                  {f.icone} {f.rotulo}
                </option>
              ))}
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
