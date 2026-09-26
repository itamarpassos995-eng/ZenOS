import React, { useState, useEffect } from 'react';
import { traducoes, moedasConfig, normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from './data';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Login from './components/Login';

import Produtos from './components/Produtos';
import Clientes from './components/Clientes';
import PDV from './components/PDV';
import Vendas from './components/Vendas';
import Migracao from './components/Migracao';
import Despesas from './components/Despesas';
import EstoqueInteligente from './components/EstoqueInteligente';
import Comissoes from './components/Comissoes';
import Mesas from './components/Mesas';
import DashboardMobile from './components/DashboardMobile';

function ZeniteLogo({ aoClicar }) {
  return (
    <div onClick={aoClicar} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ backgroundColor: '#ffffff', padding: '3px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '42px', minWidth: '42px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
        <img src="/Logo.png.jpeg" alt="Zênite" style={{ height: '36px', width: 'auto', objectFit: 'contain' }} onError={(e) => e.target.src = '/logo.png'} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}><span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '18px', letterSpacing: '2.5px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>ZÊNITE</span><span style={{ color: '#818cf8', fontWeight: 800, fontSize: '10px', letterSpacing: '1px' }}>OS</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}><div style={{ height: '1.5px', width: '10px', backgroundColor: '#c27849' }}></div><span style={{ color: '#cbd5e1', fontSize: '8.5px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>ATACADÃO DE TINTAS</span><div style={{ height: '1.5px', width: '10px', backgroundColor: '#c27849' }}></div></div>
      </div>
    </div>
  );
}

