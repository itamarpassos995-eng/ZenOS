import TerminalLogin from './components/TerminalLogin';
import React, { useState, useEffect } from 'react';
import { traducoes, moedasConfig, normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from './data';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import LandingPage from './components/LandingPage';

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
import Configuracoes from './components/Configuracoes';

const CURRENT_SCHEMA_VERSION = 1;

function executarMigracaoDeDados() {
  try {
    const versaoSalva = parseInt(localStorage.getItem('zenos_schema_version') || '0', 10);

    if (versaoSalva < CURRENT_SCHEMA_VERSION) {
      console.info(`[ZenOS Migration] Atualizando base de dados local da v${versaoSalva} para v${CURRENT_SCHEMA_VERSION}...`);

      const prodLocal = localStorage.getItem('zenos_produtos');
      if (prodLocal) {
        const parsed = JSON.parse(prodLocal);
        if (Array.isArray(parsed)) {
          const normalizados = parsed.map((p, idx) => normalizarProduto(p, idx));
          localStorage.setItem('zenos_produtos', JSON.stringify(normalizados));
        }
      }

      const clienteLocal = localStorage.getItem('zenos_clientes');
      if (clienteLocal) {
        const parsed = JSON.parse(clienteLocal);
        if (Array.isArray(parsed)) {
          const normalizados = parsed.map(c => normalizarCliente(c));
          localStorage.setItem('zenos_clientes', JSON.stringify(normalizados));
        }
      }

      localStorage.setItem('zenos_schema_version', CURRENT_SCHEMA_VERSION.toString());
      console.info("[ZenOS Migration] Migração concluída com sucesso. Dados preservados.");
    }
  } catch (err) {
    console.error("[ZenOS Migration Error] Falha ao executar migração de schema:", err);
  }
}

executarMigracaoDeDados();

function ZeniteLogo({ aoClicar }) {
  return (
    <div onClick={aoClicar} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '42px', minWidth: '42px' }}>
        <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{ height: '42px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
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

  // 🛡️ SISTEMA MULTI-OPERADOR E PATENTES
  const [vendedores, setVendedores] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_vendedores');
      if (salvo) return JSON.parse(salvo);
    } catch (err) {}
    // Utilizador mestre inicial de fábrica
    return [{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', percentual: 0, comissaoTipo: 'lucro' }];
  });
  const [operadorAtivo, setOperadorAtivo] = useState(null); 
  const patenteUsuario = operadorAtivo?.patente || 'vendedor'; 

  const [modalPlanosAberto, setModalPlanosAberto] = useState(false);
  const [demoSolicitada, setDemoSolicitada] = useState(false);
  const [cicloPlano, setCicloPlano] = useState('anual');

  const [ecraAtual, setEcraAtual] = useState('hub');
  const [menuNavAberto, setMenuNavAberto] = useState(false);
  const [idioma, setIdioma] = useState('pt');
  const [moeda, setMoeda] = useState('BRL');
  
  const [mostrarPainelExecutivo, setMostrarPainelExecutivo] = useState(false);
  const [valoresTopoVisiveis, setValoresTopoVisiveis] = useState(true);

  const [taxasCambio, setTaxasCambio] = useState({ BRL: 1.0, USD: 0.185, EUR: 0.165, PYG: 1380.0 });
  const [taxasInput, setTaxasInput] = useState({ USD: '5.40', EUR: '6.05', PYG: '1380' });
  const [modalCambioAberto, setModalCambioAberto] = useState(false);

  // 🛡️ REGRAS DO SEMÁFORO DE DESCONTO
  const [regrasDesconto, setRegrasDesconto] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_regras_desconto');
      if (salvo) return JSON.parse(salvo);
    } catch (err) {
      console.error("Erro ao carregar regras de desconto:", err);
    }
    return { verdeMax: 5, amareloMax: 12, exigirSenhaVermelho: true, senhaGerente: '1234' }; // Padrões de fábrica
  });

  const [produtos, setProdutos] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_produtos');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.error("Erro crítico ao carregar produtos:", err);
    }
    return produtosIniciais.map((p, idx) => normalizarProduto(p, idx));
  });

  const [clientes, setClientes] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_clientes');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    }
    return clientesIniciais.map(c => normalizarCliente(c));
  });

  const [historicoVendas, setHistoricoVendas] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_historico_vendas');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    }
    return [];
  });

  const [caixaMovimentos, setCaixaMovimentos] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_caixa_movs');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error("Erro ao carregar caixa:", err);
    }
    return [];
  });

  const [despesas, setDespesas] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_despesas');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error("Erro ao carregar despesas:", err);
    }
    return [];
  });

  const solicitarDemoFirebase = async () => {
    if (!userId) return;
    try {
      await setDoc(doc(db, "solicitacoes_demo", userId), {
        email: usuarioAutenticado,
        uid: userId,
        dataSolicitacao: new Date().toISOString(),
        status: 'pendente_analise'
      }, { merge: true });
      setDemoSolicitada(true);
      alert('Solicitação de teste enviada com sucesso! A equipa comercial irá aprovar o seu acesso.');
    } catch (err) {
      console.error("Erro ao solicitar demo:", err);
      alert(tx('Erro ao enviar solicitação. Tente novamente.', 'Error al enviar solicitud.', 'Error sending request.'));
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setUsuarioAutenticado(user.email);
        
        try {
          const docRef = doc(db, "lojas", user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const dadosLoja = docSnap.data();
            let status = dadosLoja.status || 'aguardando_pagamento';
            
            const dataCriacaoStr = dadosLoja.dataCriacao || dadosLoja.createdAt || new Date().toISOString();
            const dataCriacao = new Date(dataCriacaoStr);
            const agora = new Date();
            const diffDias = (agora - dataCriacao) / (1000 * 60 * 60 * 24);

            if (status === 'aguardando_pagamento' && diffDias <= 7) {
              status = 'ativo';
            }
            setStatusLoja(status);
          } else {
            const novaDataCriacao = new Date().toISOString();
            await setDoc(docRef, { email: user.email, status: 'ativo', dataCriacao: novaDataCriacao }, { merge: true });
            setStatusLoja('ativo');
          }

          const dadosLojaSnap = await getDoc(doc(db, "lojas", user.uid, "dados", "operacao"));
          if (dadosLojaSnap.exists()) {
            const d = dadosLojaSnap.data();
            if (d.produtos) setProdutos(d.produtos.map(p => normalizarProduto(p)));
            if (d.clientes) setClientes(d.clientes.map(c => normalizarCliente(c)));
            if (d.historicoVendas) setHistoricoVendas(d.historicoVendas);
            if (d.caixaMovimentos) setCaixaMovimentos(d.caixaMovimentos);
            if (d.despesas) setDespesas(d.despesas);
            if (d.regrasDesconto) setRegrasDesconto(d.regrasDesconto); 
            if (d.vendedores) setVendedores(d.vendedores);
          }
        } catch (err) {
          console.error("Erro ao carregar dados da nuvem:", err);
          setStatusLoja('ativo');
        }
      } else {
        setUsuarioAutenticado(null);
        setUserId(null);
        setStatusLoja(null);
        setOperadorAtivo(null); // Desconecta o operador se perder a sessão
      }
      setCarregandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const fazerLogout = async () => {
    if(window.confirm(tx('Encerrar a sessão principal desta loja?', '¿Cerrar la sesión de esta tienda?', 'End session for this store?'))) {
      await signOut(auth);
      setMostrarPainelExecutivo(false); 
      setOperadorAtivo(null);
      setValoresTopoVisiveis(true);
      setEcraAtual('hub');
    }
  };

  const trocarOperador = () => {
    setOperadorAtivo(null);
  };

  useEffect(() => { 
    localStorage.setItem('zenos_produtos', JSON.stringify(produtos)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [produtos, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_clientes', JSON.stringify(clientes)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [clientes, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_historico_vendas', JSON.stringify(historicoVendas)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [historicoVendas, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_caixa_movs', JSON.stringify(caixaMovimentos)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [caixaMovimentos, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_despesas', JSON.stringify(despesas)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [despesas, userId]);

  useEffect(() => { 
    localStorage.setItem('zenos_regras_desconto', JSON.stringify(regrasDesconto)); 
    if (userId) { setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos, clientes, historicoVendas, caixaMovimentos, despesas, regrasDesconto, vendedores }, { merge: true }).catch(err => console.warn("Aviso cloud:", err)); }
  }, [regrasDesconto, userId]);

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

  // 🛡️ MOTOR DE PERMISSÕES RBAC
  const temPermissao = (modulo) => {
    if (!operadorAtivo) return false;
    if (operadorAtivo.id === 'admin' || operadorAtivo.permissoes?.admin) return true;
    return !!operadorAtivo.permissoes?.[modulo];
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
    return <LandingPage/>;
  }

  // 🛡️ BLOQUEIA A LOJA SE NINGUÉM ESTIVER LOGADO NO TERMINAL (SUB-LOGIN)
  if (statusLoja === 'ativo' && !operadorAtivo) {
    return (
      <TerminalLogin 
        vendedores={vendedores} 
        onLoginSuccess={(operador) => setOperadorAtivo(operador)} 
        onSairLoja={fazerLogout} 
      />
    );
  }

  if (statusLoja === 'aguardando_pagamento') {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', fontFamily: '"Inter", "Segoe UI", sans-serif', backgroundColor: '#050505', overflowY: 'auto', overflowX: 'hidden' }}>
        <style>{`
          ::-webkit-scrollbar { display: none; }
          * { -ms-overflow-style: none; scrollbar-width: none; }
          body, html { margin: 0; padding: 0; overflow: hidden; background-color: #050505; }
        `}</style>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url("https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1 }}></div>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(135deg, rgba(5,5,5,0.92) 0%, rgba(13,56,49,0.75) 100%)', zIndex: 2 }}></div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 20px', zIndex: 10, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: '450px', background: 'rgba(10, 10, 10, 0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: 'clamp(30px, 5vh, 40px)', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxSizing: 'border-box' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 'clamp(20px, 3vh, 30px)' }}>
              <img src="/logo-zenos.png?v=4" alt="ZenOS Logo Oficial" style={{ width: '100%', maxWidth: '180px', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }} />
            </div>
            <h2 style={{ color: '#fbbf24', fontSize: 'clamp(20px, 3vh, 24px)', fontWeight: 900, margin: '0 0 12px 0' }}>Licença Pendente / Teste Expirado</h2>
            <p style={{ color: '#a3a3a3', fontSize: 'clamp(13px, 1.5vh, 14px)', marginBottom: '24px', lineHeight: '1.6' }}>
              O seu período de teste gratuito de 7 dias terminou ou a licença da loja aguarda ativação. Escolha um plano para desbloquear o terminal ZenOS de imediato.
            </p>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '12px', width: '100%', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
              <p style={{ color: '#e5e5e5', fontSize: '13px', margin: '0 0 8px 0', fontWeight: 700 }}>Ativação Instantânea:</p>
              <p style={{ color: '#14b8a6', fontSize: '15px', fontWeight: 900, margin: '0 0 8px 0' }}>ZenOS Cloud SaaS Enterprise</p>
              <p style={{ color: '#888', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>Aceda a relatórios avançados, gestão de filiais em tempo real e suporte prioritário.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <button onClick={() => setModalPlanosAberto(true)} style={{ background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)', border: 'none', color: '#ffffff', padding: '14px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s', width: '100%', boxShadow: '0 4px 15px rgba(20, 184, 166, 0.3)' }}>Ver Opções de Planos</button>
              
              <button onClick={solicitarDemoFirebase} disabled={demoSolicitada} style={{ background: demoSolicitada ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${demoSolicitada ? '#10b981' : 'rgba(255, 255, 255, 0.15)'}`, color: demoSolicitada ? '#34d399' : '#ffffff', padding: '14px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 800, cursor: demoSolicitada ? 'default' : 'pointer', transition: 'all 0.3s', width: '100%' }}>
                {demoSolicitada ? '✓ Solicitação de Demo Enviada!' : 'Solicitar Extensão de Teste'}
              </button>

              <button onClick={fazerLogout} style={{ background: 'transparent', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '14px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s', width: '100%', marginTop: '6px' }}>Sair e Voltar mais tarde</button>
            </div>
          </div>
        </div>

        {/* MODAL DE PLANOS */}
        {modalPlanosAberto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', boxSizing: 'border-box' }}>
            <div style={{ backgroundColor: '#0b1120', border: '1px solid #14b8a6', borderRadius: '24px', width: '100%', maxWidth: '900px', maxHeight: '92vh', overflowY: 'auto', padding: '32px', color: '#fff', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 900, color: '#14b8a6', letterSpacing: '1px', textTransform: 'uppercase' }}>ZenOS Cloud SaaS Enterprise</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 900, margin: '2px 0 0 0' }}>Escolha o Plano Ideal para o seu Negócio</h3>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#020617', padding: '4px', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <button onClick={() => setCicloPlano('mensal')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: cicloPlano === 'mensal' ? '#14b8a6' : 'transparent', color: cicloPlano === 'mensal' ? '#000' : '#94a3b8', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>Mensal</button>
                  <button onClick={() => setCicloPlano('anual')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: cicloPlano === 'anual' ? '#14b8a6' : 'transparent', color: cicloPlano === 'anual' ? '#000' : '#94a3b8', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>Anual (-20% OFF)</button>
                </div>
                <button onClick={() => setModalPlanosAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '36px', height: '36px', borderRadius: '10px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                
                <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#38bdf8', margin: '0 0 4px 0' }}>Básico</h4>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
                      {cicloPlano === 'anual' ? 'R$ 28,48' : 'R$ 35,00'}<span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>/mês</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>{cicloPlano === 'anual' ? 'Cobrado anualmente' : 'Sem fidelidade'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Até 100 Clientes</li>
                    <li>Até 500 Produtos</li>
                    <li>Controle de Vendas e Estoque</li>
                    <li>Frente de Caixa PDV</li>
                    <li>3 Usuários / Vendedores</li>
                  </ul>
                  <button onClick={() => alert('Para ativar o Plano Básico, contacte o suporte comercial ZenOS.')} style={{ width: '100%', padding: '10px', background: '#0284c7', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', marginTop: 'auto', fontSize: '12px' }}>Selecionar Básico</button>
                </div>

                <div style={{ background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.15), rgba(2, 6, 23, 0.9))', border: '1px solid #14b8a6', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(20, 184, 166, 0.15)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '16px', backgroundColor: '#14b8a6', color: '#000', fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>Mais Popular</div>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#14b8a6', margin: '0 0 4px 0' }}>Essencial</h4>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
                      {cicloPlano === 'anual' ? 'R$ 33,57' : 'R$ 44,90'}<span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>/mês</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>{cicloPlano === 'anual' ? 'Cobrado anualmente' : 'Sem fidelidade'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Clientes Ilimitados</li>
                    <li>Até 2.000 Produtos</li>
                    <li>Catálogo Digital Grátis</li>
                    <li>Contagem e Inventário</li>
                    <li>Contas a Pagar e Receber</li>
                    <li>5 Usuários / Vendedores</li>
                  </ul>
                  <button onClick={() => alert('Para ativar o Plano Essencial, contacte o suporte comercial ZenOS.')} style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg, #0d9488, #14b8a6)', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', marginTop: 'auto', fontSize: '12px', boxShadow: '0 4px 15px rgba(20,184,166,0.3)' }}>Selecionar Essencial</button>
                </div>

                <div style={{ backgroundColor: '#020617', border: '1px solid #6366f1', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#818cf8', margin: '0 0 4px 0' }}>Pro Avançado</h4>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
                      {cicloPlano === 'anual' ? 'R$ 43,75' : 'R$ 59,90'}<span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>/mês</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>{cicloPlano === 'anual' ? 'Cobrado anualmente' : 'Sem fidelidade'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Tudo Ilimitado (Clientes/Produtos)</li>
                    <li>Controle de Ordens de Serviço</li>
                    <li>Importação de XML e NFe</li>
                    <li>Curva ABC & Inteligência</li>
                    <li>Até 20 Usuários Simultâneos</li>
                  </ul>
                  <button onClick={() => alert('Para ativar o Plano Pro, contacte o suporte comercial ZenOS.')} style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', marginTop: 'auto', fontSize: '12px' }}>Selecionar Pro</button>
                </div>

                <div style={{ background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.15), rgba(2, 6, 23, 0.9))', border: '1px solid #d97706', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(217, 119, 6, 0.15)' }}>
                  <div>
                    <span style={{ backgroundColor: '#d97706', color: '#000', fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>Redes / Franquias</span>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#fbbf24', margin: '4px 0 4px 0' }}>Multi-Filiais</h4>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>Sob Consulta</div>
                    <span style={{ fontSize: '10px', color: '#fbbf24' }}>Conexão total de estoques</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li><b>Estoque Unificado Multi-Filial:</b> Consulte em tempo real se o produto X está na Filial Centro ou Filial Shopping</li>
                    <li>Painel Executivo Central (CEO)</li>
                    <li>Usuários e Lojas Ilimitadas</li>
                    <li>Gerente de Conta Dedicado 24/7</li>
                  </ul>
                  <button onClick={() => alert('Para contratar o Plano Multi-Filiais para a sua rede, um consultor ZenOS entrará em contacto.')} style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', marginTop: 'auto', fontSize: '12px', boxShadow: '0 4px 15px rgba(217,119,6,0.3)' }}>Falar com Consultor</button>
                </div>

              </div>

              <div style={{ textAlign: 'center' }}>
                <button onClick={() => setModalPlanosAberto(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#94a3b8', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>Fechar Tabela de Planos</button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', height: '100vh', backgroundColor: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 0, margin: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
      <style>{`
        * { scrollbar-width: thin; scrollbar-color: #334155 #0b1120; box-sizing: border-box; }
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-track { background: #0b1120; }
        *::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 999px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        html, body { height: 100%; margin: 0; padding: 0; overflow-y: auto !important; background-color: #020617; }
        @media (max-width: 768px) {
          .mobile-stack { flex-direction: column !important; align-items: stretch !important; }
          .mobile-stack > div { text-align: left !important; border-right: none !important; padding-right: 0 !important; margin-bottom: 12px; }
          .mobile-padding { padding: 16px !important; }
          .mobile-text-lg { font-size: 24px !important; }
        }
      `}</style>
      
      <header className="no-print" style={{ backgroundColor: '#0b1120', borderBottom: '1px solid #1e293b', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuNavAberto(!menuNavAberto)} style={{ backgroundColor: menuNavAberto ? '#1e293b' : '#020617', border: '1px solid #334155', color: '#f8fafc', padding: '8px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              <span style={{ fontSize: '18px' }}>☰</span><span className="hide-mobile">{tx('Menu', 'Menú', 'Menu')}</span>
            </button>
            {menuNavAberto && (
              <>
                <div onClick={() => setMenuNavAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}></div>
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '12px', backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '12px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '4px', width: '250px', boxShadow: '0 15px 40px rgba(0,0,0,0.8)' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase', padding: '8px 12px' }}>{t('modulosSistema')}</span>
                  
                  {renderNavButton('hub', '🏠', tx('Painel Inicial', 'Panel de Inicio', 'Home Dashboard'))}
                  
                  {/* 🛡️ PERMISSÕES APLICADAS AO MENU LATERAL */}
                  {temPermissao('pdv') && renderNavButton('pdv', '🛒', t('pdvBalcao'))}
                  {temPermissao('mesas') && renderNavButton('mesas', '🍽️', tx('Mesas / Comandas', 'Mesas / Comandas', 'Tables / Tabs'))}
                  {temPermissao('produtos') && renderNavButton('produtos', '📦', t('produtosEstoque'), { bg: '#0284c7', color: '#fff', text: produtos.length })}
                  {temPermissao('clientes') && renderNavButton('clientes', '👥', t('clientesFiado'), totalFiadoAbertoBRL > 0 ? { bg: '#dc2626', color: '#fff', text: tx('Fiado', 'Deuda', 'Debt') } : null)}
                  {temPermissao('vendas') && renderNavButton('vendas', '📑', t('vendasDevolucoes'))}
                  
                  {temPermissao('inteligencia') && renderNavButton('inteligencia', '📊', tx('Inteligência', 'Inteligencia', 'Intelligence'))}
                  {temPermissao('admin') && renderNavButton('comissoes', '🤝', tx('Comissões', 'Comisiones', 'Commissions'))}
                  {temPermissao('admin') && renderNavButton('dashboardMobile', '📱', tx('App Mobile (CEO)', 'App Mobile (CEO)', 'Mobile App (CEO)'))}
                  {temPermissao('despesas') && renderNavButton('despesas', '💸', tx('Contas a Pagar', 'Cuentas a Pagar', 'Expenses'), { bg: '#e11d48', color: '#fff', text: despesas.filter(d=>d.status==='pendente').length || '0' })}
                  {temPermissao('admin') && renderNavButton('configuracoes', '⚙️', tx('Configurações', 'Configuraciones', 'Settings'))}
                  {temPermissao('admin') && renderNavButton('migracao', '📥', tx('Importar Dados', 'Importar Datos', 'Import Data'))}
                </div>
              </>
            )}
          </div>
          <ZeniteLogo aoClicar={() => setEcraAtual('hub')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '4px 8px', gap: '6px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '12px' }}>{idioma === 'pt' ? '🇧🇷' : idioma === 'es' ? '🇪🇸' : '🇺🇸'}</span>
                <select value={idioma} onChange={(e) => setIdioma(e.target.value)} style={{ backgroundColor: 'transparent', color: '#cbd5e1', fontSize: '11px', fontWeight: 800, border: 'none', outline: 'none', cursor: 'pointer' }}>
                  <option value="pt" style={{ backgroundColor: '#0b1120', color: '#fff' }}>PT</option>
                  <option value="es" style={{ backgroundColor: '#0b1120', color: '#fff' }}>ES</option>
                  <option value="en" style={{ backgroundColor: '#0b1120', color: '#fff' }}>EN</option>
                </select>
              </div>
              <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 900 }}>🌐</span>
                <select value={moeda} onChange={(e) => setMoeda(e.target.value)} style={{ backgroundColor: 'transparent', color: '#34d399', fontSize: '11px', fontWeight: 900, border: 'none', outline: 'none', cursor: 'pointer' }}>
                  <option value="BRL" style={{ backgroundColor: '#0b1120', color: '#fff' }}>BRL (R$)</option>
                  <option value="USD" style={{ backgroundColor: '#0b1120', color: '#fff' }}>USD ($)</option>
                  <option value="EUR" style={{ backgroundColor: '#0b1120', color: '#fff' }}>EUR (€)</option>
                  <option value="PYG" style={{ backgroundColor: '#0b1120', color: '#fff' }}>PYG (₲)</option>
                </select>
              </div>
              <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }}></div>
              <button onClick={() => setModalCambioAberto(true)} title="Ajustar Cotações de Câmbio" style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>⚙️</button>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }} className="hide-mobile">Operador:</span>
            <span style={{ color: patenteUsuario === 'gerencia' ? '#fbbf24' : '#818cf8', fontWeight: 900, fontSize: '12px' }}>{operadorAtivo.nome}</span>
          </div>

          <button onClick={trocarOperador} style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid #6366f1', color: '#818cf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Trocar Operador</button>
        </div>
      </header>

      <main className="no-print" style={{ padding: '20px 16px', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {ecraAtual === 'hub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div className="mobile-padding" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid #334155', borderRadius: '24px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: '1 1 100%', minWidth: '250px' }}>
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>ZenOS (Cloud)</span>
                <h1 className="mobile-text-lg" style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', margin: '8px 0 4px 0', letterSpacing: '-0.5px' }}>{tx(`Olá, ${operadorAtivo.nome}!`, `¡Hola, ${operadorAtivo.nome}!`, `Hello, ${operadorAtivo.nome}!`)}</h1>
                <span style={{ fontSize: '15px', color: '#94a3b8', fontWeight: 500 }}>{tx('Pronto para vender?', '¿Listo para vender?', 'Ready to sell?')}</span>
              </div>
              
              <div className="mobile-stack" style={{ display: 'flex', gap: '24px', alignItems: 'center', width: '100%' }}>
                <div style={{ textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '24px', flex: 1 }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{tx('Vendido Hoje', 'Vendido Hoy', 'Sold Today')}</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#34d399', marginTop: '4px', textShadow: '0 2px 10px rgba(52,211,153,0.2)' }}>{valoresTopoVisiveis ? fmt(faturamentoTotalBRL) : '*****'}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 1 }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{tx('Fiado na Praça', 'Fiado a Cobrar', 'Pending Credit')}</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: totalFiadoAbertoBRL > 0 && valoresTopoVisiveis ? '#fb7185' : '#34d399', marginTop: '4px' }}>{valoresTopoVisiveis ? fmt(totalFiadoAbertoBRL) : '*****'}</div>
                </div>
                <button onClick={() => setValoresTopoVisiveis(!valoresTopoVisiveis)} title={tx('Ocultar/Mostrar Valores', 'Ocultar/Mostrar Valores', 'Toggle Values')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', fontSize: '20px', cursor: 'pointer', padding: '12px', outline: 'none', transition: 'all 0.3s' }}>
                  {valoresTopoVisiveis ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            {/* 🛡️ PERMISSÕES APLICADAS AO PAINEL EXECUTIVO */}
            {temPermissao('inteligencia') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div onClick={() => setMostrarPainelExecutivo(!mostrarPainelExecutivo)} style={{ background: mostrarPainelExecutivo ? '#0f172a' : 'linear-gradient(135deg, #1e293b, #0f172a)', border: `1px solid ${mostrarPainelExecutivo ? '#1e293b' : '#334155'}`, borderRadius: '20px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.3s', boxShadow: mostrarPainelExecutivo ? 'none' : '0 10px 30px rgba(0,0,0,0.4)', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>{mostrarPainelExecutivo ? '🙈' : '👁️'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}><h3 style={{ margin: 0, fontSize: '16px', color: mostrarPainelExecutivo ? '#94a3b8' : '#e2e8f0', fontWeight: 900 }}>Painel Executivo e Financeiro</h3></div>
                  </div>
                </div>

                {mostrarPainelExecutivo && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.5s ease-out' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div style={{ backgroundColor: '#021e15', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>💰</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Faturamento</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#f8fafc', marginTop: '12px' }}>{fmt(faturamentoTotalBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#06283d', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>💎</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Lucro Bruto</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8', marginTop: '12px' }}>{fmt(lucroBrutoBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>💸</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1px' }}>Despesas Pagas</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#fef3c7', marginTop: '12px' }}>{fmt(despesasPagasBRL)}</span>
                      </div>
                      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '1px solid rgba(16, 185, 129, 0.5)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(16,185,129,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>🏆</span><span style={{ fontSize: '11px', fontWeight: 900, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '1px' }}>Lucro Líquido Real</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '12px', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>{fmt(lucroLiquidoRealBRL)}</span>
                      </div>
                      <div style={{ backgroundColor: '#2b1404', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>📒</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Fiado na Praça</span></div>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#fb7185', marginTop: '12px' }}>{fmt(totalFiadoAbertoBRL)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                      <div className="mobile-padding" style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ fontSize: '24px' }}>💵</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Gestão de Caixa</h3></div>
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '8px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 900, border: '1px solid rgba(16, 185, 129, 0.3)' }}>Saldo: {fmt(saldoCaixaFisicoBRL)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                          <button onClick={() => { setTipoMovCaixa('suprimento'); setModalCaixaAberto(true); }} style={{ flex: '1 1 calc(50% - 5px)', padding: '14px 10px', backgroundColor: '#021e15', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#34d399', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '12px' }}>+ Entrada</button>
                          <button onClick={() => { setTipoMovCaixa('sangria'); setModalCaixaAberto(true); }} style={{ flex: '1 1 calc(50% - 5px)', padding: '14px 10px', backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.5)', color: '#fb7185', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '12px' }}>- Saída</button>
                          <button onClick={() => { setTipoMovCaixa('fechamento'); setModalCaixaAberto(true); }} style={{ flex: '1 1 100%', padding: '14px', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>🔒 Fechar Caixa</button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#020617', borderRadius: '12px', border: '1px solid #1e293b', padding: '16px', overflowY: 'auto', maxHeight: '250px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', display: 'block', letterSpacing: '1px' }}>Movimentações Internas</span>
                          {caixaMovimentos.length === 0 ? <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', marginTop: '30px' }}>-</div> : (
                            caixaMovimentos.map(m => (
                              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                                <div><span style={{ color: '#e2e8f0', fontWeight: 700 }}>{m.tipo === 'suprimento' ? 'Entrada' : 'Saída'}: {m.descricao}</span><br/><span style={{ color: '#64748b', fontSize: '10px', marginTop: '4px', display: 'inline-block' }}>{m.dataHora} • {m.operador}</span></div>
                                <span style={{ fontWeight: 900, color: m.tipo === 'suprimento' ? '#34d399' : '#fb7185', fontSize: '14px' }}>{m.tipo === 'suprimento' ? '+' : '-'}{fmt(m.valorBRL, 'BRL')}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mobile-padding" style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}><span style={{ fontSize: '24px' }}>📈</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Curva ABC (Top 5)</h3></div>
                        <div style={{ backgroundColor: '#020617', borderRadius: '12px', border: '1px solid #1e293b', padding: '4px 16px', flex: 1, overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '280px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <th style={{ padding: '16px 0' }}>Item</th><th style={{ padding: '16px 0', textAlign: 'center' }}>Qtd</th><th style={{ padding: '16px 0', textAlign: 'right' }}>Faturamento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {curvaABC.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: '40px', color: '#475569', fontSize: '13px' }}>-</td></tr> : (
                                curvaABC.map((item, index) => (
                                  <tr key={index} style={{ borderBottom: index === curvaABC.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px 0' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ background: index === 0 ? 'linear-gradient(135deg, #fbbf24, #d97706)' : index === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : index === 2 ? 'linear-gradient(135deg, #b45309, #78350f)' : 'rgba(255,255,255,0.1)', color: index < 3 ? '#ffffff' : '#94a3b8', minWidth: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>{index + 1}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 800 }}>{item.nome.substring(0, 20)}</span><span style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>{item.sku}</span></div>
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'center', color: '#38bdf8', fontWeight: 900, fontSize: '13px' }}>{item.qtd} <span style={{fontSize: '10px', color: '#64748b'}}>UN</span></td>
                                    <td style={{ textAlign: 'right', color: '#34d399', fontWeight: 900, fontSize: '14px' }}>{fmt(item.faturamentoBRL, 'BRL')}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', marginBottom: '8px' }}>
              <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1))' }}></div>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center' }}>{tx('Acessos Operacionais', 'Accesos Operativos', 'Operational Access')}</span>
              <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.1))' }}></div>
            </div>
            
            {/* 🛡️ PERMISSÕES APLICADAS AOS BOTÕES GRANDES DA HOME */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
              
              {temPermissao('pdv') && (
                <div onClick={() => setEcraAtual('pdv')} style={{ backgroundColor: '#021e15', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(16,185,129,0.4)' }}>🛒</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>PDV Balcão</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Frente de Caixa</span></div>
                </div>
              )}
              
              {temPermissao('mesas') && (
                <div onClick={() => setEcraAtual('mesas')} style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(225, 29, 72, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #e11d48, #be123c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(225,29,72,0.4)' }}>🍽️</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Mesas</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Pedidos/Comandas</span></div>
                </div>
              )}

              {temPermissao('produtos') && (
                <div onClick={() => setEcraAtual('produtos')} style={{ backgroundColor: '#052336', border: '1px solid rgba(2, 132, 199, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #0284c7, #0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(2,132,199,0.4)' }}>📦</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Catálogo</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Produtos e Estoque</span></div>
                </div>
              )}
              
              {temPermissao('clientes') && (
                <div onClick={() => setEcraAtual('clientes')} style={{ backgroundColor: '#2b1604', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #d97706, #b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(217,119,6,0.4)' }}>👥</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>Clientes</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>CRM e Fiados</span></div>
                </div>
              )}
              
              {temPermissao('vendas') && (
                <div onClick={() => setEcraAtual('vendas')} style={{ backgroundColor: '#111030', border: '1px solid rgba(79, 70, 229, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(79,70,229,0.4)' }}>📑</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Histórico', 'Historial', 'History')}</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Relatórios</span></div>
                </div>
              )}

              {temPermissao('admin') && (
                <>
                  <div onClick={() => setEcraAtual('comissoes')} style={{ backgroundColor: '#2e071c', border: '1px solid rgba(219, 39, 119, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #db2777, #be185d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(219,39,119,0.4)' }}>🤝</div>
                    <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Comissões', 'Comisiones', 'Commissions')}</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Equipa</span></div>
                  </div>

                  <div onClick={() => setEcraAtual('dashboardMobile')} style={{ backgroundColor: '#2b1704', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(245,158,11,0.15)' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(245,158,11,0.4)' }}>📱</div>
                    <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>App CEO</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Mobile</span></div>
                  </div>
                </>
              )}
              
              {temPermissao('despesas') && (
                <div onClick={() => setEcraAtual('despesas')} style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #64748b, #475569)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}>💸</div>
                  <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>{tx('Despesas', 'Gastos', 'Expenses')}</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>A Pagar</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🛡️ REGRAS DE DESCONTO ENVIADAS PARA PDV E CONFIGURAÇÕES */}
        {ecraAtual === 'pdv' && <PDV produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} patenteUsuario={patenteUsuario} idioma={idioma} regrasDesconto={regrasDesconto} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'mesas' && <Mesas produtos={produtos} fmt={fmt} tx={tx} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} moeda={moeda} idioma={idioma} />}
        {ecraAtual === 'produtos' && <Produtos produtos={produtos} setProdutos={setProdutos} moeda={moeda} fmt={fmt} t={t} tx={tx} />}
        {ecraAtual === 'inteligencia' && <EstoqueInteligente produtos={produtos} fmt={fmt} />}
        {ecraAtual === 'comissoes' && <Comissoes historicoVendas={historicoVendas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} />}
        {ecraAtual === 'dashboardMobile' && <DashboardMobile historicoVendas={historicoVendas} despesas={despesas} clientes={clientes} produtos={produtos} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} />}
        {ecraAtual === 'clientes' && <Clientes clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} />}
        {ecraAtual === 'vendas' && <Vendas historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} fmt={fmt} t={t} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterDeBRL={converterDeBRL} />}
        {ecraAtual === 'migracao' && <Migracao produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} t={t} tx={tx} />}
        {ecraAtual === 'configuracoes' && <Configuracoes produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} despesas={despesas} setDespesas={setDespesas} moeda={moeda} fmt={fmt} tx={tx} regrasDesconto={regrasDesconto} setRegrasDesconto={setRegrasDesconto} vendedores={vendedores} setVendedores={(novosVendedores) => { setVendedores(novosVendedores); localStorage.setItem('zenos_vendedores', JSON.stringify(novosVendedores)); if (userId) setDoc(doc(db, "lojas", userId, "dados", "operacao"), { vendedores: novosVendedores }, { merge: true }); }} />}
        {ecraAtual === 'despesas' && <Despesas despesas={despesas} setDespesas={setDespesas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterParaBRL={converterParaBRL} />}
      </main>

      {modalCambioAberto && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #6366f1', borderRadius: '24px', width: '90%', maxWidth: '420px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#818cf8', letterSpacing: '1px', textTransform: 'uppercase' }}>ZenOS</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{t('cotacoesDia')}</h3></div>
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
          <div style={{ backgroundColor: '#0b1120', border: `1px solid ${tipoMovCaixa === 'sangria' ? '#f43f5e' : tipoMovCaixa === 'suprimento' ? '#10b981' : '#6366f1'}`, borderRadius: '24px', width: '90%', maxWidth: '420px', padding: '28px', color: '#fff' }}>
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
