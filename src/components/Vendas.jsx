import React, { useState } from 'react';

export default function Vendas({ historicoVendas, setHistoricoVendas, produtos, setProdutos, clientes, setClientes, fmt, t, tx, patenteUsuario, moeda, converterDeBRL }) {
  const [vendaExpandida, setVendaExpandida] = useState(null);
  const [cupomParaImprimir, setCupomParaImprimir] = useState(null);

  const [modalDevolucaoAberto, setModalDevolucaoAberto] = useState(false);
  const [vendaSendoDevolvida, setVendaSendoDevolvida] = useState(null);
  const [itensParaDevolver, setItensParaDevolver] = useState({});
  const [metodoReembolso, setMetodoReembolso] = useState('dinheiro');

  const iniciarDevolucao = (venda) => {
    if (patenteUsuario !== 'gerencia') return alert(tx('Acesso Negado: Apenas a Gerência pode processar devoluções.', 'Acceso Denegado: Solo Gerencia puede procesar devoluciones.', 'Access Denied.'));
    if (venda.estado === 'cancelada') return alert(tx('Esta venda já foi totalmente cancelada.', 'Esta venta ya fue cancelada.', 'Already canceled.'));
    
    setVendaSendoDevolvida(venda);
    const itensIniciais = {};
    venda.itens.forEach(it => {
      const qtdOriginal = parseInt(it.qtd) || 0;
      const qtdJaDevolvida = parseInt(it.qtdDevolvida) || 0;
      itensIniciais[it.id] = {
        qtdOriginal: qtdOriginal,
        qtdJaDevolvida: qtdJaDevolvida,
        qtdDisponivel: qtdOriginal - qtdJaDevolvida,
        qtdSendoDevolvidaAgora: 0,
        precoBRL: parseFloat(it.precoPraticadoBRL) || 0,
        nome: it.nome,
        usoUnicoEncomendado: it.usoUnicoEncomendado || false,
        tipoItem: it.tipoItem || 'mercadoria'
      };
    });
    setItensParaDevolver(itensIniciais);
    setMetodoReembolso('dinheiro');
    setModalDevolucaoAberto(true);
  };

  const alterarQtdDevolucao = (id, delta) => {
    setItensParaDevolver(prev => {
      const item = prev[id];
      const novaQtd = Math.max(0, Math.min(item.qtdDisponivel, item.qtdSendoDevolvidaAgora + delta));
      return { ...prev, [id]: { ...item, qtdSendoDevolvidaAgora: novaQtd } };
    });
  };

  const selecionarTodosParaDevolver = () => {
    setItensParaDevolver(prev => {
      const novo = { ...prev };
      Object.keys(novo).forEach(id => { novo[id].qtdSendoDevolvidaAgora = novo[id].qtdDisponivel; });
      return novo;
    });
  };

  const calcularTotalDevolucaoBRL = () => {
    return Object.values(itensParaDevolver).reduce((acc, item) => acc + (item.qtdSendoDevolvidaAgora * item.precoBRL), 0);
  };

  const confirmarDevolucao = () => {
    const totalEstornoBRL = calcularTotalDevolucaoBRL();
    if (totalEstornoBRL <= 0) return alert(tx('Selecione pelo menos 1 item para devolver.', 'Seleccione al menos 1 ítem.', 'Select at least 1 item.'));

    if (!window.confirm(tx(`Total a devolver: ${fmt(totalEstornoBRL, 'BRL')}\n\nConfirma o estorno?`, `Total a devolver: ${fmt(totalEstornoBRL, 'BRL')}\n\n¿Confirma la devolución?`, `Total to refund: ${fmt(totalEstornoBRL, 'BRL')}\n\nConfirm refund?`))) return;

    let novosProdutos = [...produtos];
    Object.keys(itensParaDevolver).forEach(itemId => {
      const itemDev = itensParaDevolver[itemId];
      if (itemDev.qtdSendoDevolvidaAgora > 0 && itemDev.tipoItem !== 'servico' && !itemDev.usoUnicoEncomendado) {
        const prodIndex = novosProdutos.findIndex(p => String(p.id) === String(itemId));
        if (prodIndex !== -1) {
          novosProdutos[prodIndex] = { ...novosProdutos[prodIndex], estoque: (parseInt(novosProdutos[prodIndex].estoque) || 0) + itemDev.qtdSendoDevolvidaAgora };
        }
      }
    });
    setProdutos(novosProdutos);
    localStorage.setItem('zenos_produtos', JSON.stringify(novosProdutos));

    if (metodoReembolso === 'credito_fiado') {
      if (!vendaSendoDevolvida.clienteId) return alert('Esta venda não tem cliente. Escolha Dinheiro ou Voucher.');
      const novosClientes = clientes.map(c => c.id === vendaSendoDevolvida.clienteId ? { ...c, saldoDevedorBRL: Math.max(0, (parseFloat(c.saldoDevedorBRL) || 0) - totalEstornoBRL) } : c);
      setClientes(novosClientes);
      localStorage.setItem('zenos_clientes', JSON.stringify(novosClientes));
    } else if (metodoReembolso === 'voucher') {
      alert(`✅ VOUCHER: VALE-${Date.now().toString().slice(-6)}\nValor: ${fmt(totalEstornoBRL, 'BRL')}`);
    }

    const novoHistorico = historicoVendas.map(venda => {
      if (venda.id === vendaSendoDevolvida.id) {
        const novosItens = venda.itens.map(it => {
          const dadosDev = itensParaDevolver[it.id];
          if (dadosDev && dadosDev.qtdSendoDevolvidaAgora > 0) {
            return { ...it, qtdDevolvida: (parseInt(it.qtdDevolvida) || 0) + dadosDev.qtdSendoDevolvidaAgora };
          }
          return it;
        });

        const tudoDevolvido = novosItens.every(it => (parseInt(it.qtdDevolvida) || 0) >= (parseInt(it.qtd) || 0));
        const parcialmenteDevolvido = novosItens.some(it => (parseInt(it.qtdDevolvida) || 0) > 0);
        let novoEstado = venda.estado;
        if (tudoDevolvido) novoEstado = 'cancelada'; 
        else if (parcialmenteDevolvido) novoEstado = 'parcial';

        return { ...venda, itens: novosItens, estado: novoEstado };
      }
      return venda;
    });

    setHistoricoVendas(novoHistorico);
    localStorage.setItem('zenos_historico_vendas', JSON.stringify(novoHistorico));

    setModalDevolucaoAberto(false);
    setVendaSendoDevolvida(null);
    setItensParaDevolver({});
  };

  const executarImpressaoNativa = () => {
    const elementoCupom = document.getElementById('area-cupom-reimpressao');
    if (!elementoCupom) return;
    const janelaImpressao = window.open('', '_blank', 'width=400,height=600');
    if (!janelaImpressao) return alert('Bloqueador de pop-ups ativo. Permita pop-ups.');
    janelaImpressao.document.write(`
      <!DOCTYPE html><html><head><title>Cupom - 2a Via</title><style>@page{margin:0;size:80mm auto;}body{font-family:'Courier New',Courier,monospace;font-size:12px;color:#000;background:#fff;margin:0;padding:10px;width:80mm;box-sizing:border-box;}table{width:100%;border-collapse:collapse;font-size:11px;}th,td{padding:3px 0;}</style></head>
      <body>${elementoCupom.innerHTML}<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script></body></html>
    `);
    janelaImpressao.document.close();
  };

  if (cupomParaImprimir) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
        <div style={{ backgroundColor: '#fff', color: '#000', borderRadius: '12px', width: '100%', maxWidth: '350px', padding: '0', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div id="area-cupom-reimpressao" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}><h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>ZÊNITE ATACADÃO DE TINTAS</h2><div style={{ fontSize: '10px' }}>Cupom Não Fiscal - 2ª Via<br/>{cupomParaImprimir.dataHora}</div></div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ marginBottom: '8px', fontSize: '11px' }}><strong>Comanda:</strong> {cupomParaImprimir.id}<br/><strong>Cliente:</strong> {cupomParaImprimir.clienteNome || 'Consumidor Balcão'}</div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
              <thead><tr><th style={{ paddingBottom: '4px' }}>Qtd</th><th style={{ paddingBottom: '4px' }}>Item</th><th style={{ textAlign: 'right', paddingBottom: '4px' }}>Vl.Un</th><th style={{ textAlign: 'right', paddingBottom: '4px' }}>Total</th></tr></thead>
              <tbody>
                {cupomParaImprimir.itens.map((it, idx) => (
                  <tr key={idx}><td style={{ verticalAlign: 'top', paddingRight: '4px' }}>{it.qtd}</td><td style={{ verticalAlign: 'top' }}>{(it.nome || '').substring(0, 16)}</td><td style={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt(it.precoPraticadoBRL || 0)}</td><td style={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt((it.precoPraticadoBRL || 0) * (parseInt(it.qtd) || 1))}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL</span><span>{fmt(cupomParaImprimir.totalBRL)}</span></div>
            <div style={{ marginTop: '10px', fontSize: '11px' }}><strong>Pagamentos:</strong><br/>
              {cupomParaImprimir.pagamentos && cupomParaImprimir.pagamentos.length > 0 ? (
                cupomParaImprimir.pagamentos.map((p, idx) => (<div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.rotulo}</span><span>{fmt(p.valorConvertidoBRL || p.valorOriginal || 0)}</span></div>))
              ) : (<div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{cupomParaImprimir.detalhesPagamento || 'Dinheiro'}</span></div>)}
            </div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ textAlign: 'center', fontSize: '10px' }}>Obrigado pela preferência!<br/>Documento sem valor fiscal.</div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '10px', padding: '20px', backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1' }}>
            <button onClick={executarImpressaoNativa} style={{ flex: 1, padding: '14px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}><span>🖨️</span> {tx('Confirmar Impressão', 'Confirmar Impresión', 'Confirm Print')}</button>
            <button onClick={() => setCupomParaImprimir(null)} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '14px' }}>{tx('Voltar', 'Volver', 'Back')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div className="no-print">
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Histórico de Vendas & Devoluções', 'Historial de Ventas', 'Sales History & Refunds')}</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('Consulte cupons, gerencie estornos parciais, devoluções e emissão de vouchers.', 'Consulte recibos y devoluciones.', 'View receipts and process returns.')}</span>
      </div>

      <div className="no-print" style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#020617' }}>
              <th style={{ padding: '16px 20px' }}>Data / Hora</th>
              <th style={{ padding: '16px 12px' }}>{tx('Comanda', 'Recibo', 'Order')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Cliente', 'Cliente', 'Client')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Meio de Pgto', 'Medio de Pago', 'Payment Method')}</th>
              <th style={{ padding: '16px 12px', textAlign: 'right' }}>Total (R$)</th>
              <th style={{ padding: '16px 12px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>{tx('Ações', 'Acciones', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {historicoVendas.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Nenhuma venda registada até o momento.</td></tr>
            ) : (
              historicoVendas.map(venda => (
                <React.Fragment key={venda.id}>
                  <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: vendaExpandida === venda.id ? '#1e1b4b' : 'transparent', transition: 'all 0.2s' }}>
                    <td style={{ padding: '16px 20px', color: '#cbd5e1' }}>{venda.dataHora}</td>
                    <td style={{ padding: '16px 12px', fontWeight: 800, color: '#38bdf8' }}>{venda.id}</td>
                    <td style={{ padding: '16px 12px', color: '#f8fafc', fontWeight: 700 }}>{venda.clienteNome}</td>
                    <td style={{ padding: '16px 12px', color: '#94a3b8', fontSize: '11px' }}>{venda.detalhesPagamento}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: venda.estado === 'cancelada' ? '#64748b' : '#34d399', fontSize: '15px' }}>{fmt(venda.totalBRL, 'BRL')}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                      {venda.estado === 'cancelada' ? <span style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid #f43f5e', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Cancelada Total', 'Cancelada', 'Canceled')}</span>
                      : venda.estado === 'parcial' ? <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Devolução Parcial', 'Devol. Parcial', 'Partial Return')}</span>
                      : <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid #10b981', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Concluída', 'Concluida', 'Completed')}</span>}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <button onClick={() => setVendaExpandida(vendaExpandida === venda.id ? null : venda.id)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', marginRight: '8px' }}>{tx('Itens', 'Ítems', 'Items')}</button>
                      {venda.estado !== 'cancelada' && (
                        <button onClick={() => iniciarDevolucao(venda)} style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', color: '#fb7185', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>⚙️ {tx('Estorno', 'Devolución', 'Refund')}</button>
                      )}
                    </td>
                  </tr>

                  {vendaExpandida === venda.id && (
                    <tr style={{ backgroundColor: '#020617', borderBottom: '2px solid #38bdf8' }}>
                      <td colSpan="7" style={{ padding: '20px' }}>
                        <div style={{ border: '1px dashed #334155', borderRadius: '12px', padding: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase' }}>Produtos desta Comanda</span>
                            <button onClick={() => setCupomParaImprimir(venda)} style={{ background: '#082f49', border: '1px solid #0284c7', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 800 }}>🖨️ {tx('Re-Imprimir Cupom', 'Re-Imprimir', 'Re-Print')}</button>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textAlign: 'left' }}><th style={{ paddingBottom: '8px' }}>Qtd</th><th style={{ paddingBottom: '8px' }}>Produto</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Vl. Un (R$)</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Total (R$)</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Status Devolução</th></tr></thead>
                            <tbody>
                              {venda.itens.map((it, idx) => {
                                const qtdOriginal = parseInt(it.qtd) || 0;
                                const qtdDevolvida = parseInt(it.qtdDevolvida) || 0;
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1', fontSize: '13px' }}>
                                    <td style={{ padding: '10px 0' }}><strong style={{ color: '#fff' }}>{qtdOriginal}x</strong></td>
                                    <td>{it.nome} {(it.usoUnicoEncomendado || String(it.sku).includes('ENCOMENDA')) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ Encomenda)</span>}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(it.precoPraticadoBRL, 'BRL')}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{fmt(qtdOriginal * (it.precoPraticadoBRL||0), 'BRL')}</td>
                                    <td style={{ textAlign: 'right' }}>
                                      {qtdDevolvida > 0 
                                        ? <span style={{ color: '#fb7185', fontSize: '11px', fontWeight: 800 }}>-{qtdDevolvida} Devolvido(s)</span>
                                        : <span style={{ color: '#64748b', fontSize: '11px' }}>OK</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalDevolucaoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #f43f5e', borderRadius: '24px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', color: '#fff', boxShadow: '0 25px 50px rgba(0,0,0,0.85)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 900, color: '#f43f5e', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Motor de Devoluções (RMA)', 'Motor de Devoluciones', 'Returns Engine')}</span><h3 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0' }}>Estorno de Itens • Comanda {vendaSendoDevolvida?.id}</h3></div>
              <button onClick={() => setModalDevolucaoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>{tx('1. Selecione os itens e quantidades para devolução:', '1. Seleccione ítems y cantidades:', '1. Select items:')}</h4>
                <button onClick={selecionarTodosParaDevolver} style={{ background: 'none', border: '1px solid #0284c7', color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Selecionar Tudo', 'Seleccionar Todo', 'Select All')}</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textAlign: 'left' }}><th style={{ padding: '10px 0' }}>Produto</th><th style={{ textAlign: 'center' }}>Comprado</th><th style={{ textAlign: 'center' }}>Já Devolv.</th><th style={{ textAlign: 'center' }}>Devolver Agora</th><th style={{ textAlign: 'right' }}>Vl. Estorno</th></tr></thead>
                <tbody>
                  {Object.keys(itensParaDevolver).map(itemId => {
                    const item = itensParaDevolver[itemId];
                    return (
                      <tr key={itemId} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '12px 0' }}>{item.nome} {(item.usoUnicoEncomendado || String(item.sku).includes('ENCOMENDA')) && <span style={{ color: '#fbbf24', fontSize: '10px' }}><br/>(Estoque não retorna)</span>}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{item.qtdOriginal}</td>
                        <td style={{ textAlign: 'center', color: '#fb7185' }}>{item.qtdJaDevolvida}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '4px' }}>
                            <button onClick={() => alterarQtdDevolucao(itemId, -1)} disabled={item.qtdSendoDevolvidaAgora === 0} style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: item.qtdSendoDevolvidaAgora === 0 ? '#475569' : '#fff', fontWeight: 900, cursor: item.qtdSendoDevolvidaAgora === 0 ? 'not-allowed' : 'pointer' }}>-</button>
                            <span style={{ fontWeight: 900, fontSize: '15px', width: '30px', textAlign: 'center', color: item.qtdSendoDevolvidaAgora > 0 ? '#38bdf8' : '#94a3b8' }}>{item.qtdSendoDevolvidaAgora}</span>
                            <button onClick={() => alterarQtdDevolucao(itemId, 1)} disabled={item.qtdSendoDevolvidaAgora === item.qtdDisponivel} style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: item.qtdSendoDevolvidaAgora === item.qtdDisponivel ? '#475569' : '#fff', fontWeight: 900, cursor: item.qtdSendoDevolvidaAgora === item.qtdDisponivel ? 'not-allowed' : 'pointer' }}>+</button>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 900, color: (item.qtdSendoDevolvidaAgora * item.precoBRL) > 0 ? '#fb7185' : '#475569', fontSize: '15px' }}>{fmt(item.qtdSendoDevolvidaAgora * item.precoBRL)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#fbbf24' }}>{tx('2. Como deseja reembolsar o cliente?', '2. ¿Cómo reembolsar al cliente?', '2. How to refund?')}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'dinheiro' ? '#1e1b4b' : 'transparent', border: `1px solid ${metodoReembolso === 'dinheiro' ? '#6366f1' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="dinheiro" checked={metodoReembolso === 'dinheiro'} onChange={() => setMetodoReembolso('dinheiro')} /><div><strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>Dinheiro / Pix (Sangria)</strong></div></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'credito_fiado' ? '#451a03' : 'transparent', border: `1px solid ${metodoReembolso === 'credito_fiado' ? '#d97706' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="credito_fiado" checked={metodoReembolso === 'credito_fiado'} onChange={() => setMetodoReembolso('credito_fiado')} disabled={!vendaSendoDevolvida?.clienteId} /><div><strong style={{ display: 'block', fontSize: '13px', color: vendaSendoDevolvida?.clienteId ? '#fff' : '#64748b' }}>Abater do Fiado</strong></div></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'voucher' ? '#064e3b' : 'transparent', border: `1px solid ${metodoReembolso === 'voucher' ? '#10b981' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="voucher" checked={metodoReembolso === 'voucher'} onChange={() => setMetodoReembolso('voucher')} /><div><strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>Gerar Voucher</strong></div></label>
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase' }}>{tx('3. Confirmação Final do Estorno', '3. Confirmación de Devolución', '3. Refund Confirmation')}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: '14px', color: '#cbd5e1' }}>Total a Devolver:</span><span style={{ fontSize: '28px', fontWeight: 900, color: '#f43f5e' }}>{fmt(calcularTotalDevolucaoBRL())}</span></div>
                <button onClick={confirmarDevolucao} disabled={calcularTotalDevolucaoBRL() === 0} style={{ padding: '16px', background: calcularTotalDevolucaoBRL() === 0 ? '#334155' : 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: calcularTotalDevolucaoBRL() === 0 ? 'not-allowed' : 'pointer' }}>{tx('Confirmar Estorno / Devolução', 'Confirmar Devolución', 'Confirm Refund')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}