export default function App() {
  const [usuarioAutenticado, setUsuarioAutenticado] = useState(null);
  const [userId, setUserId] = useState(null);
  const [statusLoja, setStatusLoja] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [patenteUsuario, setPatenteUsuario] = useState('gerencia'); 

  const [ecraAtual, setEcraAtual] = useState('hub');
  const [menuNavAberto, setMenuNavAberto] = useState(false);
  const [idioma, setIdioma] = useState('pt');
  const [moeda, setMoeda] = useState('BRL');
  
  const [mostrarPainelExecutivo, setMostrarPainelExecutivo] = useState(false);
  const [valoresTopoVisiveis, setValoresTopoVisiveis] = useState(true);

  const [taxasCambio, setTaxasCambio] = useState({ BRL: 1.0, USD: 0.185, EUR: 0.165, PYG: 1380.0 });
  const [taxasInput, setTaxasInput] = useState({ USD: '5.40', EUR: '6.05', PYG: '1380' });
  const [modalCambioAberto, setModalCambioAberto] = useState(false);

  // ESTADOS HÍBRIDOS (LOCAL + NUVEM ISOLADA POR LOJA)
  const [produtos, setProdutos] = useState(() => { try { const salvo = localStorage.getItem('zenos_produtos'); return salvo ? JSON.parse(salvo).map(p => normalizarProduto(p)) : produtosIniciais; } catch { return produtosIniciais; } });
  const [clientes, setClientes] = useState(() => { try { const salvo = localStorage.getItem('zenos_clientes'); return salvo ? JSON.parse(salvo).map(c => normalizarCliente(c)) : clientesIniciais; } catch { return clientesIniciais; } });
  const [historicoVendas, setHistoricoVendas] = useState(() => { try { const salvo = localStorage.getItem('zenos_historico_vendas'); return salvo ? JSON.parse(salvo) : []; } catch { return []; } });
  const [caixaMovimentos, setCaixaMovimentos] = useState(() => { try { const salvo = localStorage.getItem('zenos_caixa_movs'); return salvo ? JSON.parse(salvo) : []; } catch { return []; } });
  const [despesas, setDespesas] = useState(() => { try { const salvo = localStorage.getItem('zenos_despesas'); return salvo ? JSON.parse(salvo) : []; } catch { return []; } });

  // OBSERVADOR DE AUTENTICAÇÃO E CARREGAMENTO DE DADOS ISOLADOS
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setUsuarioAutenticado(user.email);
        
        try {
          // Verifica status da licença
          const docSnap = await getDoc(doc(db, "lojas", user.uid));
          if (docSnap.exists()) {
            setStatusLoja(docSnap.data().status);
          }

          // Carrega dados específicos desta loja do Firestore se existirem
          const dadosLojaSnap = await getDoc(doc(db, "lojas", user.uid, "dados", "operacao"));
          if (dadosLojaSnap.exists()) {
            const d = dadosLojaSnap.data();
            if (d.produtos) setProdutos(d.produtos.map(p => normalizarProduto(p)));
            if (d.clientes) setClientes(d.clientes.map(c => normalizarCliente(c)));
            if (d.historicoVendas) setHistoricoVendas(d.historicoVendas);
            if (d.caixaMovimentos) setCaixaMovimentos(d.caixaMovimentos);
            if (d.despesas) setDespesas(d.despesas);
          }
        } catch (err) {
          console.error("Erro ao carregar dados da nuvem:", err);
        }
      } else {
        setUsuarioAutenticado(null);
        setUserId(null);
        setStatusLoja(null);
      }
      setCarregandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const fazerLogout = async () => {
    if(window.confirm(tx('Encerrar a sessão desta loja?', '¿Cerrar la sesión de esta tienda?', 'End session for this store?'))) {
      await signOut(auth);
      setMostrarPainelExecutivo(false); 
      setValoresTopoVisiveis(true);
      setEcraAtual('hub');
    }
  };

  // SINCRONIZAÇÃO AUTOMÁTICA ISOLADA NO FIRESTORE E LOCALSTORAGE
  useEffect(() => { 
    localStorage.setItem('zenos_produtos', JSON.stringify(produtos)); 
    if (userId) {
      setDoc(doc(db, "lojas", userId, "dados", "operacao"), { 
        produtos, clientes, historicoVendas, caixaMovimentos, despesas 
      }, { merge: true }).catch(() => {});
    }
  }, [produtos, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_clientes', JSON.stringify(clientes)); 
    if (userId) {
      setDoc(doc(db, "lojas", userId, "dados", "operacao"), { 
        produtos, clientes, historicoVendas, caixaMovimentos, despesas 
      }, { merge: true }).catch(() => {});
    }
  }, [clientes, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_historico_vendas', JSON.stringify(historicoVendas)); 
    if (userId) {
      setDoc(doc(db, "lojas", userId, "dados", "operacao"), { 
        produtos, clientes, historicoVendas, caixaMovimentos, despesas 
      }, { merge: true }).catch(() => {});
    }
  }, [historicoVendas, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_caixa_movs', JSON.stringify(caixaMovimentos)); 
    if (userId) {
      setDoc(doc(db, "lojas", userId, "dados", "operacao"), { 
        produtos, clientes, historicoVendas, caixaMovimentos, despesas 
      }, { merge: true }).catch(() => {});
    }
  }, [caixaMovimentos, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_despesas', JSON.stringify(despesas)); 
    if (userId) {
      setDoc(doc(db, "lojas", userId, "dados", "operacao"), { 
        produtos, clientes, historicoVendas, caixaMovimentos, despesas 
      }, { merge: true }).catch(() => {});
    }
  }, [despesas, userId]);

  const t = (chave) => traducoes[idioma]?.[chave] || traducoes.pt[chave] || chave;
  const tx = (pt, es, en) => { if (idioma === 'es') return es || pt; if (idioma === 'en') return en || pt; return pt; };

  const converterDeBRL = (valor, codigo = moeda) => (Number(valor) || 0) * (taxasCambio[codigo] || 1);
  const converterParaBRL = (valor, codigo = moeda) => (Number(valor) || 0) / (taxasCambio[codigo] || 1);
  const fmt = (valor, codigo = moeda) => {
    const val = converterDeBRL(valor, codigo);
    const conf = moedasConfig[codigo] || moedasConfig.BRL;
    try { return new Intl.NumberFormat(conf.locale, { style: 'currency', currency: conf.moeda, maximumFractionDigits: conf.moeda === 'PYG' ? 0 : 2 }).format(val); } catch { return `${conf.simbolo} ${Number(val).toFixed(2)}`; }
  };

  const salvarTaxasCambio = () => {
    const rateUSD = parseFloat(taxasInput.USD.replace(',', '.')) || 5.40;
    const rateEUR = parseFloat(taxasInput.EUR.replace(',', '.')) || 6.05;
    const ratePYG = parseFloat(taxasInput.PYG.replace(',', '.')) || 1380;
    setTaxasCambio({ BRL: 1.0, USD: rateUSD > 0 ? 1 / rateUSD : 0.185, EUR: rateEUR > 0 ? 1 / rateEUR : 0.165, PYG: ratePYG > 0 ? ratePYG : 1380.0 });
    setModalCambioAberto(false);
  };

  const vendasValidas = historicoVendas.filter(v => v.estado !== 'cancelada');
  const faturamentoTotalBRL = vendasValidas.reduce((acc, v) => acc + (v.totalBRL || 0), 0);
  const lucroBrutoBRL = vendasValidas.reduce((acc, v) => acc + (v.lucroBRL || 0), 0);
  const despesasPagasBRL = despesas.filter(d => d.status === 'paga').reduce((acc, d) => acc + (parseFloat(d.valorBRL) || 0), 0);
  const lucroLiquidoRealBRL = lucroBrutoBRL - despesasPagasBRL;
  const totalFiadoAbertoBRL = clientes.reduce((acc, c) => acc + (parseFloat(c.saldoDevedorBRL) || 0), 0);

  const gerarCurvaABC = () => {
    const mapa = {};
    vendasValidas.forEach(v => {
      v.itens.forEach(it => {
        const id = it.id;
        const qtdReal = (parseInt(it.qtd) || 0) - (parseInt(it.qtdDevolvida) || 0);
        if (qtdReal > 0) {
          if (!mapa[id]) mapa[id] = { nome: it.nome, sku: it.sku, qtd: 0, faturamentoBRL: 0 };
          mapa[id].qtd += qtdReal;
          mapa[id].faturamentoBRL += (qtdReal * parseFloat(it.precoPraticadoBRL || 0));
        }
      });
    });
    return Object.values(mapa).sort((a, b) => b.faturamentoBRL - a.faturamentoBRL).slice(0, 5); 
  };
  const curvaABC = gerarCurvaABC();

  const entradasDinheiroVendasBRL = vendasValidas.reduce((acc, v) => {
    const pagDinheiro = (v.pagamentos || []).filter(p => (p.rotulo || '').includes('Dinheiro') || (p.rotulo || '').includes('Efectivo') || (p.rotulo || '').includes('Cash')).reduce((sum, p) => sum + (p.valorConvertidoBRL || 0), 0);
    return acc + pagDinheiro;
  }, 0);
  
  const suprimentosBRL = caixaMovimentos.filter(m => m.tipo === 'suprimento').reduce((acc, m) => acc + m.valorBRL, 0);
  const sangriasBRL = caixaMovimentos.filter(m => m.tipo === 'sangria').reduce((acc, m) => acc + m.valorBRL, 0);
  const saldoCaixaFisicoBRL = entradasDinheiroVendasBRL + suprimentosBRL - sangriasBRL;

  const [modalCaixaAberto, setModalCaixaAberto] = useState(false);
  const [tipoMovCaixa, setTipoMovCaixa] = useState('suprimento'); 
  const [valorMovCaixa, setValorMovCaixa] = useState('');
  const [descMovCaixa, setDescMovCaixa] = useState('');

  const registrarMovimentoCaixa = () => {
    const valBRL = converterParaBRL(parseFloat(valorMovCaixa.replace(',', '.')) || 0, moeda);
    if (valBRL <= 0) return alert(tx('Insira um valor válido.', 'Ingrese un valor válido.', 'Enter a valid amount.'));
    if (tipoMovCaixa === 'sangria' && valBRL > saldoCaixaFisicoBRL) {
      if (!window.confirm(tx('O valor é maior que o saldo. Continuar?', 'El valor es mayor al saldo. ¿Continuar?', 'Value exceeds balance. Continue?'))) return;
    }
    const novoMov = { id: Date.now(), dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'), tipo: tipoMovCaixa, valorBRL: valBRL, descricao: descMovCaixa || (tipoMovCaixa === 'suprimento' ? tx('Fundo de Troco', 'Fondo de Cambio', 'Float Fund') : tx('Retirada de Caixa', 'Retiro de Caja', 'Cash Withdrawal')) };
    setCaixaMovimentos([novoMov, ...caixaMovimentos]);
    setModalCaixaAberto(false);
    setValorMovCaixa(''); setDescMovCaixa('');
  };

  const processarFechamentoCego = () => {
    const valInformadoBRL = converterParaBRL(parseFloat(valorMovCaixa.replace(',', '.')) || 0, moeda);
    const diferenca = valInformadoBRL - saldoCaixaFisicoBRL;
    let msg = `=========================\n${tx('FECHAMENTO DE CAIXA', 'CIERRE DE CAJA', 'CASH CLOSEOUT')}\n=========================\n`;
    msg += `${tx('Saldo Esperado:', 'Saldo Esperado:', 'Expected Balance:')} ${fmt(saldoCaixaFisicoBRL, 'BRL')}\n`;
    msg += `${tx('Saldo Informado:', 'Saldo Informado:', 'Reported Balance:')} ${fmt(valInformadoBRL, 'BRL')}\n`;
    msg += `${tx('Diferença:', 'Diferencia:', 'Difference:')} ${fmt(diferenca, 'BRL')}\n\n`;
    if (Math.abs(diferenca) < 0.1) msg += `✅ ${tx('CAIXA BATEU!', '¡CAJA CUADRA!', 'DRAWER BALANCED!')}`;
    else if (diferenca < 0) msg += `❌ ${tx('QUEBRA NEGATIVA', 'FALTANTE', 'SHORTAGE')}`;
    else msg += `⚠️ ${tx('SOBRA NO CAIXA', 'SOBRANTE', 'OVERAGE')}`;
    alert(msg);
    setModalCaixaAberto(false);
    setValorMovCaixa('');
  };

  const renderNavButton = (id, icone, texto, badge = null) => {
    const ativo = ecraAtual === id;
    return (
      <button onClick={() => { setEcraAtual(id); setMenuNavAberto(false); }} style={{ width: '100%', backgroundColor: ativo ? (id === 'clientes' ? '#451a03' : id === 'produtos' ? '#082f49' : id === 'pdv' ? '#064e3b' : id === 'mesas' ? '#4c0519' : id === 'inteligencia' ? '#4c1d95' : id === 'comissoes' ? '#831843' : id === 'dashboardMobile' ? '#78350f' : '#1e1b4b') : 'transparent', color: ativo ? (id === 'clientes' ? '#fbbf24' : id === 'produtos' ? '#38bdf8' : id === 'pdv' ? '#34d399' : id === 'mesas' ? '#fda4af' : id === 'inteligencia' ? '#c084fc' : id === 'comissoes' ? '#f472b6' : id === 'dashboardMobile' ? '#fcd34d' : '#ffffff') : '#94a3b8', border: `1px solid ${ativo ? (id === 'clientes' ? '#d97706' : id === 'produtos' ? '#0284c7' : id === 'pdv' ? '#10b981' : id === 'mesas' ? '#e11d48' : id === 'inteligencia' ? '#a855f7' : id === 'comissoes' ? '#be185d' : id === 'dashboardMobile' ? '#d97706' : '#6366f1') : 'transparent'}`, borderRadius: '8px', padding: '12px 16px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '18px' }}>{icone}</span><span>{texto}</span></div>
        {badge && <span style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '11px', padding: '2px 8px', borderRadius: '999px', fontWeight: 900 }}>{badge.text}</span>}
      </button>
    );
  };

  if (carregandoAuth) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <ZeniteLogo aoClicar={() => {}} />
          <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 700, letterSpacing: '2px' }}>A INICIAR SISTEMA...</span>
        </div>
      </div>
    );
  }

  if (!usuarioAutenticado) {
    return <Login />;
  }

  if (statusLoja === 'aguardando_pagamento') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
          <ZeniteLogo aoClicar={() => {}} />
          <h2 style={{ color: '#fbbf24', fontSize: '22px', fontWeight: 900, marginTop: '30px', marginBottom: '10px' }}>Licença Pendente</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
            A conta da sua loja foi criada com sucesso, mas o acesso ao terminal Zênite OS encontra-se temporariamente bloqueado a aguardar a confirmação da licença.
          </p>
          <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', width: '100%', marginBottom: '24px', border: '1px solid #334155' }}>
            <p style={{ color: '#fff', fontSize: '14px', margin: '0 0 10px 0', fontWeight: 700 }}>Para ativar o seu sistema agora:</p>
            <p style={{ color: '#38bdf8', fontSize: '16px', fontWeight: 900, margin: '0 0 10px 0' }}>Contacte o Suporte Zênite OS</p>
            <p style={{ color: '#64748b', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>Assim que o Itamar confirmar a ativação do seu plano, o painel será desbloqueado de imediato e de forma automática no seu ecrã.</p>
          </div>
          <button onClick={fazerLogout} style={{ backgroundColor: 'transparent', border: '1px solid #f43f5e', color: '#fb7185', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>Sair e Voltar mais tarde</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 0, margin: 0 }}>
      <style>{`* { scrollbar-width: thin; scrollbar-color: #334155 #0b1120; } *::-webkit-scrollbar { width: 6px; height: 6px; } *::-webkit-scrollbar-track { background: #0b1120; } *::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 999px; } input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; }`}</style>
      
      <header className="no-print" style={{ backgroundColor: '#0b1120', borderBottom: '1px solid #1e293b', padding: '10px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuNavAberto(!menuNavAberto)} style={{ backgroundColor: menuNavAberto ? '#1e293b' : '#020617', border: '1px solid #334155', color: '#f8fafc', padding: '8px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              <span style={{ fontSize: '18px' }}>☰</span><span>{tx('Menu', 'Menú', 'Menu')}</span>
            </button>
            {menuNavAberto && (
              <>
                <div onClick={() => setMenuNavAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}></div>
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '12px', backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '12px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '4px', width: '280px', boxShadow: '0 15px 40px rgba(0,0,0,0.8)' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase', padding: '8px 12px' }}>{t('modulosSistema')}</span>
                  {renderNavButton('hub', '🏠', tx('Painel Inicial', 'Panel de Inicio', 'Home Dashboard'))}
                  {renderNavButton('pdv', '🛒', t('pdvBalcao'))}
                  {renderNavButton('mesas', '🍽️', tx('Mesas / Comandas', 'Mesas / Comandas', 'Tables / Tabs'))}
                  {renderNavButton('produtos', '📦', t('produtosEstoque'), { bg: '#0284c7', color: '#fff', text: produtos.length })}
                  {renderNavButton('clientes', '👥', t('clientesFiado'), totalFiadoAbertoBRL > 0 ? { bg: '#dc2626', color: '#fff', text: tx('Fiado', 'Deuda', 'Debt') } : null)}
                  {renderNavButton('vendas', '📑', t('vendasDevolucoes'))}
                  {patenteUsuario === 'gerencia' && renderNavButton('inteligencia', '📊', tx('Inteligência', 'Inteligencia', 'Intelligence'))}
                  {patenteUsuario === 'gerencia' && renderNavButton('comissoes', '🤝', tx('Comissões', 'Comisiones', 'Commissions'))}
                  {patenteUsuario === 'gerencia' && renderNavButton('dashboardMobile', '📱', tx('App Mobile (CEO)', 'App Mobile (CEO)', 'Mobile App (CEO)'))}
                  {patenteUsuario === 'gerencia' && renderNavButton('despesas', '💸', tx('Contas a Pagar', 'Cuentas a Pagar', 'Expenses'), { bg: '#e11d48', color: '#fff', text: despesas.filter(d=>d.status==='pendente').length || '0' })}
                  {patenteUsuario === 'gerencia' && renderNavButton('migracao', '📥', tx('Importar Dados', 'Importar Datos', 'Import Data'))}
                </div>
              </>
            )}
          </div>
          <ZeniteLogo aoClicar={() => setEcraAtual('hub')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '4px 10px', gap: '8px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '12px' }}>{idioma === 'pt' ? '🇧🇷' : idioma === 'es' ? '🇪🇸' : '🇺🇸'}</span><select value={idioma} onChange={(e) => setIdioma(e.target.value)} style={{ backgroundColor: 'transparent', color: '#cbd5e1', fontSize: '11px', fontWeight: 800, border: 'none', outline: 'none', cursor: 'pointer' }}><option value="pt" style={{ backgroundColor: '#0b1120', color: '#fff' }}>PT</option><option value="es" style={{ backgroundColor: '#0b1120', color: '#fff' }}>ES</option><option value="en" style={{ backgroundColor: '#0b1120', color: '#fff' }}>EN</option></select></div>
            <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 900 }}>🌐</span><select value={moeda} onChange={(e) => setMoeda(e.target.value)} style={{ backgroundColor: 'transparent', color: '#34d399', fontSize: '11px', fontWeight: 900, border: 'none', outline: 'none', cursor: 'pointer' }}><option value="BRL" style={{ backgroundColor: '#0b1120', color: '#fff' }}>BRL (R$)</option><option value="USD" style={{ backgroundColor: '#0b1120', color: '#fff' }}>USD ($)</option><option value="EUR" style={{ backgroundColor: '#0b1120', color: '#fff' }}>EUR (€)</option><option value="PYG" style={{ backgroundColor: '#0b1120', color: '#fff' }}>PYG (₲)</option></select></div>
          </div>
          <button onClick={() => setModalCambioAberto(true)} style={{ backgroundColor: '#020617', border: '1px solid #6366f1', color: '#a5b4fc', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><span>💱</span><span>{t('cotacoes')}</span></button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 12px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>{tx('Operador:', 'Operador:', 'User:')}</span>
            <span style={{ color: patenteUsuario === 'gerencia' ? '#fbbf24' : '#818cf8', fontWeight: 800, fontSize: '11px' }}>{usuarioAutenticado}</span>
          </div>

          <button onClick={fazerLogout} style={{ backgroundColor: 'transparent', border: '1px solid #f43f5e', color: '#fb7185', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Sair', 'Salir', 'Logout')}</button>
        </div>
      </header>

      <main className="no-print" style={{ padding: '40px 32px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {ecraAtual === 'hub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px 32px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#818cf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Zenos Zenite OS (Cloud Multi-Tenant)</span>
                <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', margin: '4px 0 0 0' }}>{tx(`Olá!`, `¡Hola!`, `Hello!`)}</h1>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('O que vamos fazer hoje?', '¿Qué vamos a hacer hoy?', 'What are we doing today?')}</span>
              </div>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <button onClick={() => setValoresTopoVisiveis(!valoresTopoVisiveis)} title={tx('Ocultar/Mostrar Valores', 'Ocultar/Mostrar Valores', 'Toggle Values')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '0 10px', outline: 'none' }}>
                  {valoresTopoVisiveis ? '👁️' : '🙈'}
                </button>
                <div style={{ textAlign: 'right', borderRight: '1px solid #1e293b', paddingRight: '20px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{tx('Vendido Hoje', 'Vendido Hoy', 'Sold Today')}</span>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#34d399' }}>{valoresTopoVisiveis ? fmt(faturamentoTotalBRL) : '*****'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{tx('Fiado na Praça', 'Fiado a Cobrar', 'Pending Credit')}</span>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: totalFiadoAbertoBRL > 0 && valoresTopoVisiveis ? '#fb7185' : '#34d399' }}>{valoresTopoVisiveis ? fmt(totalFiadoAbertoBRL) : '*****'}</div>
                </div>
              </div>
            </div>

            {patenteUsuario === 'gerencia' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div onClick={() => setMostrarPainelExecutivo(!mostrarPainelExecutivo)} style={{ backgroundColor: mostrarPainelExecutivo ? '#070d19' : '#1e1b4b', border: `1px solid ${mostrarPainelExecutivo ? '#1e293b' : '#6366f1'}`, borderRadius: '16px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '24px' }}>{mostrarPainelExecutivo ? '🙈' : '👁️'}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', color: mostrarPainelExecutivo ? '#94a3b8' : '#a5b4fc', fontWeight: 900 }}>{tx('Painel Executivo e Financeiro', 'Panel Ejecutivo y Financiero', 'Executive & Financial Dashboard')}</h3>
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{tx('Cálculo Real: Faturamento ➔ Lucro Bruto ➔ Despesas ➔ Lucro Líquido', 'Cálculo Real: Facturación ➔ Beneficio Bruto ➔ Gastos ➔ Beneficio Neto', 'Real Calc: Revenue ➔ Gross Profit ➔ Expenses ➔ Net Profit')}</span>
                    </div>
                  </div>
                  <span style={{ color: mostrarPainelExecutivo ? '#64748b' : '#818cf8', fontWeight: 900, fontSize: '12px', letterSpacing: '1px' }}>
                    {mostrarPainelExecutivo ? tx('▲ OCULTAR DADOS', '▲ OCULTAR DATOS', '▲ HIDE DATA') : tx('▼ REVELAR DADOS', '▼ REVELAR DATOS', '▼ REVEAL DATA')}
                  </span>
                </div>

                {mostrarPainelExecutivo && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '18px' }}>💰</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Faturamento</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#f8fafc', marginTop: '8px' }}>{fmt(faturamentoTotalBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '18px' }}>💎</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Lucro Bruto</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8', marginTop: '8px' }}>{fmt(lucroBrutoBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#451a03', border: '1px solid #b45309', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '18px' }}>💸</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>Despesas Pagas</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#fef3c7', marginTop: '8px' }}>{fmt(despesasPagasBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '18px' }}>🏆</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#a7f3d0', textTransform: 'uppercase' }}>Lucro Líquido Real</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginTop: '8px' }}>{fmt(lucroLiquidoRealBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '18px' }}>📒</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Fiado na Praça</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#fb7185', marginTop: '8px' }}>{fmt(totalFiadoAbertoBRL)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '24px' }}>💵</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>{tx('Gestão de Caixa', 'Gestión de Caja', 'Cash Drawer Mgt')}</h3></div>
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, border: '1px solid #10b981' }}>{tx('Saldo Atual:', 'Saldo Actual:', 'Current Balance:')} {fmt(saldoCaixaFisicoBRL)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                          <button onClick={() => { setTipoMovCaixa('suprimento'); setModalCaixaAberto(true); }} style={{ flex: 1, padding: '12px', backgroundColor: '#020617', border: '1px solid #10b981', color: '#34d399', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>{tx('+ Suprimento', '+ Suplemento', '+ Cash In')}</button>
                          <button onClick={() => { setTipoMovCaixa('sangria'); setModalCaixaAberto(true); }} style={{ flex: 1, padding: '12px', backgroundColor: '#020617', border: '1px solid #f43f5e', color: '#fb7185', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>{tx('- Sangria', '- Sangría', '- Cash Out')}</button>
                          <button onClick={() => { setTipoMovCaixa('fechamento'); setModalCaixaAberto(true); }} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>{tx('🔒 Fechar', '🔒 Cerrar', '🔒 Close')}</button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#020617', borderRadius: '12px', border: '1px solid #1e293b', padding: '12px', overflowY: 'auto', maxHeight: '200px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '10px', display: 'block' }}>{tx('Movimentações Internas', 'Movimientos Internos', 'Internal Movements')}</span>
                          {caixaMovimentos.length === 0 ? <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>-</div> : (
                            caixaMovimentos.map(m => (
                              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '12px' }}>
                                <div><span style={{ color: '#fff', fontWeight: 700 }}>{m.tipo === 'suprimento' ? 'Entrada' : 'Saída'}: {m.descricao}</span><br/><span style={{ color: '#64748b', fontSize: '10px' }}>{m.dataHora}</span></div>
                                <span style={{ fontWeight: 900, color: m.tipo === 'suprimento' ? '#34d399' : '#fb7185' }}>{m.tipo === 'suprimento' ? '+' : '-'}{fmt(m.valorBRL, 'BRL')}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}><span style={{ fontSize: '24px' }}>📈</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>{tx('Curva ABC (Top 5)', 'Curva ABC (Top 5)', 'ABC Curve')}</h3></div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                              <th style={{ paddingBottom: '10px' }}>{tx('Item', 'Ítem', 'Item')}</th><th style={{ paddingBottom: '10px', textAlign: 'center' }}>{tx('Qtd', 'Cant.', 'Qty')}</th><th style={{ paddingBottom: '10px', textAlign: 'right' }}>{tx('Faturamento', 'Facturación', 'Revenue')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {curvaABC.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: '30px', color: '#475569', fontSize: '13px' }}>-</td></tr> : (
                              curvaABC.map((item, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #1e293b' }}>
                                  <td style={{ padding: '12px 0' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ backgroundColor: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#1e293b', color: index < 3 ? '#000' : '#fff', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>{index + 1}</span><div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>{item.nome.substring(0, 25)}</span><span style={{ color: '#64748b', fontSize: '10px' }}>{item.sku}</span></div></div></td>
                                  <td style={{ textAlign: 'center', color: '#38bdf8', fontWeight: 800, fontSize: '13px' }}>{item.qtd} UN</td>
                                  <td style={{ textAlign: 'right', color: '#34d399', fontWeight: 900, fontSize: '14px' }}>{fmt(item.faturamentoBRL, 'BRL')}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px' }}>
              <div style={{ height: '1px', flex: 1, backgroundColor: '#1e293b' }}></div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>{tx('Acessos Operacionais', 'Accesos Operativos', 'Operational Access')}</span>
              <div style={{ height: '1px', flex: 1, backgroundColor: '#1e293b' }}></div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div onClick={() => setEcraAtual('pdv')} style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 78, 59, 0.4))', border: '2px solid #10b981', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🛒</div>
                <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>PDV Balcão</h2></div>
              </div>
              
              <div onClick={() => setEcraAtual('mesas')} style={{ background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.15), rgba(136, 19, 55, 0.4))', border: '2px solid #e11d48', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🍽️</div>
                <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Mesas/Comandas</h2></div>
              </div>

              <div onClick={() => setEcraAtual('produtos')} style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15), rgba(8, 47, 73, 0.4))', border: '2px solid #0284c7', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📦</div>
                <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Catálogo</h2></div>
              </div>
              
              <div onClick={() => setEcraAtual('clientes')} style={{ background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.15), rgba(69, 26, 3, 0.4))', border: '2px solid #d97706', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>👥</div>
                <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Clientes (CRM)</h2></div>
              </div>
              
              <div onClick={() => setEcraAtual('vendas')} style={{ backgroundColor: '#0b1120', border: '2px solid #4f46e5', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📑</div>
                <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Histórico', 'Historial', 'History')}</h2></div>
              </div>

              {patenteUsuario === 'gerencia' && (
                <>
                  <div onClick={() => setEcraAtual('inteligencia')} style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(88, 28, 135, 0.4))', border: '2px solid #a855f7', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📊</div>
                    <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Inteligência', 'Inteligencia', 'Intelligence')}</h2></div>
                  </div>
                  
                  <div onClick={() => setEcraAtual('comissoes')} style={{ background: 'linear-gradient(135deg, rgba(219, 39, 119, 0.15), rgba(131, 24, 67, 0.4))', border: '2px solid #db2777', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🤝</div>
                    <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Comissões', 'Comisiones', 'Commissions')}</h2></div>
                  </div>

                  <div onClick={() => setEcraAtual('dashboardMobile')} style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.4))', border: '2px solid #f59e0b', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📱</div>
                    <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>App Mobile (CEO)</h2></div>
                  </div>
                  
                  <div onClick={() => setEcraAtual('despesas')} style={{ backgroundColor: '#0b1120', border: '2px solid #e11d48', borderRadius: '16px', padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>💸</div>
                    <div><h2 style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Despesas', 'Gastos', 'Expenses')}</h2></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {ecraAtual === 'pdv' && <PDV produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} patenteUsuario={patenteUsuario} idioma={idioma} />}
        {ecraAtual === 'mesas' && <Mesas produtos={produtos} fmt={fmt} tx={tx} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} moeda={moeda} idioma={idioma} />}
        {ecraAtual === 'produtos' && <Produtos produtos={produtos} setProdutos={setProdutos} moeda={moeda} fmt={fmt} t={t} tx={tx} restaurarProdutosPadrao={() => { if (window.confirm('Recarregar catálogo padrão?')) { const padroes = produtosIniciais.map((p, idx) => normalizarProduto(p, idx)); setProdutos(padroes); localStorage.setItem('zenos_produtos', JSON.stringify(padroes)); } }} />}
        {ecraAtual === 'inteligencia' && <EstoqueInteligente produtos={produtos} fmt={fmt} />}
        {ecraAtual === 'comissoes' && <Comissoes historicoVendas={historicoVendas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} />}
        {ecraAtual === 'dashboardMobile' && <DashboardMobile historicoVendas={historicoVendas} despesas={despesas} clientes={clientes} produtos={produtos} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} />}
        {ecraAtual === 'clientes' && <Clientes clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} />}
        {ecraAtual === 'vendas' && <Vendas historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} fmt={fmt} t={t} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterDeBRL={converterDeBRL} />}
        {ecraAtual === 'migracao' && <Migracao produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} t={t} tx={tx} />}
        {ecraAtual === 'despesas' && <Despesas despesas={despesas} setDespesas={setDespesas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterParaBRL={converterParaBRL} />}
      </main>

      {modalCambioAberto && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #6366f1', borderRadius: '24px', width: '100%', maxWidth: '420px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#818cf8', letterSpacing: '1px', textTransform: 'uppercase' }}>Zenos OS</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{t('cotacoesDia')}</h3></div>
              <button onClick={() => setModalCambioAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>1 Dólar (USD) =</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#64748b', fontSize: '12px' }}>R$</span><input type="text" value={taxasInput.USD} onChange={(e) => setTaxasInput({ ...taxasInput, USD: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>1 Euro (EUR) =</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#64748b', fontSize: '12px' }}>R$</span><input type="text" value={taxasInput.EUR} onChange={(e) => setTaxasInput({ ...taxasInput, EUR: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>1 Real (BRL) =</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="text" value={taxasInput.PYG} onChange={(e) => setTaxasInput({ ...taxasInput, PYG: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /><span style={{ color: '#64748b', fontSize: '12px' }}>₲</span></div></div>
            </div>
            <button onClick={salvarTaxasCambio} style={{ width: '100%', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer' }}>{tx('Salvar Câmbio', 'Guardar Cambio', 'Save Exchange')}</button>
          </div>
        </div>
      )}

      {modalCaixaAberto && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: `1px solid ${tipoMovCaixa === 'sangria' ? '#f43f5e' : tipoMovCaixa === 'suprimento' ? '#10b981' : '#6366f1'}`, borderRadius: '24px', width: '100%', maxWidth: '420px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: tipoMovCaixa === 'sangria' ? '#fb7185' : tipoMovCaixa === 'suprimento' ? '#34d399' : '#818cf8', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Gestão de Gaveta', 'Gestión de Gaveta', 'Drawer Mgt')}</span>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{tipoMovCaixa === 'sangria' ? tx('Registrar Sangria (-)', 'Registrar Sangría (-)', 'Cash Drop (-)') : tipoMovCaixa === 'suprimento' ? tx('Registrar Suprimento (+)', 'Registrar Suplemento (+)', 'Cash In (+)') : tx('Fechamento Cego de Caixa', 'Cierre Ciego de Caja', 'Blind Cash Closeout')}</h3>
              </div>
              <button onClick={() => setModalCaixaAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            {tipoMovCaixa === 'fechamento' ? (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
                  {tx('Conte as notas e moedas físicas na gaveta e digite o total exato abaixo.', 'Cuente el efectivo físico en la gaveta e ingrese el total exacto.', 'Count the physical cash in the drawer and enter the exact total below.')}
                </p>
                <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{tx('Valor Físico Contado', 'Valor Físico Contado', 'Counted Cash Value')} ({moeda}):</label>
                <input type="text" value={valorMovCaixa} onChange={(e) => setValorMovCaixa(e.target.value)} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #4f46e5', borderRadius: '12px', color: '#fff', fontSize: '24px', fontWeight: 900, textAlign: 'center', padding: '16px', outline: 'none', marginTop: '8px', boxSizing: 'border-box' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{tx('Valor a ', 'Valor a ', 'Amount to ')}{tipoMovCaixa === 'sangria' ? tx('retirar', 'retirar', 'drop') : tx('inserir', 'ingresar', 'add')} ({moeda}):</label>
                  <input type="text" value={valorMovCaixa} onChange={(e) => setValorMovCaixa(e.target.value)} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: `1px solid ${tipoMovCaixa === 'sangria' ? '#f43f5e' : '#10b981'}`, borderRadius: '12px', color: tipoMovCaixa === 'sangria' ? '#fb7185' : '#34d399', fontSize: '24px', fontWeight: 900, textAlign: 'center', padding: '16px', outline: 'none', marginTop: '8px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{tx('Motivo / Descrição:', 'Motivo / Descripción:', 'Reason / Description:')}</label>
                  <input type="text" value={descMovCaixa} onChange={(e) => setDescMovCaixa(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '13px', padding: '12px', outline: 'none', marginTop: '8px', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <button onClick={tipoMovCaixa === 'fechamento' ? processarFechamentoCego : registrarMovimentoCaixa} style={{ width: '100%', background: tipoMovCaixa === 'sangria' ? 'linear-gradient(135deg, #e11d48, #be123c)' : tipoMovCaixa === 'suprimento' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer' }}>
              {tipoMovCaixa === 'fechamento' ? tx('Auditar Caixa Cego', 'Auditar Caja', 'Audit Blind Box') : tx('Registrar na Gaveta', 'Registrar', 'Save Record')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}