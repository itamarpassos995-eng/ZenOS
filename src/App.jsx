import TerminalLogin from './components/TerminalLogin';
import React, { useState, useEffect, useRef } from 'react';
import { traducoes, moedasConfig, normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from './data';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { inspectLocalSchemaVersion, PERSISTENCE_STATUS_EVENT, notifyPersistenceStatus } from './core/persistenceSafety';
import { persistV1OperationFieldSafe, persistV1BusinessOperationSafe, recordSyncMetric } from './core/productionSync';
import { cloneSyncValue, hasLocalSyncChange, syncValuesEqual } from './core/syncMerge';
import { zenosStorage } from './core/storage';
import { obterFinanceiroVenda } from './core/salesFinancials';
import { registroEhDoDiaLocal } from './core/dates';
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
import ZenModal from './components/ZenModal';
import { normalizarPerfilLoja, lerPerfilLojaLocal, salvarPerfilLojaLocal, limparPerfilLojaLocal } from './core/storeProfile';
import { assinarLivroFinanceiro, registrarLancamentoFinanceiro } from './core/financialLedger';
import { calcularResumoSessao, calcularConciliacaoEletronicaSessao, timestampSessao, timestampVenda } from './core/cashSession';
import { normalizarRegrasComissao, REGRAS_COMISSAO_PADRAO } from './core/commissionEngine';
import { normalizarRegrasMargem } from './core/profitability';
import { patenteEfetivaOperador } from './core/accessControl';
import { criarCredencialPin, operadorRequerTrocaPin, pinEhFraco } from './core/operatorPin';
import { ZenSidebar, ZenTopbar, ZenHero, ZenKpiCard, ZenQuickCard } from './components/ZenVisualLayout';
import './zenos-dashboard.css';

const CURRENT_SCHEMA_VERSION = 1;

const TAXAS_CAMBIO_PADRAO = Object.freeze({ BRL: 1.0, USD: 0.185, EUR: 0.165, PYG: 1380.0 });
const TAXAS_INPUT_PADRAO = Object.freeze({ USD: '5.40', EUR: '6.05', PYG: '1380' });
const REGRAS_DESCONTO_PADRAO = Object.freeze({
  verdeMax: 5,
  amareloMax: 12,
  margemIdeal: 30,
  margemMinima: 15,
  exigirSenhaVermelho: true,
  senhaGerente: '',
});

const normalizarRegrasDescontoSeguras = (regras = {}) => {
  const base = { ...REGRAS_DESCONTO_PADRAO, ...(regras || {}) };
  const margem = normalizarRegrasMargem(base);
  return { ...base, margemIdeal: margem.margemIdeal, margemMinima: margem.margemMinima };
};

const normalizarTaxasCambio = (taxas = {}) => ({
  BRL: 1,
  USD: Number(taxas?.USD) > 0 ? Number(taxas.USD) : TAXAS_CAMBIO_PADRAO.USD,
  EUR: Number(taxas?.EUR) > 0 ? Number(taxas.EUR) : TAXAS_CAMBIO_PADRAO.EUR,
  PYG: Number(taxas?.PYG) > 0 ? Number(taxas.PYG) : TAXAS_CAMBIO_PADRAO.PYG,
});

const taxasInputAPartirDasTaxas = (taxas = TAXAS_CAMBIO_PADRAO) => {
  const t = normalizarTaxasCambio(taxas);
  return {
    USD: (1 / t.USD).toFixed(2),
    EUR: (1 / t.EUR).toFixed(2),
    PYG: String(Math.round(t.PYG)),
  };
};

// ATT 01: somente inspeciona a versão. Nenhuma migração é executada automaticamente.
inspectLocalSchemaVersion(CURRENT_SCHEMA_VERSION);

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
  const [planoLoja, setPlanoLoja] = useState('basico');
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  
  // 🔒 MOTOR DE SINCRONIZAÇÃO (TRANCA DE DADOS)
  const [nuvemSincronizada, setNuvemSincronizada] = useState(false);
  const [falhaBootstrapNuvem, setFalhaBootstrapNuvem] = useState(null);
  const [statusSincronizacao, setStatusSincronizacao] = useState('PENDENTE');
  const [erroSincronizacao, setErroSincronizacao] = useState('');
  const [novoPinObrigatorio, setNovoPinObrigatorio] = useState('');
  const [confirmarPinObrigatorio, setConfirmarPinObrigatorio] = useState('');
  const [erroPinObrigatorio, setErroPinObrigatorio] = useState('');

  // 🛡️ Inicialização Limpa: Não puxar do cache genérico na inicialização
  const [vendedores, setVendedores] = useState([]);
  const [operadorAtivo, setOperadorAtivo] = useState(null); 
  const patenteUsuario = patenteEfetivaOperador(operadorAtivo); 

  const [modalPlanosAberto, setModalPlanosAberto] = useState(false);
  const [demoSolicitada, setDemoSolicitada] = useState(false);
  const [cicloPlano, setCicloPlano] = useState('anual');

  const [ecraAtual, setEcraAtual] = useState('hub');
  const [menuNavAberto, setMenuNavAberto] = useState(false);
  const [sidebarCompacta, setSidebarCompacta] = useState(false);
  const [temaUi, setTemaUi] = useState('dark');
  const [idioma, setIdioma] = useState('pt');
  const [moeda, setMoeda] = useState('BRL');
  
  const [mostrarPainelExecutivo, setMostrarPainelExecutivo] = useState(false);
  const [valoresTopoVisiveis, setValoresTopoVisiveis] = useState(true);

  const [taxasCambio, setTaxasCambio] = useState(() => ({ ...TAXAS_CAMBIO_PADRAO }));
  const [taxasInput, setTaxasInput] = useState(() => ({ ...TAXAS_INPUT_PADRAO }));
  const [modalCambioAberto, setModalCambioAberto] = useState(false);

  // Variáveis Nascem Vazias (Isolamento de Memória RAM)
  const [regrasDesconto, setRegrasDesconto] = useState(() => normalizarRegrasDescontoSeguras(REGRAS_DESCONTO_PADRAO));
  const [regrasComissao, setRegrasComissao] = useState(() => normalizarRegrasComissao(REGRAS_COMISSAO_PADRAO));
  const [sessoesCaixa, setSessoesCaixa] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [historicoVendas, setHistoricoVendas] = useState([]);
  const [caixaMovimentos, setCaixaMovimentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [historicoCompras, setHistoricoCompras] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [livroFinanceiro, setLivroFinanceiro] = useState([]);
  const [perfilLoja, setPerfilLoja] = useState(() => normalizarPerfilLoja({}));
  const [modalPerfilRapido, setModalPerfilRapido] = useState(false);
  const [perfilRapidoErro, setPerfilRapidoErro] = useState('');
  const [perfilRapidoRascunho, setPerfilRapidoRascunho] = useState(() => normalizarPerfilLoja({}));
  const syncBaseRef = useRef(new Map());
  const syncRevisionRef = useRef(new Map());
  const syncWriteQueueRef = useRef(new Map());
  const syncDeferredRemoteRef = useRef(new Map());
  const syncCamposRef = useRef(new Map());
  const [modalAppZen, setModalAppZen] = useState(null);

  const avisarAppZen = ({ variante = 'info', titulo, mensagem, detalhes = [] }) =>
    setModalAppZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });

  const confirmarAppZen = ({ variante = 'warning', titulo, mensagem, detalhes = [], confirmarTexto = 'Confirmar' }) =>
    new Promise(resolve => setModalAppZen({ variante, titulo, mensagem, detalhes, confirmarTexto, cancelarTexto: 'Cancelar', resolver: resolve }));

  const registrarBaseSyncCampo = (field, value, revision = null) => {
    syncBaseRef.current.set(field, cloneSyncValue(value));
    if (revision !== null && revision !== undefined) syncRevisionRef.current.set(field, Number(revision) || 0);
  };

  const aplicarCampoRemoto = ({ field, value, setter, revision = null, localStorageKey = null }) => {
    const revisionNum = revision !== null && revision !== undefined ? Number(revision) || 0 : null;
    const revisionVista = syncRevisionRef.current.get(field);
    if (revisionNum !== null && revisionVista !== undefined && revisionNum <= revisionVista) return;

    const fila = syncWriteQueueRef.current.get(field);
    if (fila?.running || fila?.desired) {
      // Nunca sobrescrever uma alteração local ainda não confirmada. O snapshot fica
      // aguardando; a transação fará o merge contra a versão mais nova da nuvem.
      syncDeferredRemoteRef.current.set(field, { field, value: cloneSyncValue(value), setter, revision: revisionNum, localStorageKey });
      recordSyncMetric('snapshotDeferred', field);
      return;
    }

    registrarBaseSyncCampo(field, value, revisionNum);
    if (localStorageKey) {
      try { zenosStorage.setItem(localStorageKey, JSON.stringify(value)); } catch (_) {}
    }
    setter(prev => {
      if (syncValuesEqual(prev, value)) return prev;
      return cloneSyncValue(value);
    });
    recordSyncMetric('snapshotApplied', field);
  };

  const persistirCampoSeguro = ({ field, value, setter, localStorageKey }) => {
    if (!nuvemSincronizada || !userId) return;
    const baseAtual = syncBaseRef.current.get(field);
    // A BASE é atualizada ANTES de aplicar snapshots remotos. Portanto, igualdade
    // com a BASE é uma prova de que não existe alteração local a persistir. Além de
    // eliminar o eco sem write/read, isto evita a corrida de um simples flag: se o
    // usuário editar entre o snapshot e o useEffect, o valor já difere da BASE e a
    // alteração local não é suprimida.
    if (!hasLocalSyncChange(value, baseAtual)) {
      recordSyncMetric('writesSkipped', field);
      return;
    }
    let fila = syncWriteQueueRef.current.get(field);
    if (!fila) {
      fila = { running: false, desired: null, version: 0 };
      syncWriteQueueRef.current.set(field, fila);
    }
    fila.version += 1;
    fila.desired = { value: cloneSyncValue(value), setter, localStorageKey, version: fila.version };
    if (fila.running) return;

    const drenar = async () => {
      fila.running = true;
      try {
        while (fila.desired) {
          const atual = fila.desired;
          fila.desired = null;
          const baseValue = syncBaseRef.current.get(field);
          const resultado = await persistV1OperationFieldSafe({ db, userId, field, value: atual.value, baseValue, localStorageKey: atual.localStorageKey });
          if (!resultado?.cloudOk) {
            // Sem retry automático: quota/rede/erro não pode virar tempestade de writes.
            // Se não chegou uma alteração local mais nova enquanto a gravação falhava,
            // volta a UI para a última BASE confirmada. Assim quota/rede nunca produz
            // um falso "salvou" que desaparece após F5.
            if (!fila.desired && baseValue !== undefined && typeof atual.setter === 'function') {
              atual.setter(prev => syncValuesEqual(prev, baseValue) ? prev : cloneSyncValue(baseValue));
            }
            break;
          }
          const confirmado = resultado.value === undefined ? atual.value : resultado.value;
          registrarBaseSyncCampo(field, confirmado, resultado.revision);
          if (typeof atual.setter === 'function' && !syncValuesEqual(confirmado, atual.value)) {
            atual.setter(prev => syncValuesEqual(prev, confirmado) ? prev : cloneSyncValue(confirmado));
          }
        }
      } finally {
        fila.running = false;
        const pendenteRemoto = syncDeferredRemoteRef.current.get(field);
        if (!fila.desired && pendenteRemoto) {
          syncDeferredRemoteRef.current.delete(field);
          aplicarCampoRemoto(pendenteRemoto);
        }
        // Se um novo estado chegou exatamente ao finalizar a fila, inicia nova drenagem.
        if (fila.desired && !fila.running) persistirCampoSeguro({ field, ...fila.desired, setter: fila.desired.setter, localStorageKey: fila.desired.localStorageKey });
      }
    };
    void drenar();
  };

  const commitOperacaoCritica = async (changes = [], { guards = [], operationKey = null } = {}) => {
    if (!nuvemSincronizada || !userId) {
      return { ok:false, cloudOk:false, error:new Error('Nuvem não confirmada. A operação não foi finalizada para evitar perda de dados.'), values:{}, revisions:{} };
    }
    const preparados = (changes || []).map(change => ({
      ...change,
      baseValue: syncBaseRef.current.get(change.field),
      localStorageKey: change.localStorageKey || `zenos_${userId}_${change.storageSuffix || change.field}`,
    }));
    const resultado = await persistV1BusinessOperationSafe({ db, userId, changes: preparados, guards, operationKey });
    if (resultado?.cloudOk) {
      for (const change of preparados) {
        const confirmado = resultado.values?.[change.field] === undefined ? change.value : resultado.values[change.field];
        registrarBaseSyncCampo(change.field, confirmado, resultado.revisions?.[change.field]);
      }
    }
    return resultado;
  };


  const commitVendaCritica = async ({ changes = [], financialEntries = [], stockEvents = [], guards = [], operationKey = null } = {}) => {
    if (!nuvemSincronizada || !userId) {
      return { ok:false, cloudOk:false, error:new Error('Nuvem não confirmada. Venda/pré-pedido não foi finalizado.'), values:{}, revisions:{} };
    }
    const preparados = (changes || []).map(change => ({
      ...change,
      baseValue: syncBaseRef.current.get(change.field),
      localStorageKey: change.localStorageKey || `zenos_${userId}_${change.storageSuffix || change.field}`,
    }));
    const resultado = await persistV1BusinessOperationSafe({ db, userId, changes: preparados, financialEntries, stockEvents, guards, operationKey });
    if (resultado?.cloudOk) {
      for (const change of preparados) {
        const confirmado = resultado.values?.[change.field] === undefined ? change.value : resultado.values[change.field];
        registrarBaseSyncCampo(change.field, confirmado, resultado.revisions?.[change.field]);
      }
      if (Array.isArray(resultado.financialEntries) && resultado.financialEntries.length > 0) {
        setLivroFinanceiro(atual => {
          const mapa = new Map((atual || []).map(item => [String(item.id), item]));
          resultado.financialEntries.forEach(item => mapa.set(String(item.id), item));
          return [...mapa.values()].sort((a,b)=>String(b?.createdAt||'').localeCompare(String(a?.createdAt||'')));
        });
      }
    }
    return resultado;
  };



  useEffect(() => {
    const recalcularStatus = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { setStatusSincronizacao('OFFLINE'); return; }
      const estados = [...syncCamposRef.current.values()];
      if (estados.some(x => x.status === 'ERRO')) {
        const ultimoErro = [...syncCamposRef.current.values()].reverse().find(x => x.status === 'ERRO' && x.error);
        setErroSincronizacao(ultimoErro?.error || 'Existe uma falha de sincronização pendente.');
        setStatusSincronizacao('ERRO');
      } else if (estados.some(x => x.status === 'PENDENTE')) {
        setErroSincronizacao(''); setStatusSincronizacao('PENDENTE');
      } else if (estados.some(x => x.status === 'SALVANDO')) {
        setErroSincronizacao(''); setStatusSincronizacao('SALVANDO');
      } else if (estados.length > 0 && estados.every(x => x.status === 'SINCRONIZADO')) {
        setErroSincronizacao(''); setStatusSincronizacao('SINCRONIZADO');
      } else {
        setStatusSincronizacao('PENDENTE');
      }
    };
    const atualizarOnline = () => recalcularStatus();
    const ouvir = (event) => {
      const status = String(event?.detail?.status || 'PENDENTE').toUpperCase();
      const field = String(event?.detail?.field || event?.detail?.localStorageKey || 'global');
      syncCamposRef.current.set(field, { status, error: event?.detail?.error || '', at: Date.now() });
      recalcularStatus();
    };
    window.addEventListener(PERSISTENCE_STATUS_EVENT, ouvir);
    window.addEventListener('online', atualizarOnline);
    window.addEventListener('offline', atualizarOnline);
    atualizarOnline();
    return () => {
      window.removeEventListener(PERSISTENCE_STATUS_EVENT, ouvir);
      window.removeEventListener('online', atualizarOnline);
      window.removeEventListener('offline', atualizarOnline);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setTemaUi('dark');
      return;
    }
    const temaSalvo = zenosStorage.getItem(`zenos_${userId}_ui_theme`);
    setTemaUi(temaSalvo === 'light' ? 'light' : 'dark');
  }, [userId]);

  const alternarTemaUi = () => {
    const proximo = temaUi === 'dark' ? 'light' : 'dark';
    setTemaUi(proximo);
    if (userId) zenosStorage.setItem(`zenos_${userId}_ui_theme`, proximo);
  };

  const concluirTrocaPinObrigatoria = async () => {
    setErroPinObrigatorio('');
    if (!operadorAtivo) return;
    if (novoPinObrigatorio !== confirmarPinObrigatorio) return setErroPinObrigatorio('Os PINs informados não coincidem.');
    if (pinEhFraco(novoPinObrigatorio)) return setErroPinObrigatorio('Escolha um PIN menos previsível. Não use admin, 1234, 0000, 1111 ou sequências simples.');
    try {
      const credencial = await criarCredencialPin(novoPinObrigatorio);
      const atualizados = vendedores.map(v => String(v.id) === String(operadorAtivo.id) ? { ...v, ...credencial } : v);
      if (userId) {
        const persistencia = await persistV1OperationFieldSafe({
          db, userId, field: 'vendedores', value: atualizados, baseValue: syncBaseRef.current.get('vendedores'), localStorageKey: `zenos_${userId}_vendedores`
        });
        if (!persistencia?.cloudOk) throw new Error('O novo PIN não foi confirmado na nuvem. Nenhuma alteração de acesso foi finalizada.');
        const confirmados = persistencia.value || atualizados;
        registrarBaseSyncCampo('vendedores', confirmados, persistencia.revision);
        setVendedores(confirmados);
      } else {
        setVendedores(atualizados);
      }
      setOperadorAtivo(prev => prev ? { ...prev, ...credencial } : prev);
      setNovoPinObrigatorio(''); setConfirmarPinObrigatorio('');
    } catch (error) { setErroPinObrigatorio(error?.message || 'Não foi possível atualizar o PIN.'); }
  };

  const solicitarDemoFirebase = async () => {
    if (!userId) return;
    try {
      await setDoc(doc(db, "solicitacoes_demo", userId), {
        email: usuarioAutenticado, uid: userId, dataSolicitacao: new Date().toISOString(), dataSolicitacaoServer: serverTimestamp(), status: 'pendente_analise'
      }, { merge: true });
      setDemoSolicitada(true);
      avisarAppZen({ variante:'success', titulo:'Solicitação enviada', mensagem:'A solicitação foi registrada com sucesso.' });
    } catch (err) {
      avisarAppZen({ variante:'danger', titulo:'Não foi possível enviar', mensagem:tx('Erro ao enviar solicitação.', 'Error al enviar solicitud.', 'Error sending request.') });
    }
  };

  // 🔒 ATUALIZADO: MOTOR CLOUD-FIRST (A nuvem é a fonte absoluta da verdade)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      syncCamposRef.current.clear();
      syncBaseRef.current.clear();
      syncRevisionRef.current.clear();
      syncWriteQueueRef.current.clear();
      syncDeferredRemoteRef.current.clear();
      if (user) {
        setUserId(user.uid);
        setUsuarioAutenticado(user.email);
        // ATT 08.1: isolamento absoluto por conta. Nenhum perfil/regra/câmbio da sessão anterior permanece em RAM.
        const perfilCacheUsuario = lerPerfilLojaLocal(user.uid);
        setPerfilLoja(perfilCacheUsuario);
        setPerfilRapidoRascunho(perfilCacheUsuario);
        setRegrasDesconto({ ...REGRAS_DESCONTO_PADRAO });
        setTaxasCambio({ ...TAXAS_CAMBIO_PADRAO });
        setTaxasInput({ ...TAXAS_INPUT_PADRAO });
        setNuvemSincronizada(false);
    setStatusSincronizacao('PENDENTE');
        setFalhaBootstrapNuvem(null);
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
            setPlanoLoja(dadosLoja.plano || dadosLoja.planoId || 'basico');
          } else {
            const novaDataCriacao = new Date().toISOString();
            await setDoc(docRef, { email: user.email, status: 'aguardando_pagamento', dataCriacao: novaDataCriacao, createdAtServer: serverTimestamp() }, { merge: true });
            setStatusLoja('ativo');
            setPlanoLoja('basico');
          }

          const dadosLojaSnap = await getDoc(doc(db, "lojas", user.uid, "dados", "operacao"));
          const adminPadrao = [{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', pinTrocaObrigatoria: true, percentual: 0, comissaoTipo: 'lucro', permissoes: { admin: true } }];
          if (dadosLojaSnap.exists()) {
            // SE A LOJA TEM DADOS NA NUVEM, PUXA TUDO DAQUI SEM REGRAVAR NO LOGIN.
            const d = dadosLojaSnap.data();
            const revisions = d?._syncMeta?.fieldRevisions || {};
            const produtosCloud = Array.isArray(d.produtos) ? d.produtos.map((p, idx) => normalizarProduto(p, idx)) : [];
            const clientesCloud = Array.isArray(d.clientes) ? d.clientes.map((c, idx) => normalizarCliente(c, idx)) : [];
            const historicoCloud = Array.isArray(d.historicoVendas) ? d.historicoVendas : [];
            const caixaCloud = Array.isArray(d.caixaMovimentos) ? d.caixaMovimentos : [];
            const despesasCloud = Array.isArray(d.despesas) ? d.despesas : [];
            const comprasCloud = Array.isArray(d.historicoCompras) ? d.historicoCompras : [];
            const fornecedoresCloud = Array.isArray(d.fornecedores) ? d.fornecedores : [];
            const vouchersCloud = Array.isArray(d.vouchers) ? d.vouchers : [];
            const sessoesCloud = Array.isArray(d.sessoesCaixa) ? d.sessoesCaixa : [];
            const regrasDescontoCloud = normalizarRegrasDescontoSeguras(d.regrasDesconto);
            let regrasComissaoCarregadas = d.regrasComissao;
            if (!regrasComissaoCarregadas) {
              try { regrasComissaoCarregadas = JSON.parse(zenosStorage.getItem(`zenos_${user.uid}_regras_comissao`) || 'null'); } catch (e) {}
            }
            const regrasComissaoCloud = normalizarRegrasComissao(regrasComissaoCarregadas || REGRAS_COMISSAO_PADRAO);
            const vendedoresCloud = Array.isArray(d.vendedores) && d.vendedores.length > 0 ? d.vendedores : adminPadrao;

            registrarBaseSyncCampo('produtos', produtosCloud, revisions.produtos);
            registrarBaseSyncCampo('clientes', clientesCloud, revisions.clientes);
            registrarBaseSyncCampo('historicoVendas', historicoCloud, revisions.historicoVendas);
            registrarBaseSyncCampo('caixaMovimentos', caixaCloud, revisions.caixaMovimentos);
            registrarBaseSyncCampo('despesas', despesasCloud, revisions.despesas);
            registrarBaseSyncCampo('historicoCompras', comprasCloud, revisions.historicoCompras);
            registrarBaseSyncCampo('fornecedores', fornecedoresCloud, revisions.fornecedores);
            registrarBaseSyncCampo('vouchers', vouchersCloud, revisions.vouchers);
            registrarBaseSyncCampo('regrasDesconto', regrasDescontoCloud, revisions.regrasDesconto);
            registrarBaseSyncCampo('regrasComissao', regrasComissaoCloud, revisions.regrasComissao);
            registrarBaseSyncCampo('vendedores', vendedoresCloud, revisions.vendedores);
            registrarBaseSyncCampo('sessoesCaixa', sessoesCloud, revisions.sessoesCaixa);

            setProdutos(produtosCloud);
            setClientes(clientesCloud);
            setHistoricoVendas(historicoCloud);
            setCaixaMovimentos(caixaCloud);
            setDespesas(despesasCloud);
            setHistoricoCompras(comprasCloud);
            setFornecedores(fornecedoresCloud);
            setVouchers(vouchersCloud);
            setRegrasDesconto(regrasDescontoCloud);
            setRegrasComissao(regrasComissaoCloud);
            setVendedores(vendedoresCloud);
            setSessoesCaixa(sessoesCloud);
          } else {
            // CONTA NOVA (ZERADA): defaults viram BASE local; não gerar 12 writes no primeiro login.
            const vazia = [];
            const regrasDescontoCloud = normalizarRegrasDescontoSeguras(REGRAS_DESCONTO_PADRAO);
            const regrasComissaoCloud = normalizarRegrasComissao(REGRAS_COMISSAO_PADRAO);
            for (const field of ['produtos','clientes','historicoVendas','caixaMovimentos','despesas','historicoCompras','fornecedores','vouchers','sessoesCaixa']) registrarBaseSyncCampo(field, vazia, 0);
            registrarBaseSyncCampo('regrasDesconto', regrasDescontoCloud, 0);
            registrarBaseSyncCampo('regrasComissao', regrasComissaoCloud, 0);
            registrarBaseSyncCampo('vendedores', adminPadrao, 0);

            setProdutos([]);
            setClientes([]);
            setHistoricoVendas([]);
            setCaixaMovimentos([]);
            setDespesas([]);
            setHistoricoCompras([]);
            setFornecedores([]);
            setVouchers([]);
            setSessoesCaixa([]);
            setRegrasDesconto(regrasDescontoCloud);
            setRegrasComissao(regrasComissaoCloud);
            setVendedores(adminPadrao);
          }
          // Somente uma leitura autoritativa concluída libera gravações na V1.
          setFalhaBootstrapNuvem(null);
          setNuvemSincronizada(true);
          setStatusSincronizacao('SINCRONIZADO');
          setErroSincronizacao('');
        } catch (err) { 
          console.error('[ZenOS][BOOTSTRAP] Falha ao confirmar os dados da nuvem. Escritas permanecem bloqueadas.', err);
          setStatusLoja('ativo');
          setPlanoLoja('basico');
          setNuvemSincronizada(false);
          setStatusSincronizacao(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ERRO');
          setErroSincronizacao(err?.message || 'Não foi possível confirmar os dados da nuvem.');
          setFalhaBootstrapNuvem(err?.message || 'Não foi possível confirmar os dados da nuvem.'); 
          // FALLBACK OFFLINE SEGURO: Puxa o cache isolado ou o legado genérico se for a primeira vez offline
          try {
            const puxar = (chave) => {
              // Nunca carregar cache sem UID: duas lojas no mesmo navegador não podem compartilhar dados.
              const val = zenosStorage.getItem(`zenos_${user.uid}_${chave}`);
              return val ? JSON.parse(val) : null;
            };
            
            const p = puxar('produtos'); if(p) setProdutos(p.map((x, idx) => normalizarProduto(x, idx))); else setProdutos([]);
            const c = puxar('clientes'); if(c) setClientes(c.map((x, idx) => normalizarCliente(x, idx))); else setClientes([]);
            const hv = puxar('historico_vendas'); if(hv) setHistoricoVendas(hv);
            const cm = puxar('caixa_movs'); if(cm) setCaixaMovimentos(cm);
            const d = puxar('despesas'); if(d) setDespesas(d);
            const hc = puxar('historico_compras'); if(hc) setHistoricoCompras(hc);
            const f = puxar('fornecedores'); if(f) setFornecedores(f);
            const vv = puxar('vouchers'); if(vv) setVouchers(vv);
            const sc = puxar('sessoes_caixa'); if(sc) setSessoesCaixa(sc);
            const rd = puxar('regras_desconto'); setRegrasDesconto(normalizarRegrasDescontoSeguras(rd || REGRAS_DESCONTO_PADRAO));
            const rc = puxar('regras_comissao');
            setRegrasComissao(normalizarRegrasComissao(rc || REGRAS_COMISSAO_PADRAO));
            const vd = puxar('vendedores'); if(vd) setVendedores(vd); else setVendedores([{ id: 'admin', nome: 'Administrador (Gerência)', patente: 'gerencia', senha: 'admin', pinTrocaObrigatoria: true, percentual: 0, comissaoTipo: 'lucro', permissoes: { admin: true } }]);
          } catch(e){}
        }
      } else {
        // SEM USUÁRIO (DESLOGADO): Destrói os dados locais da memória RAM
        setUsuarioAutenticado(null); setUserId(null); setStatusLoja(null); setOperadorAtivo(null);
        setNuvemSincronizada(false);
        setFalhaBootstrapNuvem(null);
        setProdutos([]); setClientes([]); setHistoricoVendas([]); setCaixaMovimentos([]); setDespesas([]); setHistoricoCompras([]); setFornecedores([]); setVouchers([]); setLivroFinanceiro([]); setSessoesCaixa([]); setRegrasDesconto({ ...REGRAS_DESCONTO_PADRAO }); setRegrasComissao(normalizarRegrasComissao(REGRAS_COMISSAO_PADRAO)); setVendedores([]); setPerfilLoja(normalizarPerfilLoja({})); setPerfilRapidoRascunho(normalizarPerfilLoja({})); setTaxasCambio({ ...TAXAS_CAMBIO_PADRAO }); setTaxasInput({ ...TAXAS_INPUT_PADRAO });
      }
      setCarregandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // ATT 06.2: sincronização reativa V1 entre terminais.
  // ATT 10.2: realtime somente aplica dados remotos; NUNCA ecoa snapshot de volta para a nuvem.
  useEffect(() => {
    if (!userId) return;
    const refOperacao = doc(db, 'lojas', userId, 'dados', 'operacao');
    const refConfig = doc(db, 'lojas', userId, 'dados', 'configuracoes');

    const unsubOperacao = onSnapshot(refOperacao, (snap) => {
      if (!snap.exists() || snap.metadata?.fromCache || snap.metadata?.hasPendingWrites) return;
      recordSyncMetric('snapshotReads', 'operacao');
      const d = snap.data() || {};
      const revisions = d?._syncMeta?.fieldRevisions || {};

      const aplicar = (field, rawValue, setter, localStorageKey, transform = v => v) => {
        if (rawValue === undefined) return;
        const revisionRaw = revisions[field];
        const revisionNum = revisionRaw !== undefined && revisionRaw !== null ? Number(revisionRaw) || 0 : null;
        const revisionVista = syncRevisionRef.current.get(field);
        // Evita normalizar/serializar arrays grandes em TODO snapshot quando somente
        // outro campo mudou (ex.: uma sangria não deve remapear ~1000 produtos).
        if (revisionNum !== null && revisionVista !== undefined && revisionNum <= revisionVista) return;
        const value = transform(rawValue);
        aplicarCampoRemoto({ field, value, setter, revision: revisionNum, localStorageKey });
      };

      if (Array.isArray(d.produtos)) aplicar('produtos', d.produtos, setProdutos, `zenos_${userId}_produtos`, lista => lista.map((v, i) => normalizarProduto(v, i)));
      if (Array.isArray(d.clientes)) aplicar('clientes', d.clientes, setClientes, `zenos_${userId}_clientes`, lista => lista.map((v, i) => normalizarCliente(v, i)));
      if (Array.isArray(d.historicoVendas)) aplicar('historicoVendas', d.historicoVendas, setHistoricoVendas, `zenos_${userId}_historico_vendas`);
      if (Array.isArray(d.caixaMovimentos)) aplicar('caixaMovimentos', d.caixaMovimentos, setCaixaMovimentos, `zenos_${userId}_caixa_movs`);
      if (Array.isArray(d.despesas)) aplicar('despesas', d.despesas, setDespesas, `zenos_${userId}_despesas`);
      if (Array.isArray(d.historicoCompras)) aplicar('historicoCompras', d.historicoCompras, setHistoricoCompras, `zenos_${userId}_historico_compras`);
      if (Array.isArray(d.fornecedores)) aplicar('fornecedores', d.fornecedores, setFornecedores, `zenos_${userId}_fornecedores`);
      if (Array.isArray(d.vouchers)) aplicar('vouchers', d.vouchers, setVouchers, `zenos_${userId}_vouchers`);
      if (Array.isArray(d.sessoesCaixa)) aplicar('sessoesCaixa', d.sessoesCaixa, setSessoesCaixa, `zenos_${userId}_sessoes_caixa`);
      if (Array.isArray(d.vendedores)) aplicar('vendedores', d.vendedores, setVendedores, `zenos_${userId}_vendedores`);
      if (d.regrasDesconto) aplicar('regrasDesconto', d.regrasDesconto, setRegrasDesconto, `zenos_${userId}_regras_desconto`, normalizarRegrasDescontoSeguras);
      if (d.regrasComissao) aplicar('regrasComissao', d.regrasComissao, setRegrasComissao, `zenos_${userId}_regras_comissao`, normalizarRegrasComissao);

      if (!snap.metadata?.fromCache) {
        setFalhaBootstrapNuvem(null);
        setNuvemSincronizada(true);
      }
      // Snapshot passivo não muda status para SALVANDO/SINCRONIZADO: o indicador reflete somente writes locais.
    }, err => {
      console.error('[ZenOS][Realtime] operação:', err);
      notifyPersistenceStatus({status:'ERRO',field: 'operacao_realtime',error:err?.message || 'Falha na sincronização operacional.'});
    });

    const unsubConfig = onSnapshot(refConfig, (snap) => {
      if (snap.metadata?.fromCache || snap.metadata?.hasPendingWrites) return;
      recordSyncMetric('snapshotReads', 'configuracoes');
      if (!snap.exists()) {
        const pf = normalizarPerfilLoja({});
        setPerfilLoja(pf);
        setPerfilRapidoRascunho(pf);
        limparPerfilLojaLocal(userId);
        setTaxasCambio({ ...TAXAS_CAMBIO_PADRAO });
        setTaxasInput({ ...TAXAS_INPUT_PADRAO });
        return;
      }
      const config = snap.data() || {};
      const pf = normalizarPerfilLoja(config.perfilLoja || {});
      setPerfilLoja(prev => syncValuesEqual(prev, pf) ? prev : pf);
      setPerfilRapidoRascunho(prev => syncValuesEqual(prev, pf) ? prev : pf);
      salvarPerfilLojaLocal(userId, pf);
      if (config.taxasCambio) {
        const taxas = normalizarTaxasCambio(config.taxasCambio);
        setTaxasCambio(prev => syncValuesEqual(prev, taxas) ? prev : taxas);
        setTaxasInput(taxasInputAPartirDasTaxas(taxas));
      }
    }, err => {
      console.error('[ZenOS][Realtime] configuração:', err);
      notifyPersistenceStatus({status:'ERRO',field: 'configuracoes_realtime',error:err?.message || 'Falha na sincronização de configuração.'});
    });
    return () => { unsubOperacao(); unsubConfig(); };
  }, [userId]);

  // ATT 07: Livro Financeiro aditivo em documentos independentes.
  useEffect(() => {
    if (!userId) { setLivroFinanceiro([]); return; }
    return assinarLivroFinanceiro({
      db,
      userId,
      onData: (itens, meta) => { setLivroFinanceiro(itens); if (!meta?.fromCache) recordSyncMetric('snapshotReads', 'financeiro_realtime'); },
      onError: (err) => { console.error('[ZenOS][ATT07][LivroFinanceiro]', err); notifyPersistenceStatus({status:'ERRO',field: 'financeiro_realtime',error:err?.message || 'Falha na sincronização do Livro Financeiro.'}); },
    });
  }, [userId]);

  const salvarPerfilRapido = async () => {
    const pf = normalizarPerfilLoja(perfilRapidoRascunho);
    if (!pf.nomeFantasia.trim()) return;
    setPerfilLoja(pf); salvarPerfilLojaLocal(userId, pf);
    if (userId) { notifyPersistenceStatus({status:'SALVANDO',field: 'configuracoes'}); try { await setDoc(doc(db, 'lojas', userId, 'dados', 'configuracoes'), { perfilLoja: pf, updatedAtClient:new Date().toISOString(), updatedAtServer:serverTimestamp() }, { merge: true }); notifyPersistenceStatus({status:'SINCRONIZADO',field: 'configuracoes'}); } catch(error) { notifyPersistenceStatus({status:'ERRO',field: 'configuracoes',error:error?.message||String(error)}); throw error; } }
    setPerfilRapidoErro('');
    setModalPerfilRapido(false);
  };

  const fazerLogout = async () => {
    const confirmou = await confirmarAppZen({
      variante:'warning',
      titulo:tx('Encerrar sessão da loja', 'Cerrar sesión de la tienda', 'End store session'),
      mensagem:tx('Encerrar a sessão principal desta loja?', '¿Cerrar la sesión principal de esta tienda?', 'End the main session for this store?'),
      confirmarTexto:tx('Encerrar sessão', 'Cerrar sesión', 'End session')
    });
    if (!confirmou) return;
    await signOut(auth);
    // LIMPEZA ABSOLUTA DE MEMÓRIA NO LOGOUT
    setNuvemSincronizada(false);
    setStatusSincronizacao('PENDENTE');
    setErroSincronizacao('');
    setProdutos([]); setClientes([]); setHistoricoVendas([]); setCaixaMovimentos([]); setDespesas([]); setHistoricoCompras([]); setFornecedores([]); setVouchers([]); setLivroFinanceiro([]); setSessoesCaixa([]);
    setRegrasDesconto({ ...REGRAS_DESCONTO_PADRAO });
    setRegrasComissao(normalizarRegrasComissao(REGRAS_COMISSAO_PADRAO));
    setVendedores([]);
    setPerfilLoja(normalizarPerfilLoja({}));
    setPerfilRapidoRascunho(normalizarPerfilLoja({}));
    setTaxasCambio({ ...TAXAS_CAMBIO_PADRAO });
    setTaxasInput({ ...TAXAS_INPUT_PADRAO });
    setMostrarPainelExecutivo(false);
    setOperadorAtivo(null);
    setValoresTopoVisiveis(true);
    setEcraAtual('hub');
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

  // ATT 10.2: persistência local -> nuvem sem eco. Cada efeito compara com a BASE
  // confirmada da nuvem e só escreve quando existe alteração local real.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'produtos', value:produtos, setter:setProdutos, localStorageKey:`zenos_${userId}_produtos` }); }, [produtos, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'clientes', value:clientes, setter:setClientes, localStorageKey:`zenos_${userId}_clientes` }); }, [clientes, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'historicoVendas', value:historicoVendas, setter:setHistoricoVendas, localStorageKey:`zenos_${userId}_historico_vendas` }); }, [historicoVendas, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'caixaMovimentos', value:caixaMovimentos, setter:setCaixaMovimentos, localStorageKey:`zenos_${userId}_caixa_movs` }); }, [caixaMovimentos, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'despesas', value:despesas, setter:setDespesas, localStorageKey:`zenos_${userId}_despesas` }); }, [despesas, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'historicoCompras', value:historicoCompras, setter:setHistoricoCompras, localStorageKey:`zenos_${userId}_historico_compras` }); }, [historicoCompras, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'fornecedores', value:fornecedores, setter:setFornecedores, localStorageKey:`zenos_${userId}_fornecedores` }); }, [fornecedores, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'vouchers', value:vouchers, setter:setVouchers, localStorageKey:`zenos_${userId}_vouchers` }); }, [vouchers, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'regrasDesconto', value:regrasDesconto, setter:setRegrasDesconto, localStorageKey:`zenos_${userId}_regras_desconto` }); }, [regrasDesconto, userId, nuvemSincronizada]);

  // ATT 08: regras de comissão/metas sincronizadas entre terminais.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const normalizadas = normalizarRegrasComissao(regrasComissao);
    persistirCampoSeguro({ field: 'regrasComissao', value:normalizadas, setter:setRegrasComissao, localStorageKey:`zenos_${userId}_regras_comissao` });
  }, [regrasComissao, userId, nuvemSincronizada]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { persistirCampoSeguro({ field: 'sessoesCaixa', value:sessoesCaixa, setter:setSessoesCaixa, localStorageKey:`zenos_${userId}_sessoes_caixa` }); }, [sessoesCaixa, userId, nuvemSincronizada]);

  const t = (chave) => traducoes[idioma]?.[chave] || traducoes.pt[chave] || chave;
  const tx = (pt, es, en) => { if (idioma === 'es') return es || pt; if (idioma === 'en') return en || pt; return pt; };

  const registrarFinanceiro = async (lancamento) => {
    if (!userId) throw new Error('Loja não identificada para o Livro Financeiro.');
    const confirmado = await registrarLancamentoFinanceiro({
      db,
      userId,
      lancamento: {
        ...lancamento,
        operadorId: lancamento?.operadorId || operadorAtivo?.id || 'admin',
        operadorNome: lancamento?.operadorNome || operadorAtivo?.nome || 'Administrador',
      },
    });
    // Após confirmação real do Firestore, mantém o snapshot local imediatamente
    // coerente para fechamento/auditoria sem depender da latência do onSnapshot.
    setLivroFinanceiro(atual => [confirmado, ...(atual || []).filter(item => String(item?.id) !== String(confirmado.id))]
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))));
    return confirmado;
  };

  const converterDeBRL = (valor, codigo = moeda) => (Number(valor) || 0) * (taxasCambio[codigo] || 1);
  const converterParaBRL = (valor, codigo = moeda) => (Number(valor) || 0) / (taxasCambio[codigo] || 1);
  const fmt = (valor, codigo = moeda) => {
    const val = converterDeBRL(valor, codigo);
    const conf = moedasConfig[codigo] || moedasConfig.BRL;
    try { return new Intl.NumberFormat(conf.locale, { style: 'currency', currency: conf.moeda, maximumFractionDigits: conf.moeda === 'PYG' ? 0 : 2 }).format(val); } catch { return `${conf.simbolo} ${Number(val).toFixed(2)}`; }
  };

  const salvarTaxasCambio = async () => {
    const rateUSD = parseFloat(taxasInput.USD.replace(',', '.')) || 5.40;
    const rateEUR = parseFloat(taxasInput.EUR.replace(',', '.')) || 6.05;
    const ratePYG = parseFloat(taxasInput.PYG.replace(',', '.')) || 1380;
    const novasTaxas = normalizarTaxasCambio({
      BRL: 1.0,
      USD: rateUSD > 0 ? 1 / rateUSD : TAXAS_CAMBIO_PADRAO.USD,
      EUR: rateEUR > 0 ? 1 / rateEUR : TAXAS_CAMBIO_PADRAO.EUR,
      PYG: ratePYG > 0 ? ratePYG : TAXAS_CAMBIO_PADRAO.PYG,
    });
    setTaxasCambio(novasTaxas);
    if (userId) {
      try {
        notifyPersistenceStatus({status:'SALVANDO',field: 'configuracoes'});
        await setDoc(doc(db, 'lojas', userId, 'dados', 'configuracoes'), { taxasCambio: novasTaxas, updatedAtClient:new Date().toISOString(), updatedAtServer:serverTimestamp() }, { merge: true });
        notifyPersistenceStatus({status:'SINCRONIZADO',field: 'configuracoes'});
      } catch (err) {
        console.error('[ZenOS][Câmbio] Não foi possível persistir as cotações:', err);
        notifyPersistenceStatus({status:'ERRO',field: 'configuracoes',error:err?.message||String(err)});
      }
    }
    setModalCambioAberto(false);
  };

  const vendasValidas = historicoVendas.filter(v => v.estado === 'concluida' || v.estado === 'parcial');
  
  const vendasHoje = vendasValidas.filter(v => registroEhDoDiaLocal(v));
  const faturamentoHojeBRL = vendasHoje.reduce((acc, v) => acc + obterFinanceiroVenda(v).totalLiquidoBRL, 0);
  const faturamentoTotalBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).totalLiquidoBRL, 0);
  const cmvTotalBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).cmvLiquidoBRL, 0);
  const lucroBrutoBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).lucroLiquidoBRL, 0);
  const despesasPagasBRL = despesas.filter(d => d.status === 'paga' && d.afetaResultado !== false && d.naturezaContabil !== 'estoque_ativo' && d.categoria !== 'Mercadoria para Revenda').reduce((acc, d) => acc + (parseFloat(d.valorBRL) || 0), 0);
  const lucroLiquidoRealBRL = lucroBrutoBRL - despesasPagasBRL;
  const totalFiadoAbertoBRL = clientes.reduce((acc, c) => acc + (parseFloat(c.saldoDevedorBRL) || 0), 0);

  const gerarCurvaABC = () => {
    const mapa = {};
    vendasValidas.forEach(v => {
      v.itens.forEach(it => {
        const id = it.produtoOriginalId || it.sku || it.id;
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
  // O caixa físico precisa preservar a entrada original mesmo quando a venda é
  // totalmente devolvida e passa ao estado `cancelada`. O motor canônico de caixa
  // já distingue quais estados possuem fluxo financeiro; por isso recebe o histórico
  // completo, enquanto os indicadores comerciais acima continuam usando vendasValidas.
  const resumoSessaoAtiva = sessaoAtiva ? calcularResumoSessao({ sessao: sessaoAtiva, historicoVendas, caixaMovimentos }) : null;
  const vendasDestaSessao = sessaoAtiva ? historicoVendas.filter(v => {
    const estadoComFluxo = v.estado === 'concluida' || v.estado === 'parcial' || (v.estado === 'cancelada' && Array.isArray(v.pagamentos) && v.pagamentos.length > 0);
    return estadoComFluxo && String(v.vendedorId) === String(idVendedorAtual) && timestampVenda(v) >= timestampSessao(sessaoAtiva);
  }) : [];
  const movsSessao = sessaoAtiva ? caixaMovimentos.filter(m => m.sessaoId === sessaoAtiva.id) : [];
  const saldoSessaoFisicoBRL = resumoSessaoAtiva?.saldoEsperado || 0;
  // Compatibilidade dos relatórios/fecho: aliases derivados do resumo canônico da sessão.
  const suprimentosSessaoBRL = Number(resumoSessaoAtiva?.suprimentos || 0);
  const sangriasSessaoBRL = Number(resumoSessaoAtiva?.sangrias || 0);
  const saidasComprasDinheiroSessaoBRL = Number(resumoSessaoAtiva?.comprasDinheiro || 0);

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

  const abrirTurnoDeCaixa = async () => {
    const saldoIni = calcularTotalMovBRL();
    const novaSessao = {
      id: `SESSAO-${Date.now()}`,
      operadorId: idVendedorAtual,
      operadorNome: operadorAtivo?.nome || 'Administrador',
      saldoInicial: saldoIni,
      detalheAbertura: { ...valoresMovCaixa },
      status: 'aberta',
      createdAt: new Date().toISOString(),
      abertura: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR')
    };
    const sessoesPropostas = [novaSessao, ...sessoesCaixa];
    const confirmado = await commitOperacaoCritica(
      [{ field:'sessoesCaixa', value:sessoesPropostas, storageSuffix:'sessoes_caixa' }],
      {
        operationKey: `abrir-caixa:${novaSessao.id}`,
        guards: [{ type:'no_open_cash_session_for_operator', operatorId:idVendedorAtual }],
      }
    );
    if (!confirmado?.cloudOk) {
      return avisarAppZen({ variante:'danger', titulo:'Caixa não aberto', mensagem:'A nuvem não confirmou a abertura do turno.', detalhes:[confirmado?.error?.message || 'Tente novamente quando a sincronização estiver disponível.'] });
    }
    setSessoesCaixa(confirmado.values?.sessoesCaixa || sessoesPropostas);
    setModalCaixaAberto(false);
    resetarValoresCaixa();
  };

  const registrarMovimentoCaixa = async () => {
    if (!sessaoAtiva) return avisarAppZen({ variante:'warning', titulo:'Caixa fechado', mensagem:tx('Precisa de abrir o turno de caixa primeiro.', 'Debe abrir turno primero.', 'Must open shift first.') });
    const valBRL = calcularTotalMovBRL();
    if (valBRL <= 0) return avisarAppZen({ variante:'warning', titulo:'Valor inválido', mensagem:tx('Insira um valor válido.', 'Ingrese un valor válido.', 'Enter a valid amount.') });
    if (tipoMovCaixa === 'sangria' && valBRL > saldoSessaoFisicoBRL + 0.001) {
      return avisarAppZen({ variante:'danger', titulo:'Saldo insuficiente na gaveta', mensagem:tx('A sangria não pode ser maior que o dinheiro físico disponível.', 'La sangría no puede superar el efectivo disponible.', 'Cash drop cannot exceed physical cash available.'), detalhes:[`Disponível: ${fmt(saldoSessaoFisicoBRL,'BRL')}`, `Solicitado: ${fmt(valBRL,'BRL')}`] });
    }
    const agoraISO = new Date().toISOString();
    const novoMov = { 
      id: Date.now(), sessaoId: sessaoAtiva.id, dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'), createdAt: agoraISO,
      tipo: tipoMovCaixa, valorBRL: valBRL, detalhesMoedas: { ...valoresMovCaixa },
      direcao: tipoMovCaixa === 'suprimento' ? 'entrada' : 'saida', afetaGaveta: true,
      descricao: descMovCaixa || (tipoMovCaixa === 'suprimento' ? tx('Reforço de Fundo', 'Refuerzo de Caja', 'Float Fund') : tx('Retirada de Caixa', 'Retiro de Caja', 'Cash Withdrawal')), 
      operador: operadorAtivo?.nome 
    };
    const movimentosPropostos = [novoMov, ...caixaMovimentos];
    const confirmado = await commitVendaCritica({
      changes: [{ field:'caixaMovimentos', value:movimentosPropostos, storageSuffix:'caixa_movs' }],
      financialEntries: [{
        id: `CAIXA-${novoMov.id}`,
        tipo: tipoMovCaixa,
        origem: 'caixa_manual',
        referenciaId: String(novoMov.id),
        valor: valBRL,
        formaPagamento: 'dinheiro_gaveta',
        createdAt: agoraISO,
        afetaCaixaFisico: true,
        afetaResultado: false,
        direcao: tipoMovCaixa === 'suprimento' ? 'entrada' : 'saida',
        sessaoId: sessaoAtiva.id,
        observacao: novoMov.descricao,
        operadorId: operadorAtivo?.id || 'admin',
        operadorNome: operadorAtivo?.nome || 'Administrador',
      }],
      guards: [
        { type:'cash_session_open', sessionId:sessaoAtiva.id },
        ...(tipoMovCaixa === 'sangria' ? [{ type:'cash_balance_at_least', sessionId:sessaoAtiva.id, amount:valBRL, message:'O saldo físico do caixa mudou em outro terminal. A sangria não foi realizada.' }] : []),
      ],
      operationKey: `mov-caixa:${novoMov.id}`,
    });
    if (!confirmado?.cloudOk) {
      return avisarAppZen({ variante:'danger', titulo:'Movimento não registrado', mensagem:'A nuvem não confirmou o movimento de caixa.', detalhes:[confirmado?.error?.message || 'Nenhum movimento foi finalizado.'] });
    }
    setCaixaMovimentos(confirmado.values?.caixaMovimentos || movimentosPropostos);
    setModalCaixaAberto(false);
    resetarValoresCaixa(); setDescMovCaixa('');
  };

  const processarFechamentoCego = async () => {
    if (!sessaoAtiva || !resumoSessaoAtiva) {
      return avisarAppZen({
        variante: 'warning',
        titulo: 'Nenhum turno aberto',
        mensagem: tx('Não existe turno aberto para encerrar.', 'No hay un turno abierto para cerrar.', 'There is no open shift to close.'),
        apenasConfirmar: true,
      });
    }

    const houveContagem = Object.values(valoresMovCaixa || {}).some(v => String(v ?? '').trim() !== '');
    if (!houveContagem) {
      return avisarAppZen({
        variante: 'warning',
        titulo: 'Informe a contagem física',
        mensagem: tx(
          'Conte a gaveta e informe os valores encontrados. Se uma moeda não existir na gaveta, digite 0.',
          'Cuente la gaveta e informe los valores encontrados. Si no hay una moneda, ingrese 0.',
          'Count the drawer and enter the amounts found. If a currency is not present, enter 0.'
        ),
        apenasConfirmar: true,
      });
    }

    const valInformadoBRL = calcularTotalMovBRL();
    const saldoEsperadoBRL = Number(resumoSessaoAtiva.saldoEsperado || 0);
    const diferenca = Math.round((valInformadoBRL - saldoEsperadoBRL) * 100) / 100;

    const dataFechoISO = new Date().toISOString();
    const dataFechoLocal = new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR');
    const conciliacaoEletronica = calcularConciliacaoEletronicaSessao({ sessao: sessaoAtiva, livroFinanceiro }) || {
      pixEntradas: 0, pixSaidas: 0, pixLiquido: 0,
      cartaoCreditoEntradas: 0, cartaoCreditoSaidas: 0, cartaoCreditoLiquido: 0,
      cartaoDebitoEntradas: 0, cartaoDebitoSaidas: 0, cartaoDebitoLiquido: 0,
      pixLancamentos: [], cartaoCreditoLancamentos: [], cartaoDebitoLancamentos: [],
    };

    const sessoesAtualizadas = sessoesCaixa.map(s => {
      if (s.id === sessaoAtiva.id) {
        return {
          ...s,
          status: 'fechada',
          fechamento: dataFechoISO,
          fechamentoLocal: dataFechoLocal,
          saldoInformado: valInformadoBRL,
          detalheFechamento: { ...valoresMovCaixa },
          diferenca,
          saldoSistema: saldoEsperadoBRL,
          fechamentoCego: true,
          conciliacaoEletronica: {
            pixEntradas: conciliacaoEletronica.pixEntradas,
            pixSaidas: conciliacaoEletronica.pixSaidas,
            pixLiquido: conciliacaoEletronica.pixLiquido,
            cartaoCreditoEntradas: conciliacaoEletronica.cartaoCreditoEntradas,
            cartaoCreditoSaidas: conciliacaoEletronica.cartaoCreditoSaidas,
            cartaoCreditoLiquido: conciliacaoEletronica.cartaoCreditoLiquido,
            cartaoDebitoEntradas: conciliacaoEletronica.cartaoDebitoEntradas,
            cartaoDebitoSaidas: conciliacaoEletronica.cartaoDebitoSaidas,
            cartaoDebitoLiquido: conciliacaoEletronica.cartaoDebitoLiquido,
            pixQuantidade: conciliacaoEletronica.pixLancamentos.length,
          },
          auditadoPor: operadorAtivo?.nome || sessaoAtiva.operadorNome || 'Operador',
        };
      }
      return s;
    });

    const resumoEntradas = vendasDestaSessao.reduce((res, v) => {
      (v.pagamentos || []).forEach(p => {
        const rotulo = p.rotulo || p.formaId || 'Pagamento';
        if (!res[rotulo]) res[rotulo] = 0;
        res[rotulo] += Number(p.valorOriginal || p.valorConvertidoBRL || 0);
      });
      return res;
    }, {});

    const componentes = {
      fundoInicial: Number(resumoSessaoAtiva.saldoInicial || 0),
      vendasDinheiro: Number(resumoSessaoAtiva.vendasDinheiro || 0),
      recebimentosDinheiro: Number(resumoSessaoAtiva.recebimentosDinheiro || 0),
      suprimentos: suprimentosSessaoBRL,
      outrasEntradas: Number(resumoSessaoAtiva.outrasEntradas || 0),
      sangrias: sangriasSessaoBRL,
      devolucoesDinheiro: Number(resumoSessaoAtiva.devolucoesDinheiro || 0),
      despesasDinheiro: Number(resumoSessaoAtiva.despesasDinheiro || 0),
      comprasDinheiro: saidasComprasDinheiroSessaoBRL,
      outrasSaidas: Number(resumoSessaoAtiva.outrasSaidas || 0),
    };

    const moedasContadasHTML = Object.entries(valoresMovCaixa)
      .map(([m, v]) => [m, String(v ?? '').trim() === '' ? 0 : (parseFloat(String(v).replace(',', '.')) || 0)])
      .map(([m, v]) => `<div style="display:flex;justify-content:space-between;"><span>${m} contado:</span><span>${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: m === 'PYG' ? 0 : 2, maximumFractionDigits: 2 })}</span></div>`)
      .join('');

    const escaparHTML = (valor = '') => String(valor ?? '').replace(/[&<>"']/g, caractere => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[caractere]));
    const extratoPixHTML = [...(conciliacaoEletronica.pixLancamentos || [])]
      .sort((a, b) => Date.parse(a?.createdAt || 0) - Date.parse(b?.createdAt || 0))
      .map(l => {
        const data = new Date(l?.createdAt || '');
        const horario = Number.isNaN(data.getTime()) ? '--:--' : data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const saida = l?.direcao === 'saida';
        const referencia = escaparHTML(l?.clienteNome || l?.referenciaId || l?.tipo || 'Movimento PIX');
        return `<div style="display:flex;justify-content:space-between;gap:8px;"><span>${horario} ${saida ? 'SAÍDA' : 'ENTRADA'} • ${referencia}</span><span>${saida ? '- ' : '+ '}${fmt(Number(l?.valor) || 0, 'BRL')}</span></div>`;
      })
      .join('');

    const temQuebra = Math.abs(diferenca) > 0.05;
    const descQuebra = temQuebra
      ? (diferenca < 0 ? 'FALTA DE CAIXA' : 'SOBRA DE CAIXA')
      : 'CAIXA CONCILIADO';

    const reciboFechoHTML = `
      <div style="font-family:monospace;font-size:12px;width:100%;text-align:left;">
        <div style="text-align:center;margin-bottom:10px;">
          <h2 style="margin:0;font-size:14px;">FECHAMENTO CEGO DE TURNO</h2>
          <div>ZenOS - SISTEMA DE GESTÃO</div>
        </div>
        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div><strong>Operador:</strong> ${sessaoAtiva.operadorNome}</div>
        <div><strong>Abertura:</strong> ${sessaoAtiva.abertura}</div>
        <div><strong>Fechamento:</strong> ${dataFechoLocal}</div>
        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>

        <div style="margin-bottom:5px;"><strong>>> COMPOSIÇÃO DO DINHEIRO FÍSICO</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fundo inicial:</span><span>${fmt(componentes.fundoInicial, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Vendas em dinheiro:</span><span>+ ${fmt(componentes.vendasDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Recebimentos em dinheiro:</span><span>+ ${fmt(componentes.recebimentosDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Suprimentos:</span><span>+ ${fmt(componentes.suprimentos, 'BRL')}</span></div>
        ${componentes.outrasEntradas ? `<div style="display:flex;justify-content:space-between;"><span>Outras entradas:</span><span>+ ${fmt(componentes.outrasEntradas, 'BRL')}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Sangrias:</span><span>- ${fmt(componentes.sangrias, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Devoluções em dinheiro:</span><span>- ${fmt(componentes.devolucoesDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Despesas em dinheiro:</span><span>- ${fmt(componentes.despesasDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Compras em dinheiro:</span><span>- ${fmt(componentes.comprasDinheiro, 'BRL')}</span></div>
        ${componentes.outrasSaidas ? `<div style="display:flex;justify-content:space-between;"><span>Outras saídas:</span><span>- ${fmt(componentes.outrasSaidas, 'BRL')}</span></div>` : ''}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> VENDAS POR FORMA DE PAGAMENTO</strong></div>
        ${Object.keys(resumoEntradas).length > 0 ? Object.entries(resumoEntradas).map(([forma, valor]) => `<div style="display:flex;justify-content:space-between;"><span>${forma}:</span><span>${Number(valor).toFixed(2)}</span></div>`).join('') : '<div style="text-align:center;">Nenhuma venda</div>'}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> CONCILIAÇÃO ELETRÔNICA (NÃO AFETA GAVETA)</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>PIX recebido:</span><span>+ ${fmt(conciliacaoEletronica.pixEntradas, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>PIX saídas/estornos:</span><span>- ${fmt(conciliacaoEletronica.pixSaidas, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>PIX líquido:</span><span>${fmt(conciliacaoEletronica.pixLiquido, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cartão crédito líquido:</span><span>${fmt(conciliacaoEletronica.cartaoCreditoLiquido, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cartão débito líquido:</span><span>${fmt(conciliacaoEletronica.cartaoDebitoLiquido, 'BRL')}</span></div>
        <div style="font-size:10px;margin-top:4px;">Valores eletrônicos são conciliados separadamente e não compõem o saldo físico esperado da gaveta.</div>
        ${extratoPixHTML ? `<div style="border-top:1px dotted #000;margin-top:7px;padding-top:5px;"><strong>>> EXTRATO PIX DO TURNO</strong>${extratoPixHTML}</div>` : '<div style="margin-top:5px;text-align:center;">Nenhum PIX registrado no turno</div>'}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> CONTAGEM INFORMADA PELO OPERADOR</strong></div>
        ${moedasContadasHTML}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>SALDO ESPERADO:</span><span>${fmt(saldoEsperadoBRL, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>TOTAL CONTADO:</span><span>${fmt(valInformadoBRL, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>DIFERENÇA:</span><span>${fmt(diferenca, 'BRL')}</span></div>
        <div style="text-align:center;font-weight:bold;margin-top:8px;">${descQuebra}</div>

        <div style="margin-top:36px;text-align:center;">_________________________________<br/>Assinatura do Operador<br/>${sessaoAtiva.operadorNome}</div>
        <div style="margin-top:36px;text-align:center;">_________________________________<br/>Conferência da Gerência</div>
      </div>
    `;

    const fechamentoConfirmado = await commitOperacaoCritica(
      [{ field:'sessoesCaixa', value:sessoesAtualizadas, storageSuffix:'sessoes_caixa' }],
      {
        operationKey: `fechar-caixa:${sessaoAtiva.id}`,
        guards: [{ type:'cash_session_open', sessionId:sessaoAtiva.id }],
      }
    );
    if (!fechamentoConfirmado?.cloudOk) {
      return avisarAppZen({
        variante:'danger',
        titulo:'Caixa não fechado',
        mensagem:'A nuvem não confirmou o fechamento. O turno continua aberto.',
        detalhes:[fechamentoConfirmado?.error?.message || 'Tente novamente sem encerrar a tela.'],
      });
    }
    setSessoesCaixa(fechamentoConfirmado.values?.sessoesCaixa || sessoesAtualizadas);

    const janelaImpressao = window.open('', '_blank', 'width=400,height=650');
    if (janelaImpressao) {
      janelaImpressao.document.write(`<!DOCTYPE html><html><head><title>Fechamento de Turno</title><style>@page{margin:0;size:80mm auto;}body{margin:0;padding:10px;width:80mm;box-sizing:border-box;}</style></head><body>${reciboFechoHTML}<script>window.onload=function(){window.focus();window.print();};</script></body></html>`);
      janelaImpressao.document.close();
    }

    setModalCaixaAberto(false);
    resetarValoresCaixa();
    setDescMovCaixa('');

    avisarAppZen({
      variante: temQuebra ? 'warning' : 'success',
      titulo: temQuebra ? 'Fechamento concluído com diferença' : 'Caixa fechado e conciliado',
      mensagem: temQuebra
        ? `O turno foi encerrado com ${diferenca < 0 ? 'falta' : 'sobra'} de ${fmt(Math.abs(diferenca), 'BRL')}.`
        : 'A contagem física confere com o saldo esperado pelo sistema.',
      detalhes: [
        `Saldo esperado: ${fmt(saldoEsperadoBRL, 'BRL')}`,
        `Total contado: ${fmt(valInformadoBRL, 'BRL')}`,
        `Diferença: ${fmt(diferenca, 'BRL')}`,
        janelaImpressao ? 'Comprovante de fechamento aberto para impressão.' : 'Impressão bloqueada pelo navegador; o fechamento foi registrado mesmo assim.',
      ],
      apenasConfirmar: true,
    });
  };

  const temPermissao = (modulo) => {
    if (!operadorAtivo) return false;
    if (operadorAtivo.id === 'admin' || operadorAtivo.permissoes?.admin) return true;
    return !!operadorAtivo.permissoes?.[modulo];
  };

  const historicoVisivelParaOperador = patenteUsuario === 'gerencia' 
    ? historicoVendas 
    : historicoVendas.filter(v => String(v.vendedorId) === String(operadorAtivo?.id));

  const navegarPara = (id) => {
    setEcraAtual(id);
    setMenuNavAberto(false);
  };

  const focarMeuTurno = () => {
    navegarPara('hub');
    setTimeout(() => document.getElementById('zen-meu-turno')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const gruposNavegacao = [
    {
      id: 'vendas', titulo: tx('Vendas', 'Ventas', 'Sales'), icone: '🛒', abertaInicial: true,
      itens: [
        ...(temPermissao('pdv') ? [{ id:'pdv', tela:'pdv', icone:'🛒', rotulo:t('pdvBalcao'), onClick:()=>navegarPara('pdv') }] : []),
        ...(temPermissao('mesas') ? [{ id:'mesas', tela:'mesas', icone:'🍽️', rotulo:tx('Mesas / Comandas','Mesas / Comandas','Tables / Tabs'), onClick:()=>navegarPara('mesas') }] : []),
        ...(temPermissao('vendas') ? [{ id:'vendas', tela:'vendas', icone:'📑', rotulo:t('vendasDevolucoes'), onClick:()=>navegarPara('vendas') }] : []),
      ],
    },
    {
      id: 'estoque', titulo: tx('Estoque e Compras', 'Stock y Compras', 'Stock & Purchases'), icone: '📦', abertaInicial: true,
      itens: [
        ...(temPermissao('produtos') ? [{ id:'compras', tela:'compras', icone:'📥', rotulo:tx('Entrada / Compras','Entrada / Compras','Purchases / Stock In'), onClick:()=>navegarPara('compras') }] : []),
        ...(temPermissao('produtos') ? [{ id:'produtos', tela:'produtos', icone:'📦', rotulo:t('produtosEstoque'), badge:produtos.length, onClick:()=>navegarPara('produtos') }] : []),
        ...(temPermissao('produtos') ? [{ id:'fornecedores', tela:'fornecedores', icone:'🏭', rotulo:tx('Fornecedores','Proveedores','Suppliers'), onClick:()=>navegarPara('fornecedores') }] : []),
        ...(temPermissao('inteligencia') ? [{ id:'inteligencia', tela:'inteligencia', icone:'📊', rotulo:tx('Inteligência de Estoque','Inteligencia de Stock','Stock Intelligence'), onClick:()=>navegarPara('inteligencia') }] : []),
      ],
    },
    {
      id: 'clientes', titulo: tx('Clientes e Fiado', 'Clientes y Fiado', 'Customers & Credit'), icone: '👥', abertaInicial: false,
      itens: temPermissao('clientes') ? [{ id:'clientes', tela:'clientes', icone:'👥', rotulo:t('clientesFiado'), badge:totalFiadoAbertoBRL > 0 ? tx('Fiado','Deuda','Debt') : null, onClick:()=>navegarPara('clientes') }] : [],
    },
    {
      id: 'caixa', titulo: tx('Caixa', 'Caja', 'Cash Drawer'), icone: '💵', abertaInicial: true,
      itens: [
        ...(temPermissao('pdv') ? [{ id:'meu-turno', tela:'hub', icone:'💵', rotulo:tx('Meu Turno de Caixa','Mi Turno de Caja','My Cash Shift'), onClick:focarMeuTurno }] : []),
        ...(temPermissao('admin') ? [{ id:'auditoria-caixas', tela:'auditoria_caixas', icone:'🏦', rotulo:tx('Auditoria de Caixas','Auditoría de Cajas','Drawer Audit'), onClick:()=>navegarPara('auditoria_caixas') }] : []),
      ],
    },
    {
      id: 'gestao', titulo: tx('Gestão e Financeiro', 'Gestión y Finanzas', 'Management & Finance'), icone: '📈', abertaInicial: false,
      itens: [
        ...(temPermissao('despesas') ? [{ id:'despesas', tela:'despesas', icone:'💸', rotulo:tx('Contas a Pagar','Cuentas a Pagar','Expenses'), badge:despesas.filter(d=>d.status==='pendente').length || '0', onClick:()=>navegarPara('despesas') }] : []),
        ...(temPermissao('admin') ? [{ id:'comissoes', tela:'comissoes', icone:'🤝', rotulo:tx('Comissões','Comisiones','Commissions'), onClick:()=>navegarPara('comissoes') }] : []),
        ...(temPermissao('admin') ? [{ id:'dashboard-mobile', tela:'dashboardMobile', icone:'📱', rotulo:tx('App Mobile (CEO)','App Mobile (CEO)','Mobile App (CEO)'), onClick:()=>navegarPara('dashboardMobile') }] : []),
      ],
    },
    {
      id: 'administracao', titulo: tx('Administração', 'Administración', 'Administration'), icone: '⚙️', abertaInicial: false,
      itens: [
        ...(temPermissao('admin') ? [{ id:'config', tela:'configuracoes', icone:'⚙️', rotulo:tx('Configurações','Configuraciones','Settings'), onClick:()=>navegarPara('configuracoes') }] : []),
        ...(temPermissao('admin') ? [{ id:'importar', tela:'migracao', icone:'📥', rotulo:tx('Importar Dados','Importar Datos','Import Data'), onClick:()=>navegarPara('migracao') }] : []),
      ],
    },
  ].filter(grupo => grupo.itens.length > 0);

  const renderNavButton = (id, icone, texto, badge = null) => {
    const ativo = ecraAtual === id;
    
    const lidarComClique = () => {
      // Regra aprovada: o PDV pode abrir mesmo sem turno; recebimento continua sujeito às regras do PDV/caixa.
      setEcraAtual(id);
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

  if (falhaBootstrapNuvem) {
    return <div style={{minHeight:'100vh',background:'#020617',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:560,background:'#0b1120',border:'1px solid #f59e0b',borderRadius:24,padding:28,color:'#fff',boxShadow:'0 30px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:18}}><img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:58,height:58,objectFit:'contain'}}/><div><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:'#f59e0b'}}>PROTEÇÃO DE DADOS ATIVA</div><h2 style={{margin:'4px 0 0',fontSize:22}}>Nuvem não confirmada</h2></div></div>
        <p style={{color:'#cbd5e1',lineHeight:1.6,fontSize:14}}>O ZenOS não conseguiu confirmar a base da loja. Para proteger produtos, clientes, vendas e financeiro, <b>todas as gravações na nuvem permanecem bloqueadas</b>. Nenhum array vazio será enviado ao Firestore nesta condição.</p>
        <div style={{background:'#020617',border:'1px solid #1e293b',borderRadius:14,padding:14,color:'#94a3b8',fontSize:12,margin:'16px 0'}}>Detalhe técnico: {falhaBootstrapNuvem}</div>
        <button onClick={()=>window.location.reload()} style={{width:'100%',padding:14,borderRadius:11,border:'none',background:'#d97706',color:'#fff',fontWeight:900,cursor:'pointer'}}>Tentar conectar novamente</button>
      </div>
    </div>;
  }

  if (statusLoja === 'ativo' && !operadorAtivo) {
    return <TerminalLogin vendedores={vendedores} onLoginSuccess={processarLoginOperador} onSairLoja={fazerLogout} />;
  }

  if (statusLoja === 'ativo' && operadorAtivo && operadorRequerTrocaPin(operadorAtivo)) {
    return <div style={{minHeight:'100vh',background:'#020617',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:460,background:'#0b1120',border:'1px solid #f59e0b',borderRadius:24,padding:28,color:'#fff',boxShadow:'0 30px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:18}}><img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:54,height:54,objectFit:'contain'}}/><div><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:'#f59e0b'}}>SEGURANÇA OBRIGATÓRIA</div><h2 style={{margin:'4px 0 0',fontSize:22}}>Defina um novo PIN</h2></div></div>
        <p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.55}}>O PIN temporário ou previsível não pode continuar sendo usado. Essa troca é obrigatória antes de operar a loja.</p>
        <div style={{display:'grid',gap:10,margin:'16px 0'}}>
          <input type="text" autoComplete="one-time-code" name="zenos-new-pin" data-lpignore="true" data-1p-ignore="true" value={novoPinObrigatorio} onChange={e=>setNovoPinObrigatorio(e.target.value)} placeholder="Novo PIN" style={{padding:13,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff',WebkitTextSecurity:'disc'}}/>
          <input type="text" autoComplete="one-time-code" name="zenos-confirm-pin" data-lpignore="true" data-1p-ignore="true" value={confirmarPinObrigatorio} onChange={e=>setConfirmarPinObrigatorio(e.target.value)} placeholder="Confirmar novo PIN" style={{padding:13,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff',WebkitTextSecurity:'disc'}}/>
          {erroPinObrigatorio && <div style={{color:'#fb7185',fontSize:12,fontWeight:800}}>{erroPinObrigatorio}</div>}
        </div>
        <button onClick={concluirTrocaPinObrigatoria} style={{width:'100%',padding:14,borderRadius:11,border:'none',background:'#d97706',color:'#fff',fontWeight:900,cursor:'pointer'}}>Salvar novo PIN e continuar</button>
      </div>
    </div>;
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
    <div className={`zenos-app theme-${temaUi}`} style={{ minHeight: '100vh', padding: 0, margin: 0, overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
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
      
      <div className={`zen-shell ${sidebarCompacta ? 'sidebar-compact' : ''}`}>
        <ZenSidebar
          compacta={sidebarCompacta}
          onToggleCompacta={() => setSidebarCompacta(v => !v)}
          mobileAberta={menuNavAberto}
          onFecharMobile={() => setMenuNavAberto(false)}
          ecraAtual={ecraAtual}
          grupos={gruposNavegacao}
          perfilLoja={perfilLoja}
          usuarioAutenticado={usuarioAutenticado}
          patenteUsuario={patenteUsuario}
          userId={userId}
          onEditarPerfil={temPermissao('admin') ? () => { setPerfilRapidoErro(''); setPerfilRapidoRascunho(perfilLoja); setModalPerfilRapido(true); } : null}
          editarPerfilLabel="Editar nome e logo"
          onHome={() => navegarPara('hub')}
          onSair={fazerLogout}
        />
        <div className="zen-content">
          <ZenTopbar
            onAbrirMobile={() => setMenuNavAberto(true)}
            status={statusSincronizacao}
            statusTitle={erroSincronizacao || statusSincronizacao}
            labelErroSincronizacao="Erro ao sincronizar"
            idioma={idioma}
            setIdioma={setIdioma}
            moeda={moeda}
            setMoeda={setMoeda}
            onCambio={() => setModalCambioAberto(true)}
            operador={operadorAtivo?.nome || 'Admin'}
            patente={patenteUsuario}
            onTrocarOperador={trocarOperador}
            tema={temaUi}
            onAlternarTema={alternarTemaUi}
          />

          <main className="zen-main no-print">
        
 {ecraAtual === 'hub' && (
          <div className="zen-dashboard-home">
            <ZenHero operador={operadorAtivo?.nome || 'Administrador (Gerência)'} patente={patenteUsuario} />

            <div className="zen-kpi-grid">
              <ZenKpiCard icon="🛒" titulo={tx('Vendido Hoje','Vendido Hoy','Sold Today')} valor={valoresTopoVisiveis ? fmt(faturamentoHojeBRL) : '*****'} detalhe={`${historicoVendas.filter(v => registroEhDoDiaLocal(v) && v.status !== 'cancelada').length} vendas realizadas`} tone="teal" trailing={<button onClick={() => setValoresTopoVisiveis(!valoresTopoVisiveis)} style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',fontSize:18}}>{valoresTopoVisiveis ? '◉' : '○'}</button>} />
              <ZenKpiCard icon="👥" titulo={tx('FIADO NA PRAÇA','FIADO A COBRAR','PENDING CREDIT')} valor={valoresTopoVisiveis ? fmt(totalFiadoAbertoBRL) : '*****'} detalhe={totalFiadoAbertoBRL > 0 ? tx('Valores pendentes de clientes','Valores pendientes','Customer balances due') : tx('Nenhum valor pendente','Sin valores pendientes','No pending balance')} tone="purple" trailing="▥" />
              <ZenKpiCard icon="↻" titulo={tx('SINCRONIZAÇÃO','SINCRONIZACIÓN','SYNC')} valor={statusSincronizacao === 'SINCRONIZADO' ? 'Online' : statusSincronizacao === 'SALVANDO' ? 'Salvando...' : statusSincronizacao === 'ERRO' ? 'Erro' : statusSincronizacao === 'OFFLINE' ? 'Offline' : 'Pendente'} detalhe={tx('Dados atualizados em tempo real','Datos actualizados en tiempo real','Realtime data status')} tone="cyan" trailing="◯" />
            </div>

            <div className="zen-dashboard-middle">
              {temPermissao('pdv') && (
                <section className="zen-dashboard-card" id="zen-meu-turno">
                  <div className="zen-dashboard-card-head"><strong>💵 Meu Turno de Caixa</strong><span className={`zen-status-badge ${sessaoAtiva ? 'open' : 'closed'}`}>{sessaoAtiva ? `ABERTO • ${fmt(saldoSessaoFisicoBRL)}` : 'FECHADO'}</span></div>
                  <div className="zen-cash-card-body">
                    <div className="zen-cash-illustration" />
                    {!sessaoAtiva ? <>
                      <p>Você pode usar o PDV e gerar Pré-Pedidos mesmo sem turno aberto. Abra o turno somente quando for receber ou movimentar a gaveta.</p>
                      <button className="zen-primary-cash" onClick={() => { setTipoMovCaixa('abertura'); setModalCaixaAberto(true); }}>🔓 Abrir Turno de Caixa</button>
                    </> : <>
                      <div className="zen-cash-actions">
                        <button onClick={() => { setTipoMovCaixa('suprimento'); setModalCaixaAberto(true); }}>+ Entrada (Reforço)</button>
                        <button onClick={() => { setTipoMovCaixa('sangria'); setModalCaixaAberto(true); }}>− Saída (Sangria)</button>
                        <button onClick={() => { setTipoMovCaixa('fechamento'); setModalCaixaAberto(true); }}>🔒 Encerrar Turno</button>
                      </div>
                      <div className="zen-movements">{movsSessao.length === 0 ? <div className="zen-movement"><span>Nenhuma movimentação neste turno.</span></div> : movsSessao.slice(0,6).map(m => <div className="zen-movement" key={m.id}><span>{m.tipo === 'suprimento' ? 'Entrada' : 'Saída'} • {m.descricao}</span><strong>{m.tipo === 'suprimento' ? '+' : '-'}{fmt(m.valorBRL,'BRL')}</strong></div>)}</div>
                    </>}
                  </div>
                </section>
              )}

              {temPermissao('inteligencia') ? <section className="zen-dashboard-card">
                <button className="zen-exec-toggle" onClick={() => setMostrarPainelExecutivo(!mostrarPainelExecutivo)}><span>👁️ Painel Executivo e Financeiro</span><span>{mostrarPainelExecutivo ? '⌃' : '›'}</span></button>
                {mostrarPainelExecutivo && <div className="zen-exec-body">
                  <div className="zen-exec-grid">
                    <div className="zen-exec-stat"><span>Faturamento Real</span><strong>{fmt(faturamentoTotalBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>CMV</span><strong>{fmt(cmvTotalBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>Lucro Bruto</span><strong style={{color:'#38bdf8'}}>{fmt(lucroBrutoBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>Despesas Pagas</span><strong style={{color:'#fbbf24'}}>{fmt(despesasPagasBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>Lucro Líquido</span><strong style={{color:'#34d399'}}>{fmt(lucroLiquidoRealBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>Fiado na Praça</span><strong style={{color:'#fb7185'}}>{fmt(totalFiadoAbertoBRL)}</strong></div>
                  </div>
                  <div className="zen-abc-list">{curvaABC.slice(0,5).map((item,index)=><div className="zen-abc-row" key={`${item.sku}-${index}`}><b>{index+1}</b><span>{item.nome}</span><strong>{fmt(item.faturamentoBRL,'BRL')}</strong></div>)}</div>
                </div>}
              </section> : <div className="zen-dashboard-card"><div className="zen-dashboard-card-head"><strong>ZenOS • Operação do Dia</strong></div><div className="zen-cash-card-body"><p>Acessos operacionais organizados conforme as permissões deste operador.</p></div></div>}
            </div>

            <section className="zen-quick-section">
              <div className="zen-quick-title"><span>⚡</span><strong>Acessos Rápidos</strong><small>Principais operações do dia a dia — todos os demais módulos permanecem nas gavetas laterais.</small></div>
              <div className="zen-quick-grid">
                {temPermissao('pdv') && <ZenQuickCard icon="🛒" titulo="PDV Balcão" detalhe="Vendas e Pré-Pedidos" tone="teal" onClick={()=>navegarPara('pdv')} />}
                {temPermissao('produtos') && <ZenQuickCard icon="📥" titulo="PDV Compras" detalhe="Entrada rápida de estoque" tone="orange" onClick={()=>navegarPara('compras')} />}
                {temPermissao('produtos') && <ZenQuickCard icon="📦" titulo="Produtos & Estoque" detalhe="Cadastrar e gerenciar" tone="purple" onClick={()=>navegarPara('produtos')} />}
                {temPermissao('clientes') && <ZenQuickCard icon="👥" titulo="Clientes & Fiado" detalhe="Consultar e gerenciar" tone="blue" onClick={()=>navegarPara('clientes')} />}
                {temPermissao('vendas') && <ZenQuickCard icon="📑" titulo="Histórico" detalhe="Vendas e Devoluções" tone="pink" onClick={()=>navegarPara('vendas')} />}
                {temPermissao('admin') && <ZenQuickCard icon="🤝" titulo="Comissões" detalhe="Metas e bonificações" tone="orange" onClick={()=>navegarPara('comissoes')} />}
                {temPermissao('despesas') && <ZenQuickCard icon="💸" titulo="Despesas" detalhe="Contas a pagar" tone="gold" onClick={()=>navegarPara('despesas')} />}
                {temPermissao('admin') && <ZenQuickCard icon="⚙️" titulo="Configurações" detalhe="Sistema, equipe e backup" tone="purple" onClick={()=>navegarPara('configuracoes')} />}
              </div>
            </section>
          </div>
 )}

        {ecraAtual === 'pdv' && <PDV perfilLoja={perfilLoja} taxasCambio={taxasCambio} registrarFinanceiro={registrarFinanceiro} commitOperacaoCritica={commitOperacaoCritica} commitVendaCritica={commitVendaCritica} vouchers={vouchers} setVouchers={setVouchers} userId={userId} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} patenteUsuario={patenteUsuario} idioma={idioma} regrasDesconto={regrasDesconto} vendedores={vendedores} operadorAtivo={operadorAtivo} sessaoAtiva={sessaoAtiva} />}
        {ecraAtual === 'compras' && <PDVCompras commitOperacaoNegocio={commitVendaCritica} registrarFinanceiro={registrarFinanceiro} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} userId={userId} produtos={produtos} setProdutos={setProdutos} fornecedores={fornecedores} setFornecedores={setFornecedores} despesas={despesas} setDespesas={setDespesas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoCompras={historicoCompras} setHistoricoCompras={setHistoricoCompras} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'fornecedores' && <Fornecedores commitOperacaoNegocio={commitVendaCritica} fornecedores={fornecedores} setFornecedores={setFornecedores} moeda={moeda} tx={tx} />}
        {ecraAtual === 'mesas' && <Mesas commitOperacaoNegocio={commitVendaCritica} userId={userId} produtos={produtos} fmt={fmt} tx={tx} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} moeda={moeda} idioma={idioma} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'produtos' && <Produtos commitOperacaoNegocio={commitVendaCritica} historicoVendas={historicoVendas} historicoCompras={historicoCompras} patenteUsuario={patenteUsuario} regrasDesconto={regrasDesconto} vendedores={vendedores} userId={userId} operadorAtivo={operadorAtivo} planoLoja={planoLoja} produtos={produtos} setProdutos={setProdutos} fornecedoresGlobais={fornecedores} moeda={moeda} fmt={fmt} t={t} tx={tx} />}
        {ecraAtual === 'inteligencia' && <EstoqueInteligente produtos={produtos} fmt={fmt} />}
        {ecraAtual === 'comissoes' && <Comissoes commitOperacaoNegocio={commitVendaCritica} historicoVendas={historicoVisivelParaOperador} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} operadorAtivo={operadorAtivo} regrasDesconto={regrasDesconto} regrasComissao={regrasComissao} setRegrasComissao={setRegrasComissao} />}
        {ecraAtual === 'dashboardMobile' && <DashboardMobile historicoVendas={historicoVendas} despesas={despesas} clientes={clientes} produtos={produtos} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} regrasDesconto={regrasDesconto} />}
        {ecraAtual === 'clientes' && <Clientes commitOperacaoNegocio={commitVendaCritica} livroFinanceiro={livroFinanceiro} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} operadorAtivo={operadorAtivo} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} />}
        {ecraAtual === 'vendas' && <Vendas commitOperacaoNegocio={commitVendaCritica} taxasCambio={taxasCambio} sessoesCaixa={sessoesCaixa} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} perfilLoja={perfilLoja} vouchers={vouchers} setVouchers={setVouchers} userId={userId} operadorAtivo={operadorAtivo} historicoVendas={historicoVisivelParaOperador} setHistoricoVendas={setHistoricoVendas} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} fmt={fmt} t={t} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterDeBRL={converterDeBRL} />}
        {ecraAtual === 'migracao' && <Migracao commitOperacaoNegocio={commitVendaCritica} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} t={t} tx={tx} />}
        {ecraAtual === 'configuracoes' && <Configuracoes commitOperacaoNegocio={commitVendaCritica} userId={userId} operadorAtivo={operadorAtivo} perfilLojaGlobal={perfilLoja} setPerfilLojaGlobal={setPerfilLoja} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} despesas={despesas} setDespesas={setDespesas} moeda={moeda} fmt={fmt} tx={tx} regrasDesconto={regrasDesconto} setRegrasDesconto={setRegrasDesconto} vendedores={vendedores} setVendedores={(novosVendedores) => { setVendedores(novosVendedores); persistirCampoSeguro({ field: 'vendedores', value:novosVendedores, setter:setVendedores, localStorageKey:`zenos_${userId}_vendedores` }); }} />}
        {ecraAtual === 'auditoria_caixas' && <GestaoCaixas sessoesCaixa={sessoesCaixa} historicoVendas={historicoVendas} caixaMovimentos={caixaMovimentos} livroFinanceiro={livroFinanceiro} fmt={fmt} tx={tx} />}
        {ecraAtual === 'despesas' && <Despesas commitOperacaoNegocio={commitVendaCritica} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} operadorAtivo={operadorAtivo} despesas={despesas} setDespesas={setDespesas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterParaBRL={converterParaBRL} />}
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
                  {tipoMovCaixa === 'fechamento'
                    ? tx('FECHAMENTO CEGO: conte todo o dinheiro físico da gaveta sem consultar o saldo do sistema. Informe abaixo quanto encontrou em cada moeda. O ZenOS só revelará o saldo esperado e a diferença depois de concluir a auditoria. Se não houver uma moeda, digite 0.', 'CIERRE CIEGO: cuente todo el efectivo físico sin consultar el saldo del sistema. Informe cuánto encontró en cada moneda. ZenOS solo revelará el saldo esperado y la diferencia después de concluir la auditoría. Si no hay una moneda, ingrese 0.', 'BLIND CLOSE: count all physical cash without checking the system balance. Enter what you found in each currency. ZenOS will reveal the expected balance and difference only after the audit. Enter 0 for currencies not present.')
                    : tx('Informe o fundo físico que está sendo colocado na gaveta para iniciar o turno.', 'Informe el efectivo inicial colocado en la gaveta.', 'Enter the physical opening float placed in the drawer.')}
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {['BRL', 'USD', 'EUR', 'PYG'].map(m => (
                    <div key={m}>
                      <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{m}:</label>
                      <input type="text" value={valoresMovCaixa[m]} onChange={(e) => setValoresMovCaixa({...valoresMovCaixa, [m]: e.target.value})} placeholder="0.00" onFocus={e=>e.target.select()} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #4f46e5', borderRadius: '8px', color: '#fff', fontSize: '18px', fontWeight: 900, textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                {tipoMovCaixa === 'fechamento' && (
                  <div style={{ marginTop:'14px', padding:'12px 14px', borderRadius:'12px', background:'#020617', border:'1px solid #1e293b' }}>
                    <div style={{fontSize:'10px',fontWeight:900,letterSpacing:'1px',color:'#64748b',marginBottom:'5px'}}>TOTAL FÍSICO INFORMADO • CONVERTIDO PARA BRL</div>
                    <div style={{fontSize:'20px',fontWeight:950,color:'#f8fafc'}}>{fmt(calcularTotalMovBRL(), 'BRL')}</div>
                    <div style={{fontSize:'10px',color:'#64748b',marginTop:'5px'}}>O saldo esperado pelo ZenOS permanece oculto até a auditoria ser concluída.</div>
                  </div>
                )}
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
              {tipoMovCaixa === 'fechamento' ? tx('Concluir Contagem, Auditar e Imprimir', 'Concluir Conteo, Auditar e Imprimir', 'Finish Count, Audit & Print') : (tipoMovCaixa === 'abertura' ? tx('Abrir Turno com Saldo', 'Abrir Turno', 'Open Shift') : tx('Registrar na Gaveta', 'Registrar', 'Save Record'))}
            </button>
          </div>
        </div>
      )}
    
      <ZenModal aberto={!!modalAppZen} variante={modalAppZen?.variante} titulo={modalAppZen?.titulo} mensagem={modalAppZen?.mensagem} detalhes={modalAppZen?.detalhes} confirmarTexto={modalAppZen?.confirmarTexto || 'OK'} cancelarTexto={modalAppZen?.cancelarTexto || 'Cancelar'} apenasConfirmar={!!modalAppZen?.apenasConfirmar} onConfirmar={()=>{ const resolver=modalAppZen?.resolver; setModalAppZen(null); if(resolver) resolver(true); }} onCancelar={()=>{ const resolver=modalAppZen?.resolver; setModalAppZen(null); if(resolver) resolver(false); }} />

      {modalPerfilRapido && <div style={{position:'fixed',inset:0,zIndex:21000,background:'rgba(2,6,23,.88)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{width:'100%',maxWidth:460,background:'#0b1120',border:'1px solid #38bdf8',borderRadius:22,padding:22,color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>{perfilRapidoRascunho.logoLoja?<img src={perfilRapidoRascunho.logoLoja} style={{width:56,height:56,borderRadius:12,objectFit:'cover'}}/>:<img src="/logo-zenos.png?v=4" style={{width:56,height:56,objectFit:'contain'}}/>}<div><div style={{fontSize:11,color:'#38bdf8',fontWeight:900}}>IDENTIDADE RÁPIDA</div><div style={{fontSize:18,fontWeight:900}}>Nome e logo da loja</div></div></div>
        <label style={{fontSize:11,color:'#94a3b8',fontWeight:900}}>NOME FANTASIA</label><input value={perfilRapidoRascunho.nomeFantasia||''} onChange={e=>setPerfilRapidoRascunho({...perfilRapidoRascunho,nomeFantasia:e.target.value})} style={{width:'100%',boxSizing:'border-box',margin:'6px 0 14px',padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff'}}/>
        <label style={{fontSize:11,color:'#94a3b8',fontWeight:900}}>LOGO DA LOJA (máx. 300 KB)</label><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; if(f.size>300*1024){setPerfilRapidoErro('A logo deve ter no máximo 300 KB.');return;} setPerfilRapidoErro(''); const r=new FileReader();r.onload=()=>setPerfilRapidoRascunho(x=>({...x,logoLoja:r.result}));r.readAsDataURL(f);}} style={{width:'100%',margin:'8px 0 18px'}}/>
        {perfilRapidoErro && <div style={{margin:'-8px 0 14px',padding:'9px 10px',borderRadius:8,border:'1px solid #f43f5e',background:'#2e0a16',color:'#fda4af',fontSize:11,fontWeight:800}}>{perfilRapidoErro}</div>}
        <div style={{display:'flex',gap:10}}><button onClick={()=>setModalPerfilRapido(false)} style={{flex:1,padding:11,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1',fontWeight:900}}>Cancelar</button><button onClick={salvarPerfilRapido} style={{flex:1,padding:11,borderRadius:10,border:'none',background:'#0284c7',color:'#fff',fontWeight:900}}>Salvar</button></div>
      </div></div>}
        </div>
      </div>
    </div>
  );
}
