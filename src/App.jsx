import TerminalLogin from './components/TerminalLogin';
import React, { useState, useEffect } from 'react';
import { traducoes, moedasConfig, normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from './data';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import LandingPage from './components/LandingPage';

import Produtos from './components/Produtos';
import Fornecedores from './components/Fornecedores';
import Clientes from './components/Clientes';
import PDV from './components/PDV';
import PDVCompras from './components/PDVCompras';
import Vendas from './components/Vendas';
import Migracao from './components/Migracao';
import Despesas from './components/Despesas';
import EstoqueInteligente from './components/EstoqueInteligente';
import Comissoes from './components/Comissoes';
import Mesas from './components/Mesas';
import DashboardMobile from './components/DashboardMobile';
import Configuracoes from './components/Configuracoes';
import GestaoCaixas from './components/GestaoCaixas';

const CURRENT_SCHEMA_VERSION = 1;

function executarMigracaoDeDados() {
  try {
    const versaoSalva = parseInt(localStorage.getItem('zenos_schema_version') || '0', 10);
    if (versaoSalva < CURRENT_SCHEMA_VERSION) {
      console.info(`[ZenOS Migration] Atualizando base de dados local para v${CURRENT_SCHEMA_VERSION}...`);
      localStorage.setItem('zenos_schema_version', CURRENT_SCHEMA_VERSION.toString());
    }
  } catch (err) {
    console.error("[ZenOS Migration Error] Falha:", err);
  }
}

executarMigracaoDeDados();

function ZenosLogo({ aoClicar }) {
  return (
    <div onClick={aoClicar} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '42px', minWidth: '42px' }}>
        <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{ height: '42px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}><span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '18px', letterSpacing: '2.5px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>Zen</span><span style={{ color: '#818cf8', fontWeight: 800, fontSize: '16px', letterSpacing: '1px' }}>OS</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}><div style={{ height: '1.5px', width: '10px', backgroundColor: '#6366f1' }}></div><span style={{ color: '#cbd5e1', fontSize: '8.5px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>SISTEMA DE GESTÃO</span><div style={{ height: '1.5px', width: '10px', backgroundColor: '#6366f1' }}></div></div>
      </div>
    </div>
  );
}

export default function App() {
  const [usuarioAutenticado, setUsuarioAutenticado] = useState(null);
  const [userId, setUserId] = useState(null);
  const [statusLoja, setStatusLoja] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  
  // 🔒 MOTOR DE SINCRONIZAÇÃO (TRANCA DE DADOS)
  const [nuvemSincronizada, setNuvemSincronizada] = useState(false);

  // 🛡️ Inicialização Limpa: Não puxar do cache genérico na inicialização
  const [vendedores, setVendedores] = useState([]);
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

  // Variáveis Nascem Vazias (Isolamento de Memória RAM)
  const [regrasDesconto, setRegrasDesconto] = useState({ verdeMax: 5, amareloMax: 12, exigirSenhaVermelho: true, senhaGerente: '1234' });
  const [sessoesCaixa, setSessoesCaixa] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [historicoVendas, setHistoricoVendas] = useState([]);
  const [caixaMovimentos, setCaixaMovimentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [historicoCompras, setHistoricoCompras] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);

  const solicitarDemoFirebase = async () => {
    if (!userId) return;
    try {
      await setDoc(doc(db, "solicitacoes_demo", userId), {
        email: usuarioAutenticado, uid: userId, dataSolicitacao: new Date().toISOString(), status: 'pendente_analise'
      }, { merge: true });
      setDemoSolicitada(true);
      alert('Solicitação enviada!');
    } catch (err) {
      alert(tx('Erro ao enviar solicitação.', 'Error al enviar solicitud.', 'Error sending request.'));
    }
  };

  // 🔒 ATUALIZADO: MOTOR CLOUD-FIRST (A nuvem é a fonte absoluta da verdade)
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
            if (status === 'aguardando_pagamento' && diffDias <= 7) status = 'ativo';
            setStatusLoja(status);
          } else {
            const novaDataCriacao = new Date().toISOString();
            await setDoc(docRef, { email: user.email, status: 'aguardando_pagamento', dataCriacao: novaDataCriacao }, { merge: true });
            setStatusLoja('ativo');
          }

          const dadosLojaSnap = await getDoc(doc(db, "lojas", user.uid, "dados", "operacao"));
          if (dadosLojaSnap.exists()) {
            // SE A LOJA TEM DADOS NA NUVEM, PUXA TUDO DAQUI!
            const d = dadosLojaSnap.data();
            setProdutos(d.produtos ? d.produtos.map(p => normalizarProduto(p)) : produtosIniciais.map((p, idx) => normalizarProduto(p, idx)));
            setClientes(d.clientes ? d.clientes.map(c => normalizarCliente(c)) : clientesIniciais.map(c => normalizarCliente(c)));
            setHistoricoVendas(d.historicoVendas || []);
            setCaixaMovimentos(d.caixaMovimentos || []);
            setDespesas(d.despesas || []);
            setHistoricoCompras(d.historicoCompras || []);
            setFornecedores(d.fornecedores || []);
            setRegrasDesconto(d.regrasDesconto || { verdeMax: 5, amareloMax: 12, exigirSenhaVermelho: true, senhaGerente: '1234' }); 
            setVendedores(d.vendedores && d.vendedores.length > 0 ? d.vendedores : [{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', percentual: 0, comissaoTipo: 'lucro' }]);
            setSessoesCaixa(d.sessoesCaixa || []);
          } else {
            // CONTA NOVA (ZERADA): Ignorar qualquer lixo local e forçar arrays vazios/padrão
            setProdutos(produtosIniciais.map((p, idx) => normalizarProduto(p, idx)));
            setClientes(clientesIniciais.map(c => normalizarCliente(c)));
            setHistoricoVendas([]);
            setCaixaMovimentos([]);
            setDespesas([]);
            setHistoricoCompras([]);
            setFornecedores([]);
            setSessoesCaixa([]);
            setVendedores([{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', percentual: 0, comissaoTipo: 'lucro' }]);
          }
        } catch (err) { 
          setStatusLoja('ativo'); 
          // FALLBACK OFFLINE SEGURO: Puxa o cache isolado ou o legado genérico se for a primeira vez offline
          try {
            const puxar = (chave) => {
              const val = localStorage.getItem(`zenos_${user.uid}_${chave}`);
              if (val) return JSON.parse(val);
              const legado = localStorage.getItem(`zenos_${chave}`);
              if (legado) return JSON.parse(legado);
              return null;
            };
            
            const p = puxar('produtos'); if(p) setProdutos(p); else setProdutos(produtosIniciais.map((x, idx) => normalizarProduto(x, idx)));
            const c = puxar('clientes'); if(c) setClientes(c); else setClientes(clientesIniciais.map(x => normalizarCliente(x)));
            const hv = puxar('historico_vendas'); if(hv) setHistoricoVendas(hv);
            const cm = puxar('caixa_movs'); if(cm) setCaixaMovimentos(cm);
            const d = puxar('despesas'); if(d) setDespesas(d);
            const hc = puxar('historico_compras'); if(hc) setHistoricoCompras(hc);
            const f = puxar('fornecedores'); if(f) setFornecedores(f);
            const sc = puxar('sessoes_caixa'); if(sc) setSessoesCaixa(sc);
            const rd = puxar('regras_desconto'); if(rd) setRegrasDesconto(rd); else setRegrasDesconto({ verdeMax: 5, amareloMax: 12, exigirSenhaVermelho: true, senhaGerente: '1234' });
            const vd = puxar('vendedores'); if(vd) setVendedores(vd); else setVendedores([{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', percentual: 0, comissaoTipo: 'lucro' }]);
          } catch(e){}
        } finally {
          // Destranca o sistema para permitir salvamentos
          setNuvemSincronizada(true);
        }
      } else {
        // SEM USUÁRIO (DESLOGADO): Destrói os dados locais da memória RAM
        setUsuarioAutenticado(null); setUserId(null); setStatusLoja(null); setOperadorAtivo(null);
        setNuvemSincronizada(false);
        setProdutos([]); setClientes([]); setHistoricoVendas([]); setCaixaMovimentos([]); setDespesas([]); setHistoricoCompras([]); setFornecedores([]); setSessoesCaixa([]); setVendedores([]);
      }
      setCarregandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const fazerLogout = async () => {
    if(window.confirm(tx('Encerrar a sessão principal desta loja?', '¿Cerrar sesión?', 'End session?'))) {
      await signOut(auth);
      // LIMPEZA ABSOLUTA DE MEMÓRIA NO LOGOUT
      setNuvemSincronizada(false);
      setProdutos([]); setClientes([]); setHistoricoVendas([]); setCaixaMovimentos([]); setDespesas([]); setHistoricoCompras([]); setFornecedores([]); setSessoesCaixa([]); setVendedores([]);
      
      setMostrarPainelExecutivo(false); 
      setOperadorAtivo(null);
      setValoresTopoVisiveis(true);
      setEcraAtual('hub');
    }
  };

  const trocarOperador = () => {
    setOperadorAtivo(null);
    setEcraAtual('hub');
    setMostrarPainelExecutivo(false);
  };

  const processarLoginOperador = (operador) => {
    setOperadorAtivo(operador);
    setEcraAtual('hub');
    setMostrarPainelExecutivo(false);
  };

  // 🔒 ATUALIZADO: SINCRONIZAÇÃO CIRÚRGICA (Envia apenas o que mudou usando chave segura)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_produtos`, JSON.stringify(produtos)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { produtos }, { merge: true }).catch(()=>{}); 
  }, [produtos, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_clientes`, JSON.stringify(clientes)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { clientes }, { merge: true }).catch(()=>{}); 
  }, [clientes, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_historico_vendas`, JSON.stringify(historicoVendas)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { historicoVendas }, { merge: true }).catch(()=>{}); 
  }, [historicoVendas, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_caixa_movs`, JSON.stringify(caixaMovimentos)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { caixaMovimentos }, { merge: true }).catch(()=>{}); 
  }, [caixaMovimentos, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_despesas`, JSON.stringify(despesas)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { despesas }, { merge: true }).catch(()=>{}); 
  }, [despesas, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_historico_compras`, JSON.stringify(historicoCompras)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { historicoCompras }, { merge: true }).catch(()=>{}); 
  }, [historicoCompras, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_fornecedores`, JSON.stringify(fornecedores)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { fornecedores }, { merge: true }).catch(()=>{}); 
  }, [fornecedores, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_regras_desconto`, JSON.stringify(regrasDesconto)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { regrasDesconto }, { merge: true }).catch(()=>{}); 
  }, [regrasDesconto, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (!nuvemSincronizada || !userId) return;
    localStorage.setItem(`zenos_${userId}_sessoes_caixa`, JSON.stringify(sessoesCaixa)); 
    setDoc(doc(db, "lojas", userId, "dados", "operacao"), { sessoesCaixa }, { merge: true }).catch(()=>{}); 
  }, [sessoesCaixa, userId, nuvemSincronizada]);

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

  const vendasValidas = historicoVendas.filter(v => v.estado === 'concluida');
  
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

  const idVendedorAtual = (operadorAtivo && operadorAtivo.id) ? operadorAtivo.id : 'admin';
  const sessaoAtiva = sessoesCaixa.find(s => s.operadorId === idVendedorAtual && s.status === 'aberta');
  const timestampSessao = sessaoAtiva ? parseInt(sessaoAtiva.id.split('-')[1]) : 0;

  const vendasDestaSessao = sessaoAtiva ? vendasValidas.filter(v => v.vendedorId === idVendedorAtual && parseInt(v.id.split('-')[1]) >= timestampSessao) : [];
  const movsSessao = sessaoAtiva ? caixaMovimentos.filter(m => m.sessaoId === sessaoAtiva.id) : [];

  const entradasSessaoBRL = vendasDestaSessao.reduce((acc, v) => {
    const pagDinheiro = (v.pagamentos || []).filter(p => p.formaId && p.formaId.startsWith('dinheiro')).reduce((sum, p) => sum + (p.valorConvertidoBRL || 0), 0);
    return acc + Math.max(0, pagDinheiro - (v.trocoBRL || 0));
  }, 0);

  const suprimentosSessaoBRL = movsSessao.filter(m => m.tipo === 'suprimento').reduce((acc, m) => acc + m.valorBRL, 0);
  const sangriasSessaoBRL = movsSessao.filter(m => m.tipo === 'sangria').reduce((acc, m) => acc + m.valorBRL, 0);
  const saldoSessaoFisicoBRL = (sessaoAtiva?.saldoInicial || 0) + entradasSessaoBRL + suprimentosSessaoBRL - sangriasSessaoBRL;

  const [modalCaixaAberto, setModalCaixaAberto] = useState(false);
  const [tipoMovCaixa, setTipoMovCaixa] = useState('suprimento'); 
  const [valoresMovCaixa, setValoresMovCaixa] = useState({ BRL: '', USD: '', EUR: '', PYG: '' });
  const [descMovCaixa, setDescMovCaixa] = useState('');

  const calcularTotalMovBRL = () => {
    return (parseFloat(String(valoresMovCaixa.BRL).replace(',','.')) || 0) +
           converterParaBRL(parseFloat(String(valoresMovCaixa.USD).replace(',','.')) || 0, 'USD') +
           converterParaBRL(parseFloat(String(valoresMovCaixa.EUR).replace(',','.')) || 0, 'EUR') +
           converterParaBRL(parseFloat(String(valoresMovCaixa.PYG).replace(',','.')) || 0, 'PYG');
  };
  const resetarValoresCaixa = () => setValoresMovCaixa({ BRL: '', USD: '', EUR: '', PYG: '' });

  const abrirTurnoDeCaixa = () => {
    const saldoIni = calcularTotalMovBRL();
    const novaSessao = {
      id: `SESSAO-${Date.now()}`,
      operadorId: idVendedorAtual,
      operadorNome: operadorAtivo?.nome || 'Administrador',
      saldoInicial: saldoIni,
      detalheAbertura: { ...valoresMovCaixa },
      status: 'aberta',
      abertura: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR')
    };
    setSessoesCaixa([novaSessao, ...sessoesCaixa]);
    setModalCaixaAberto(false);
    resetarValoresCaixa();
  };

  const registrarMovimentoCaixa = () => {
    if (!sessaoAtiva) return alert(tx('Precisa de abrir o turno de caixa primeiro.', 'Debe abrir turno primero.', 'Must open shift first.'));
    const valBRL = calcularTotalMovBRL();
    if (valBRL <= 0) return alert(tx('Insira um valor válido.', 'Ingrese un valor válido.', 'Enter a valid amount.'));
    if (tipoMovCaixa === 'sangria' && valBRL > saldoSessaoFisicoBRL) {
      if (!window.confirm(tx('O valor é maior que o saldo da SUA gaveta. Continuar?', 'El valor es mayor al saldo. ¿Continuar?', 'Value exceeds balance. Continue?'))) return;
    }
    const novoMov = { 
      id: Date.now(), sessaoId: sessaoAtiva.id, dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'), 
      tipo: tipoMovCaixa, valorBRL: valBRL, detalhesMoedas: { ...valoresMovCaixa }, 
      descricao: descMovCaixa || (tipoMovCaixa === 'suprimento' ? tx('Reforço de Fundo', 'Refuerzo de Caja', 'Float Fund') : tx('Retirada de Caixa', 'Retiro de Caja', 'Cash Withdrawal')), 
      operador: operadorAtivo?.nome 
    };
    setCaixaMovimentos([novoMov, ...caixaMovimentos]);
    setModalCaixaAberto(false);
    resetarValoresCaixa(); setDescMovCaixa('');
  };

  const processarFechamentoCego = () => {
    const valInformadoBRL = calcularTotalMovBRL();
    const diferenca = valInformadoBRL - saldoSessaoFisicoBRL;
    
    const dataFechoISO = new Date().toISOString();
    const dataFechoLocal = new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR');
    
    const sessoesAtualizadas = sessoesCaixa.map(s => {
      if (s.id === sessaoAtiva.id) {
        return { ...s, status: 'fechada', fechamento: dataFechoISO, saldoInformado: valInformadoBRL, detalheFechamento: { ...valoresMovCaixa }, diferenca: diferenca, saldoSistema: saldoSessaoFisicoBRL };
      }
      return s;
    });
    setSessoesCaixa(sessoesAtualizadas);

    const resumoEntradas = vendasDestaSessao.reduce((res, v) => {
      (v.pagamentos || []).forEach(p => {
        if (!res[p.rotulo]) res[p.rotulo] = 0;
        res[p.rotulo] += p.valorOriginal;
      });
      return res;
    }, {});

    const moedasContadasHTML = Object.entries(valoresMovCaixa).filter(([_,v]) => parseFloat(String(v).replace(',','.'))>0).map(([m,v]) => `<div style="display: flex; justify-content: space-between;"><span>Informado em ${m}:</span><span>${parseFloat(String(v).replace(',','.')).toFixed(2)}</span></div>`).join('');
    const temQuebra = Math.abs(diferenca) > 0.05;
    const descQuebra = temQuebra ? (diferenca < 0 ? 'FALTA DE CAIXA (QUEBRA NEGATIVA)' : 'SOBRA DE CAIXA (QUEBRA POSITIVA)') : 'CAIXA CONCILIADO CORRETAMENTE';

    const reciboFechoHTML = `
      <div style="font-family: monospace; font-size: 12px; width: 100%; text-align: left;">
        <div style="text-align: center; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 14px;">FECHAMENTO DE TURNO (FECHO Z)</h2>
          <div>ZenOS - SISTEMA DE GESTÃO</div>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        <div><strong>Operador:</strong> ${sessaoAtiva.operadorNome}</div>
        <div><strong>Abertura:</strong> ${sessaoAtiva.abertura}</div>
        <div><strong>Fecho:</strong> ${dataFechoLocal}</div>
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        
        <div style="margin-bottom: 5px;"><strong>>> MOVIMENTOS DE GAVETA</strong></div>
        <div style="display: flex; justify-content: space-between;"><span>Fundo Inicial (BRL):</span><span>${fmt(sessaoAtiva.saldoInicial || 0, 'BRL')}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Suprimentos (Reforço):</span><span>${fmt(suprimentosSessaoBRL, 'BRL')}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Sangrias (Retirada):</span><span>${fmt(sangriasSessaoBRL, 'BRL')}</span></div>
        
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        <div style="margin-bottom: 5px;"><strong>>> ENTRADAS DE VENDAS</strong></div>
        ${Object.keys(resumoEntradas).length > 0 ? Object.entries(resumoEntradas).map(([forma, valor]) => `<div style="display: flex; justify-content: space-between;"><span>${forma}:</span><span>${valor.toFixed(2)}</span></div>`).join('') : '<div style="text-align: center;">Nenhuma venda</div>'}
        
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        <div style="margin-bottom: 5px;"><strong>>> GAVETA FÍSICA (MOEDAS CONTADAS)</strong></div>
        ${moedasContadasHTML || '<div style="display: flex; justify-content: space-between;"><span>Sem moedas</span><span>0.00</span></div>'}
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;"><span>SALDO ESPERADO (BRL):</span><span>${fmt(saldoSessaoFisicoBRL, 'BRL')}</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;"><span>SALDO INFORMADO (BRL):</span><span>${fmt(valInformadoBRL, 'BRL')}</span></div>
        
        <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
        <div style="text-align: center; font-weight: bold; font-size: 12px; margin-top: 10px; color: #000;">
          DIFERENÇA (BRL): ${fmt(diferenca, 'BRL')}<br/>
          ${descQuebra}
        </div>
        
        <div style="margin-top: 40px; text-align: center;">
          _________________________________<br/>
          Assinatura do Operador<br/>
          ${sessaoAtiva.operadorNome}
        </div>
        <div style="margin-top: 40px; text-align: center;">
          _________________________________<br/>
          Conferência da Gerência
        </div>
      </div>
    `;

    const janelaImpressao = window.open('', '_blank', 'width=400,height=600');
    if (janelaImpressao) {
      janelaImpressao.document.write(`
        <!DOCTYPE html><html><head><title>Fecho de Turno</title><style>@page{margin:0;size:80mm auto;}body{margin:0;padding:10px;width:80mm;}</style></head>
        <body>${reciboFechoHTML}<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script></body></html>
      `);
      janelaImpressao.document.close();
    } else {
      alert("Bloqueador de pop-ups ativo. O talão de fecho não pôde ser impresso.");
    }

    setModalCaixaAberto(false);
    resetarValoresCaixa();
  };

  const temPermissao = (modulo) => {
    if (!operadorAtivo) return false;
    if (operadorAtivo.id === 'admin' || operadorAtivo.permissoes?.admin) return true;
    return !!operadorAtivo.permissoes?.[modulo];
  };

  const historicoVisivelParaOperador = patenteUsuario === 'gerencia' 
    ? historicoVendas 
    : historicoVendas.filter(v => String(v.vendedorId) === String(operadorAtivo?.id));

  const renderNavButton = (id, icone, texto, badge = null) => {
    const ativo = ecraAtual === id;
    
    const lidarComClique = () => {
      if (id === 'pdv' && !sessaoAtiva) {
        alert(tx('Acesso Bloqueado: Para iniciar vendas, abra primeiro o seu Turno de Caixa no painel financeiro da Home!', '¡Debe abrir turno de caja primero!', 'You must open a shift first!'));
        setEcraAtual('hub');
      } else {
        setEcraAtual(id);
      }
      setMenuNavAberto(false);
    };

    return (
      <button onClick={lidarComClique} style={{
        width: '100%',
        backgroundColor: ativo ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
        color: ativo ? '#ffffff' : '#94a3b8',
        border: 'none',
        borderLeft: ativo ? '4px solid #6366f1' : '4px solid transparent',
        borderRadius: '0 8px 8px 0',
        padding: '10px 12px',
        fontSize: '14px',
        fontWeight: ativo ? 700 : 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease-in-out',
        marginBottom: '2px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', filter: ativo ? 'grayscale(0%)' : 'grayscale(100%) opacity(0.6)' }}>{icone}</span>
          <span style={{ letterSpacing: '0.3px' }}>{texto}</span>
        </div>
        {badge && <span style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '11px', padding: '2px 8px', borderRadius: '999px', fontWeight: 800, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{badge.text}</span>}
      </button>
    );
  };

  if (carregandoAuth) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <ZenosLogo aoClicar={() => {}} />
          <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 700, letterSpacing: '2px' }}>A INICIAR SISTEMA...</span>
        </div>
      </div>
    );
  }

  if (!usuarioAutenticado) return <LandingPage/>;

  if (statusLoja === 'ativo' && !operadorAtivo) {
    return <TerminalLogin vendedores={vendedores} onLoginSuccess={processarLoginOperador} onSairLoja={fazerLogout} />;
  }
// RESTAURAÇÃO: TELA DE BLOQUEIO ORIGINAL ZENOS (PADRÃO PREMIUM) E PLANOS
  if (statusLoja !== 'ativo') {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#020617', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '20px', 
        fontFamily: 'system-ui, sans-serif', 
        // AQUI: A Mágica do Marketing Visual (Fundo com Gráficos + Gradiente Escuro para leitura)
        backgroundImage: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.98)), url("bg-dashboard.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}>
        
        {/* CARTÃO DE BLOQUEIO - DESIGN ORIGINAL RESTAURADO */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '40px 24px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{ height: '60px', width: 'auto', filter: 'drop-shadow(0 0 15px rgba(251, 191, 36, 0.2))' }} />
          </div>

          <h2 style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 900, margin: '0 0 16px 0', lineHeight: 1.2 }}>
            Licença Pendente /<br/>Teste Expirado
          </h2>

          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '24px' }}>
            O seu período de teste gratuito de 7 dias terminou ou a licença da loja aguarda ativação. Escolha um plano para desbloquear o terminal ZenOS de imediato.
          </p>

          {/* INNER CARD - CLOUD SAAS ENTERPRISE */}
          <div style={{ backgroundColor: '#020617', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid #1e293b' }}>
            <span style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Ativação Instantânea:</span>
            <span style={{ display: 'block', color: '#2dd4bf', fontSize: '16px', fontWeight: 900, marginBottom: '8px' }}>ZenOS Cloud SaaS Enterprise</span>
            <span style={{ display: 'block', color: '#64748b', fontSize: '11px', lineHeight: 1.5 }}>Aceda a relatórios avançados, gestão de filiais em tempo real e suporte prioritário.</span>
          </div>

          {/* BOTÕES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => setModalPlanosAberto(true)} style={{ padding: '16px', background: 'linear-gradient(135deg, #2dd4bf, #0f766e)', border: 'none', color: '#ffffff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 15px rgba(45, 212, 191, 0.3)', transition: 'all 0.2s' }}>
              Ver Opções de Planos
            </button>

            <button 
              onClick={solicitarDemoFirebase} 
              disabled={demoSolicitada}
              style={{ padding: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', color: demoSolicitada ? '#34d399' : '#e2e8f0', borderRadius: '12px', fontWeight: 800, cursor: demoSolicitada ? 'not-allowed' : 'pointer', fontSize: '14px', transition: 'all 0.2s' }}
            >
              {demoSolicitada ? 'Solicitação em Análise ✓' : 'Solicitar Extensão de Teste'}
            </button>

            <button onClick={() => signOut(auth)} style={{ background: 'transparent', color: '#f43f5e', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '13px', padding: '10px' }}>
              Sair e Voltar mais tarde
            </button>
          </div>
        </div>

        {/* MODAL DE PLANOS RESTAURADO COM TABELA COMPLETA E PREÇOS */}
        {modalPlanosAberto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(5px)' }}>
            <div style={{ backgroundColor: '#0b1120', border: '1px solid #334155', padding: '32px', borderRadius: '24px', textAlign: 'center', color: '#fff', maxWidth: '900px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              <span style={{ fontSize: '40px' }}>💎</span>
              <h3 style={{ margin: '12px 0 8px 0', fontSize: '24px', fontWeight: 900, color: '#f8fafc' }}>Escolha o seu Plano ZenOS</h3>
              <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
                Selecione o plano ideal para a sua operação e o ciclo de faturação.
              </p>

              {/* SELETORES DE CICLO */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px', backgroundColor: '#020617', padding: '6px', borderRadius: '12px', width: 'fit-content', margin: '0 auto 32px auto', flexWrap: 'wrap' }}>
                <button onClick={() => setCicloPlano('mensal')} style={{ backgroundColor: cicloPlano === 'mensal' ? '#4f46e5' : 'transparent', color: cicloPlano === 'mensal' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>Mensal</button>
                <button onClick={() => setCicloPlano('semestral')} style={{ backgroundColor: cicloPlano === 'semestral' ? '#4f46e5' : 'transparent', color: cicloPlano === 'semestral' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>Semestral (-10%)</button>
                <button onClick={() => setCicloPlano('anual')} style={{ backgroundColor: cicloPlano === 'anual' ? '#4f46e5' : 'transparent', color: cicloPlano === 'anual' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>Anual (Desconto Máx)</button>
              </div>

              {/* TABELA DE PREÇOS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px', textAlign: 'left' }}>
                
                {/* Básico */}
                <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 4px 0', color: '#e2e8f0', fontSize: '18px', fontWeight: 800 }}>Básico</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>Para pequenos lojistas.</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '35,00' : cicloPlano === 'semestral' ? '31,50' : '28,48'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>/mês</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ 1 Operador</li>
                    <li>✓ PDV Frente de Caixa</li>
                    <li>✓ Gestão de Produtos</li>
                    <li>✓ Controlo de Fiado</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Básico%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Assinar Básico</button>
                </div>

                {/* Essencial (Mais Popular) */}
                <div style={{ backgroundColor: '#0f172a', border: '2px solid #2dd4bf', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', transform: 'scale(1.02)' }}>
                  <span style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#2dd4bf', color: '#020617', fontSize: '10px', fontWeight: 900, padding: '4px 12px', borderRadius: '12px', textTransform: 'uppercase' }}>Mais Popular</span>
                  <h4 style={{ margin: '0 0 4px 0', color: '#2dd4bf', fontSize: '18px', fontWeight: 800 }}>Essencial</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>A operação completa.</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#2dd4bf', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '44,90' : cicloPlano === 'semestral' ? '40,41' : '33,57'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>/mês</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ Múltiplos Operadores</li>
                    <li>✓ Controlo de Permissões</li>
                    <li>✓ Painel Executivo / Dashboard</li>
                    <li>✓ Gestão de Despesas</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Essencial%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #2dd4bf, #0d9488)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 900, boxShadow: '0 4px 15px rgba(45, 212, 191, 0.4)' }}>Assinar Essencial</button>
                </div>

                {/* Pro Avançado */}
                <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 4px 0', color: '#e2e8f0', fontSize: '18px', fontWeight: 800 }}>Pro Avançado</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>Comissão e alta gestão.</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '59,90' : cicloPlano === 'semestral' ? '53,91' : '43,75'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>/mês</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ Módulo de Comissões</li>
                    <li>✓ Gestão de Mesas/Comandas</li>
                    <li>✓ Relatórios Avançados</li>
                    <li>✓ Suporte Prioritário</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Pro%20Avançado%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Assinar Pro</button>
                </div>
              </div>

              {/* Botões Inferiores */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => setModalPlanosAberto(false)} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', backgroundColor: '#1e293b', color: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>
                  Voltar para Bloqueio
                </button>
                <button onClick={() => { window.open('https://wa.me/5519995855839?text=Olá,%20gostaria%20de%20saber%20sobre%20o%20plano%20Multi-Filiais.', '_blank'); }} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', backgroundColor: '#020617', border: '1px solid #334155', color: '#38bdf8', cursor: 'pointer', fontWeight: 900, fontSize: '14px' }}>
                  🏢 Consultar Plano Multi-Filiais
                </button>
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
                <div onClick={() => setMenuNavAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}></div>
                
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, marginTop: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px 12px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '4px', width: '280px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' 
                }}>
                  
                  <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', backgroundColor: '#1e293b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏢</div>
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textTransform: 'capitalize' }}>
                          {localStorage.getItem('zenos_nome_loja') || (usuarioAutenticado ? usuarioAutenticado.split('@')[0].replace(/[._-]/g, ' ') : 'Minha Loja')}
                        </span>
                        <span style={{ fontSize: '11px', color: '#cbd5e1', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {usuarioAutenticado || 'loja@zenos.com'}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: '1px', backgroundColor: '#334155' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>ID: {userId ? userId.substring(0, 8).toUpperCase() : '---'}</span>
                      <span style={{ fontSize: '10px', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, textTransform: 'uppercase' }}>{patenteUsuario}</span>
                    </div>
                  </div>

                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 12px 8px 12px' }}>{t('modulosSistema')}</span>
                  
                  {renderNavButton('hub', '🏠', tx('Painel Inicial', 'Panel de Inicio', 'Home Dashboard'))}
                  {temPermissao('pdv') && renderNavButton('pdv', '🛒', t('pdvBalcao'))}
                  {temPermissao('produtos') && renderNavButton('compras', '📥', tx('Entrada / Compras', 'Entrada / Compras', 'Purchases / Stock In'))}
                  {temPermissao('mesas') && renderNavButton('mesas', '🍽️', tx('Mesas / Comandas', 'Mesas / Comandas', 'Tables / Tabs'))}
                  {temPermissao('produtos') && renderNavButton('produtos', '📦', t('produtosEstoque'), { bg: '#0284c7', color: '#fff', text: produtos.length })}
                  {temPermissao('clientes') && renderNavButton('clientes', '👥', t('clientesFiado'), totalFiadoAbertoBRL > 0 ? { bg: '#dc2626', color: '#fff', text: tx('Fiado', 'Deuda', 'Debt') } : null)}
                  {temPermissao('produtos') && renderNavButton('fornecedores', '🏭', tx('Fornecedores', 'Proveedores', 'Suppliers'))}
                  {temPermissao('vendas') && renderNavButton('vendas', '📑', t('vendasDevolucoes'))}
                  
                  <div style={{ height: '1px', backgroundColor: '#334155', margin: '8px 12px' }}></div>
                  
                  {temPermissao('inteligencia') && renderNavButton('inteligencia', '📊', tx('Inteligência', 'Inteligencia', 'Intelligence'))}
                  {temPermissao('admin') && renderNavButton('comissoes', '🤝', tx('Comissões', 'Comisiones', 'Commissions'))}
                  {temPermissao('admin') && renderNavButton('dashboardMobile', '📱', tx('App Mobile (CEO)', 'App Mobile (CEO)', 'Mobile App (CEO)'))}
                  {temPermissao('despesas') && renderNavButton('despesas', '💸', tx('Contas a Pagar', 'Cuentas a Pagar', 'Expenses'), { bg: '#e11d48', color: '#fff', text: despesas.filter(d=>d.status==='pendente').length || '0' })}
                  {temPermissao('admin') && renderNavButton('configuracoes', '⚙️', tx('Configurações', 'Configuraciones', 'Settings'))}
                  {temPermissao('admin') && renderNavButton('auditoria_caixas', '🏦', tx('Auditoria de Caixas', 'Auditoría de Cajas', 'Drawer Audit'))}
                  {temPermissao('admin') && renderNavButton('migracao', '📥', tx('Importar Dados', 'Importar Datos', 'Import Data'))}
                </div>
              </>
            )}
          </div>
          <ZenosLogo aoClicar={() => setEcraAtual('hub')} />
        </div>

       <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '4px 8px', gap: '6px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
            <span style={{ fontSize: '12px' }}>🗣</span>
            <select value={idioma} onChange={(e) => setIdioma(e.target.value)} style={{ backgroundColor: 'transparent', color: '#f8fafc', fontSize: '11px', fontWeight: 900, border: 'none', outline: 'none', cursor: 'pointer' }}>
              <option value="pt" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Português (PT)</option>
              <option value="es" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Español (ES)</option>
              <option value="en" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>English (EN)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '4px 8px', gap: '6px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 900 }}>💵</span>
                <select value={moeda} onChange={(e) => setMoeda(e.target.value)} style={{ backgroundColor: 'transparent', color: '#34d399', fontSize: '11px', fontWeight: 900, border: 'none', outline: 'none', cursor: 'pointer' }}>
                  <option value="BRL" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>BRL (R$)</option>
                  <option value="USD" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>USD ($)</option>
                  <option value="EUR" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>EUR (€)</option>
                  <option value="PYG" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>PYG (₲)</option>
                </select>
              </div>
              <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }}></div>
              <button onClick={() => setModalCambioAberto(true)} title={tx('Ajustar Cotações', 'Ajustar Cotizaciones', 'Adjust Rates')} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>⚙️</button>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }} className="hide-mobile">Operador:</span>
            <span style={{ color: patenteUsuario === 'gerencia' ? '#fbbf24' : '#818cf8', fontWeight: 900, fontSize: '12px' }}>{operadorAtivo?.nome || 'Admin'}</span>
          </div>
          <button onClick={trocarOperador} style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid #6366f1', color: '#818cf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Trocar Operador', 'Cambiar Operador', 'Switch User')}</button>
        </div>
      </header>

      <main className="no-print" style={{ padding: '20px 16px', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box' }}>
        
 {ecraAtual === 'hub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 1. CABEÇALHO DA HOME */}
            <div className="mobile-padding" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid #334155', borderRadius: '24px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: '1 1 100%', minWidth: '250px' }}>
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>ZenOS (Cloud)</span>
                <h1 className="mobile-text-lg" style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', margin: '8px 0 4px 0', letterSpacing: '-0.5px' }}>{tx(`Olá, ${operadorAtivo?.nome || 'Admin'}!`, `¡Hola, ${operadorAtivo?.nome || 'Admin'}!`, `Hello, ${operadorAtivo?.nome || 'Admin'}!`)}</h1>
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
                <button onClick={() => setValoresTopoVisiveis(!valoresTopoVisiveis)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', fontSize: '20px', cursor: 'pointer', padding: '12px', outline: 'none', transition: 'all 0.3s' }}>
                  {valoresTopoVisiveis ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            {/* 2. TURNO DE CAIXA (LIVRE PARA TODOS QUE TÊM ACESSO AO CAIXA/PDV) */}
            {temPermissao('pdv') && (
              <div className="mobile-padding" style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ fontSize: '24px' }}>💵</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Meu Turno de Caixa</h3></div>
                  <span style={{ backgroundColor: sessaoAtiva ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)', color: sessaoAtiva ? '#10b981' : '#f43f5e', padding: '8px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 900, border: `1px solid ${sessaoAtiva ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}` }}>
                    {sessaoAtiva ? `Aberto • Saldo: ${fmt(saldoSessaoFisicoBRL)}` : 'FECHADO'}
                  </span>
                </div>
                
                {!sessaoAtiva ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <span style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>Você precisa de abrir o seu turno com um fundo de troco para começar a vender no caixa.</span>
                    <button onClick={() => { setTipoMovCaixa('abertura'); setModalCaixaAberto(true); }} style={{ padding: '14px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#ffffff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>🔓 Abrir Turno de Caixa</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                      <button onClick={() => { setTipoMovCaixa('suprimento'); setModalCaixaAberto(true); }} style={{ flex: '1 1 calc(50% - 5px)', padding: '14px 10px', backgroundColor: '#021e15', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#34d399', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '12px' }}>+ Entrada (Reforço)</button>
                      <button onClick={() => { setTipoMovCaixa('sangria'); setModalCaixaAberto(true); }} style={{ flex: '1 1 calc(50% - 5px)', padding: '14px 10px', backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.5)', color: '#fb7185', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '12px' }}>- Saída (Sangria)</button>
                      <button onClick={() => { setTipoMovCaixa('fechamento'); setModalCaixaAberto(true); }} style={{ flex: '1 1 100%', padding: '14px', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>🔒 Encerrar Turno</button>
                    </div>
                    <div style={{ flex: 1, backgroundColor: '#020617', borderRadius: '12px', border: '1px solid #1e293b', padding: '16px', overflowY: 'auto', maxHeight: '250px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', display: 'block', letterSpacing: '1px' }}>Movimentações Deste Turno</span>
                      {movsSessao.length === 0 ? <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', marginTop: '30px' }}>-</div> : (
                        movsSessao.map(m => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                            <div><span style={{ color: '#e2e8f0', fontWeight: 700 }}>{m.tipo === 'suprimento' ? 'Entrada' : 'Saída'}: {m.descricao}</span><br/><span style={{ color: '#64748b', fontSize: '10px', marginTop: '4px', display: 'inline-block' }}>{m.dataHora}</span></div>
                            <span style={{ fontWeight: 900, color: m.tipo === 'suprimento' ? '#34d399' : '#fb7185', fontSize: '14px' }}>{m.tipo === 'suprimento' ? '+' : '-'}{fmt(m.valorBRL, 'BRL')}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 3. PAINEL EXECUTIVO E FINANCEIRO (RESTRITO AO ADMIN) */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>💰</span><span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Faturamento Real</span></div>
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
                )}
              </div>
            )}

     {/* 4. ACESSOS OPERACIONAIS */}
     <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', marginBottom: '8px' }}>
       <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1))' }}></div>
       <span style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center' }}>{tx('Acessos Operacionais', 'Accesos Operativos', 'Operational Access')}</span>
       <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.1))' }}></div>
     </div>

     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>

       {temPermissao('pdv') && (
         <div onClick={() => setEcraAtual('pdv')} style={{ backgroundColor: '#021e15', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
           <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(16,185,129,0.4)' }}>🛒</div>
           <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>PDV Balcão</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Frente de Caixa / Pré-pedidos</span></div>
         </div>
       )}
       {temPermissao('produtos') && (
         <div onClick={() => setEcraAtual('compras')} style={{ backgroundColor: '#2b1404', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: '20px', padding: '24px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
           <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 8px 20px rgba(249,115,22,0.4)' }}>📥</div>
           <div><h2 style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', margin: '0 0 4px 0' }}>PDV Compras</h2><span style={{fontSize: '11px', color: '#94a3b8'}}>Entrada rápida de estoque</span></div>
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

        {ecraAtual === 'pdv' && <PDV produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} patenteUsuario={patenteUsuario} idioma={idioma} regrasDesconto={regrasDesconto} operadorAtivo={operadorAtivo} sessaoAtiva={sessaoAtiva} />}
        {ecraAtual === 'compras' && <PDVCompras produtos={produtos} setProdutos={setProdutos} fornecedores={fornecedores} setFornecedores={setFornecedores} despesas={despesas} setDespesas={setDespesas} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoCompras={historicoCompras} setHistoricoCompras={setHistoricoCompras} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'fornecedores' && <Fornecedores fornecedores={fornecedores} setFornecedores={setFornecedores} moeda={moeda} tx={tx} />}
        {ecraAtual === 'mesas' && <Mesas produtos={produtos} fmt={fmt} tx={tx} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} moeda={moeda} idioma={idioma} />}
        {ecraAtual === 'produtos' && <Produtos produtos={produtos} setProdutos={setProdutos} fornecedoresGlobais={fornecedores} moeda={moeda} fmt={fmt} t={t} tx={tx} />}
        {ecraAtual === 'inteligencia' && <EstoqueInteligente produtos={produtos} fmt={fmt} />}
        {ecraAtual === 'comissoes' && <Comissoes historicoVendas={historicoVisivelParaOperador} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} operadorAtivo={operadorAtivo} regrasDesconto={regrasDesconto} />}
        {ecraAtual === 'dashboardMobile' && <DashboardMobile historicoVendas={historicoVendas} despesas={despesas} clientes={clientes} produtos={produtos} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} />}
        {ecraAtual === 'clientes' && <Clientes clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} />}
        {ecraAtual === 'vendas' && <Vendas historicoVendas={historicoVisivelParaOperador} setHistoricoVendas={setHistoricoVendas} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} fmt={fmt} t={t} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterDeBRL={converterDeBRL} />}
        {ecraAtual === 'migracao' && <Migracao produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} t={t} tx={tx} />}
        {ecraAtual === 'configuracoes' && <Configuracoes produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} despesas={despesas} setDespesas={setDespesas} moeda={moeda} fmt={fmt} tx={tx} regrasDesconto={regrasDesconto} setRegrasDesconto={setRegrasDesconto} vendedores={vendedores} setVendedores={(novosVendedores) => { setVendedores(novosVendedores); localStorage.setItem(`zenos_${userId}_vendedores`, JSON.stringify(novosVendedores)); if (userId) setDoc(doc(db, "lojas", userId, "dados", "operacao"), { vendedores: novosVendedores }, { merge: true }); }} />}
        {ecraAtual === 'auditoria_caixas' && <GestaoCaixas sessoesCaixa={sessoesCaixa} fmt={fmt} tx={tx} />}
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
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{tipoMovCaixa === 'sangria' ? tx('Registrar Sangria (-)', 'Registrar Sangría (-)', 'Cash Drop (-)') : tipoMovCaixa === 'suprimento' ? tx('Registrar Suprimento (+)', 'Registrar Suplemento (+)', 'Cash In (+)') : tipoMovCaixa === 'abertura' ? tx('Abertura de Turno', 'Apertura de Caja', 'Open Shift') : tx('Fechamento Cego de Caixa', 'Cierre Ciego de Caja', 'Blind Cash Closeout')}</h3>
              </div>
              <button onClick={() => setModalCaixaAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            {tipoMovCaixa === 'fechamento' || tipoMovCaixa === 'abertura' ? (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
                  {tx('Conte as notas e moedas físicas na gaveta e digite o total exato abaixo.', 'Cuente el efectivo físico en la gaveta e ingrese el total exacto.', 'Count the physical cash in the drawer and enter the exact total below.')}
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {['BRL', 'USD', 'EUR', 'PYG'].map(m => (
                    <div key={m}>
                      <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{m}:</label>
                      <input type="text" value={valoresMovCaixa[m]} onChange={(e) => setValoresMovCaixa({...valoresMovCaixa, [m]: e.target.value})} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #4f46e5', borderRadius: '8px', color: '#fff', fontSize: '18px', fontWeight: 900, textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {['BRL', 'USD', 'EUR', 'PYG'].map(m => (
                    <div key={m}>
                      <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{m}:</label>
                      <input type="text" value={valoresMovCaixa[m]} onChange={(e) => setValoresMovCaixa({...valoresMovCaixa, [m]: e.target.value})} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: `1px solid ${tipoMovCaixa === 'sangria' ? '#f43f5e' : '#10b981'}`, borderRadius: '8px', color: tipoMovCaixa === 'sangria' ? '#fb7185' : '#34d399', fontSize: '18px', fontWeight: 900, textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{tx('Motivo / Descrição:', 'Motivo / Descripción:', 'Reason / Description:')}</label>
                  <input type="text" value={descMovCaixa} onChange={(e) => setDescMovCaixa(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '13px', padding: '12px', outline: 'none', marginTop: '8px', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <button onClick={tipoMovCaixa === 'fechamento' ? processarFechamentoCego : (tipoMovCaixa === 'abertura' ? abrirTurnoDeCaixa : registrarMovimentoCaixa)} style={{ width: '100%', background: tipoMovCaixa === 'sangria' ? 'linear-gradient(135deg, #e11d48, #be123c)' : tipoMovCaixa === 'suprimento' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer' }}>
              {tipoMovCaixa === 'fechamento' ? tx('Auditar e Imprimir Fecho', 'Auditar e Imprimir', 'Audit & Print') : (tipoMovCaixa === 'abertura' ? tx('Abrir Turno com Saldo', 'Abrir Turno', 'Open Shift') : tx('Registrar na Gaveta', 'Registrar', 'Save Record'))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
