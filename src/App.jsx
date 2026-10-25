import {getOperationalSnapshot,subscribeOperationalSnapshot,clearOperationalSession} from './core/operationalRepository.js';
import {verificarMovimentoCaixaNoServidor} from './core/cashMovementReadOnly.js';
import TerminalLogin from './components/TerminalLogin';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { traducoes, moedasConfig, normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from './data';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, collection, query, where, getDocsFromServer, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { inspectLocalSchemaVersion, PERSISTENCE_STATUS_EVENT, notifyPersistenceStatus } from './core/persistenceSafety';
import { persistV1OperationFieldSafe, persistV1BusinessOperationSafe, recordSyncMetric } from './core/productionSync';
import { cloneSyncValue, hasLocalSyncChange, syncValuesEqual } from './core/syncMerge';
import { zenosStorage } from './core/storage';
import { obterFinanceiroVenda } from './core/salesFinancials';
import { registroEhDoDiaLocal } from './core/dates';
import { filtrarVendasHojeVisiveis } from './core/salesTodayScope';
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
import Fiscal from './components/Fiscal';
import FiscalErrorBoundary from './components/FiscalErrorBoundary';
// Lazy para não carregar a interface opcional durante vendas e fechamento de caixa.
const CommerceSolicitacao = React.lazy(() => import('./components/CommerceSolicitacao'));
import ZenModal from './components/ZenModal';
import AssistenteZen from './components/AssistenteZen';
import { normalizarPerfilLoja, lerPerfilLojaLocal, salvarPerfilLojaLocal, limparPerfilLojaLocal } from './core/storeProfile';
import { assinarLivroFinanceiro, registrarLancamentoFinanceiro, consultarLivroFinanceiroSessaoServidor } from './core/financialLedger';
import { planejarReconciliacoesFiado } from './core/creditReconciliation.js';
import { calcularResumoSessao, calcularConciliacaoEletronicaSessao, timestampSessao, timestampVenda, vendasDaSessao, assinaturaFinanceiraSessao } from './core/cashSession';
import { converterValoresFisicosParaBRL, interpretarValorMonetario } from './core/cashMoneyInput';
import { calcularConciliacaoFisicaMultimoeda } from './core/cashReconciliation';
import { normalizarRegrasComissao, REGRAS_COMISSAO_PADRAO } from './core/commissionEngine';
import { normalizarRegrasMargem } from './core/profitability';
import { patenteEfetivaOperador } from './core/accessControl';
import { derivarFilaFiscalSegura } from './core/fiscalUi';
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

function ZenosLogo({ aoClicar, tx = (pt) => pt }) {
  return (
    <div onClick={aoClicar} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '42px', minWidth: '42px' }}>
        <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{ height: '42px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}><span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '18px', letterSpacing: '2.5px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>Zen</span><span style={{ color: '#818cf8', fontWeight: 800, fontSize: '16px', letterSpacing: '1px' }}>OS</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}><div style={{ height: '1.5px', width: '10px', backgroundColor: '#6366f1' }}></div><span style={{ color: '#cbd5e1', fontSize: '8.5px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{tx('SISTEMA DE GESTÃO','SISTEMA DE GESTIÓN','MANAGEMENT SYSTEM')}</span><div style={{ height: '1.5px', width: '10px', backgroundColor: '#6366f1' }}></div></div>
      </div>
    </div>
  );
}

// Acesso público separado do fluxo autenticado: a sessão existente continua no App.
// Apenas visitantes sem sessão na rota principal são enviados à apresentação comercial.
function PublicHomeRedirect() {
  useEffect(() => {
    window.location.replace('/home-premium-conceito-c.html');
  }, []);
  return <div role="status" aria-live="polite" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f7faf9',color:'#163a50',fontFamily:'system-ui,sans-serif'}}>Abrindo ZenOS…</div>;
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
  const [livroFinanceiroConfirmado, setLivroFinanceiroConfirmado] = useState(false);
  const [livroFinanceiroAtivadoParaLoja, setLivroFinanceiroAtivadoParaLoja] = useState(null);
  const reconciliacaoFiadoEmAndamentoRef = useRef(false);
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


  // Reconsulta autoritativa após conflito V2. Não fecha o PDV nem altera o carrinho.
  // O merge/revisão existente mantém a proteção contra escritas concorrentes.
  const recarregarDadosPDV = async () => {
    if (!userId) throw new Error('Loja não autenticada.');
    const snap = await getOperationalSnapshot(db, userId);
    if (!snap.exists()) throw new Error('Dados da loja indisponíveis.');
    const dados = snap.data() || {};
    const revisions = dados?._syncMeta?.fieldRevisions || {};
    const atualizar = (field, setter, sufixo, normalizar = v => v) => {
      if (!Array.isArray(dados[field])) throw new Error(`Dados incompletos da loja: ${field}.`);
      aplicarCampoRemoto({
        field, value: normalizar(dados[field]), setter,
        revision: revisions[field] === undefined ? null : Number(revisions[field]) || 0,
        localStorageKey: `zenos_${userId}_${sufixo}`,
      });
    };
    atualizar('produtos', setProdutos, 'produtos', lista => lista.map((v, i) => normalizarProduto(v, i)));
    atualizar('clientes', setClientes, 'clientes', lista => lista.map((v, i) => normalizarCliente(v, i)));
    atualizar('historicoVendas', setHistoricoVendas, 'historico_vendas');
    atualizar('vouchers', setVouchers, 'vouchers');
    atualizar('sessoesCaixa', setSessoesCaixa, 'sessoes_caixa');
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
      // O estado visual não pode permanecer "Salvando" indefinidamente quando
      // o Firestore não devolve confirmação. Isto NÃO cancela a transação.
      const travado = estados.some(x => x.status === 'SALVANDO' && Date.now() - x.at >= 30_000);
      if (estados.some(x => x.status === 'ERRO')) {
        const ultimoErro = [...syncCamposRef.current.values()].reverse().find(x => x.status === 'ERRO' && x.error);
        setErroSincronizacao(ultimoErro?.error || 'Existe uma falha de sincronização pendente.');
        setStatusSincronizacao('ERRO');
      } else if (travado) {
        setErroSincronizacao('Confirmação da nuvem demorando. Preserve os pré-pedidos e confira o servidor antes de repetir operações.');
        setStatusSincronizacao('PENDENTE');
      } else if (estados.some(x => x.status === 'PENDENTE')) {
        setErroSincronizacao(''); setStatusSincronizacao('PENDENTE');
      } else if (estados.some(x => x.status === 'SALVANDO')) {
        setErroSincronizacao(''); setStatusSincronizacao('SALVANDO');
      } else if (nuvemSincronizada && (estados.length === 0 || estados.every(x => x.status === 'SINCRONIZADO'))) {
        // Sem gravações pendentes, a inicialização autoritativa da nuvem é confirmação válida.
        // Não confundir ausência de eventos de escrita com conexão pendente.
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
    // Avaliação temporizada somente do indicador. Sem consultas Firestore extras.
    const statusTimer = window.setInterval(recalcularStatus, 5_000);
    return () => {
      window.clearInterval(statusTimer);
      window.removeEventListener(PERSISTENCE_STATUS_EVENT, ouvir);
      window.removeEventListener('online', atualizarOnline);
      window.removeEventListener('offline', atualizarOnline);
    };
  }, [nuvemSincronizada]);

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
    if (novoPinObrigatorio !== confirmarPinObrigatorio) return setErroPinObrigatorio(tx('Os PINs informados não coincidem.','Los PIN informados no coinciden.','The PINs do not match.'));
    if (pinEhFraco(novoPinObrigatorio)) return setErroPinObrigatorio(tx('Escolha um PIN menos previsível. Não use admin, 1234, 0000, 1111 ou sequências simples.','Elija un PIN menos previsible. No use admin, 1234, 0000, 1111 ni secuencias simples.','Choose a less predictable PIN. Do not use admin, 1234, 0000, 1111 or simple sequences.'));
    try {
      const credencial = await criarCredencialPin(novoPinObrigatorio);
      const atualizados = vendedores.map(v => String(v.id) === String(operadorAtivo.id) ? { ...v, ...credencial } : v);
      if (userId) {
        const persistencia = await persistV1OperationFieldSafe({
          db, userId, field: 'vendedores', value: atualizados, baseValue: syncBaseRef.current.get('vendedores'), localStorageKey: `zenos_${userId}_vendedores`
        });
        if (!persistencia?.cloudOk) throw new Error(tx('O novo PIN não foi confirmado na nuvem. Nenhuma alteração de acesso foi finalizada.','El nuevo PIN no fue confirmado en la nube. No se finalizó ningún cambio de acceso.','The new PIN was not confirmed in the cloud. No access change was finalized.'));
        const confirmados = persistencia.value || atualizados;
        registrarBaseSyncCampo('vendedores', confirmados, persistencia.revision);
        setVendedores(confirmados);
      } else {
        setVendedores(atualizados);
      }
      setOperadorAtivo(prev => prev ? { ...prev, ...credencial } : prev);
      setNovoPinObrigatorio(''); setConfirmarPinObrigatorio('');
    } catch (error) { setErroPinObrigatorio(error?.message || tx('Não foi possível atualizar o PIN.','No fue posible actualizar el PIN.','Could not update the PIN.')); }
  };

  const solicitarDemoFirebase = async () => {
    if (!userId) return;
    try {
      await setDoc(doc(db, "solicitacoes_demo", userId), {
        email: usuarioAutenticado, uid: userId, dataSolicitacao: new Date().toISOString(), dataSolicitacaoServer: serverTimestamp(), status: 'pendente_analise'
      }, { merge: true });
      setDemoSolicitada(true);
      avisarAppZen({ variante:'success', titulo:tx('Solicitação enviada','Solicitud enviada','Request sent'), mensagem:tx('A solicitação foi registrada com sucesso.','La solicitud fue registrada correctamente.','The request was registered successfully.') });
    } catch (err) {
      avisarAppZen({ variante:'danger', titulo:'Não foi possível enviar', mensagem:tx('Erro ao enviar solicitação.', 'Error al enviar solicitud.', 'Error sending request.') });
    }
  };

  const authRouteUidRef = useRef(null);
  // 🔒 ATUALIZADO: MOTOR CLOUD-FIRST (A nuvem é a fonte absoluta da verdade)
  useEffect(() => {
    // Uma resposta assíncrona do login anterior nunca pode reativar dados de
    // outra loja depois de logout/troca de conta ou do StrictMode cleanup.
    let mounted = true;
    let authSequence = 0;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const sequence = ++authSequence;
      const isCurrent = () => mounted && sequence === authSequence;
      if (authRouteUidRef.current) clearOperationalSession(db, authRouteUidRef.current);
      authRouteUidRef.current = user?.uid || null;
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
          if (!isCurrent()) return;
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
            if (!isCurrent()) return;
            setStatusLoja('ativo');
            setPlanoLoja('basico');
          }

          const dadosLojaSnap = await getOperationalSnapshot(db, user.uid);
          if (!isCurrent()) return;
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
          if (!isCurrent()) return;
          console.error('[ZenOS][BOOTSTRAP] Falha ao confirmar os dados da nuvem. Escritas permanecem bloqueadas.', err);
          setStatusLoja('ativo');
          setPlanoLoja('basico');
          setNuvemSincronizada(false);
          setStatusSincronizacao(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ERRO');
          setErroSincronizacao(err?.message || tx('Não foi possível confirmar os dados da nuvem.','No fue posible confirmar los datos de la nube.','Could not confirm cloud data.'));
          setFalhaBootstrapNuvem(err?.message || tx('Não foi possível confirmar os dados da nuvem.','No fue posible confirmar los datos de la nube.','Could not confirm cloud data.')); 
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
      if (isCurrent()) setCarregandoAuth(false);
    });
    return () => { mounted = false; authSequence++; unsubscribe(); };
  }, []);

  // ATT 06.2: sincronização reativa V1 entre terminais.
  // ATT 10.2: realtime somente aplica dados remotos; NUNCA ecoa snapshot de volta para a nuvem.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refConfig = doc(db, 'lojas', userId, 'dados', 'configuracoes');

    const unsubOperacao = subscribeOperationalSnapshot(db, userId, (snap) => {
      if (!active) return;
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
      if (!active) return;
      console.error('[ZenOS][Realtime] operação:', err);
      setNuvemSincronizada(false);
      notifyPersistenceStatus({status:'ERRO',field: 'operacao_realtime',error:err?.message || 'Falha na sincronização operacional.'});
    });

    const unsubConfig = onSnapshot(refConfig, (snap) => {
      if (!active) return;
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
      if (!active) return;
      console.error('[ZenOS][Realtime] configuração:', err);
      notifyPersistenceStatus({status:'ERRO',field: 'configuracoes_realtime',error:err?.message || 'Falha na sincronização de configuração.'});
    });
    return () => { active = false; unsubOperacao(); unsubConfig(); };
  }, [userId]);

  // Livro completo só nas telas de auditoria/contas, nunca ao entrar no PDV.
  // Não limitar histórico: fiado e vinculação de IDs exigem todos os lançamentos.
  const telaPrecisaLivroCompleto = ecraAtual === 'clientes' || ecraAtual === 'auditoria_caixas';
  // Após a primeira abertura mantém um ÚNICO listener por sessão da loja.
  // Alternar Clientes ↔ PDV não provoca nova leitura integral do histórico.
  useEffect(() => {
    if (userId && telaPrecisaLivroCompleto) setLivroFinanceiroAtivadoParaLoja(String(userId));
  }, [userId, telaPrecisaLivroCompleto]);
  useEffect(() => {
    if (!userId) {
      setLivroFinanceiro([]);
      setLivroFinanceiroConfirmado(false);
      setLivroFinanceiroAtivadoParaLoja(null);
      return;
    }
    setLivroFinanceiroConfirmado(false);
    if (livroFinanceiroAtivadoParaLoja !== String(userId)) return;
    let ativo = true;
    return (() => {
      const cancelar = assinarLivroFinanceiro({
        db, userId,
        onData: (itens, meta) => {
          if (!ativo) return;
          setLivroFinanceiro(itens);
          if (!meta?.fromCache && !meta?.hasPendingWrites) {
            setLivroFinanceiroConfirmado(true);
            recordSyncMetric('snapshotReads', 'financeiro_realtime');
          }
        },
        onError: (err) => {
          if (!ativo) return;
          setLivroFinanceiroConfirmado(false);
          console.error('[ZenOS][ATT07][LivroFinanceiro]', err);
          notifyPersistenceStatus({status:'ERRO',field:'financeiro_realtime',error:err?.message || 'Falha na consulta do Livro Financeiro.'});
        },
      });
      return () => { ativo = false; cancelar(); };
    })();
  }, [userId, livroFinanceiroAtivadoParaLoja]);

  // Reparação conservadora: apenas um lançamento fiado isolado com evidência
  // convergente no histórico, no Livro Financeiro e na V1/V2 atuais.
  // Sem criação de vendas, migração, restauração, alteração de caixa ou inferência.
  useEffect(() => {
    if (!userId || !nuvemSincronizada || !livroFinanceiroConfirmado || reconciliacaoFiadoEmAndamentoRef.current) return;
    const candidatos = planejarReconciliacoesFiado({clientes,historicoVendas,livroFinanceiro});
    if (!candidatos.length) return;
    let cancelado=false;
    const executar=async()=>{
      reconciliacaoFiadoEmAndamentoRef.current=true;
      try {
        for(const candidato of candidatos){
          if(cancelado)break;
          // Segunda leitura obrigatória: jamais gravar com base em tela/cache.
          const [snapshot, lancamentosSnap] = await Promise.all([
            getOperationalSnapshot(db,userId),
            getDocsFromServer(query(collection(db,'lojas',String(userId),'financeiro_livro'),
              where('clienteId','==',candidato.clienteId))),
          ]);
          if(!snapshot.exists())continue;
          const financeiroRemoto=lancamentosSnap.docs.map(doc=>({id:doc.id,...doc.data()}));
          if(!financeiroRemoto.some(l=>String(l.id)===candidato.lancamentoId))continue;
          const remoto=snapshot.data();
          const candidatosRemotos=planejarReconciliacoesFiado({
            clientes:remoto.clientes,
            historicoVendas:remoto.historicoVendas,
            livroFinanceiro:financeiroRemoto,
          });
          const confirmado=candidatosRemotos.find(c=>c.lancamentoId===candidato.lancamentoId
            && c.clienteId===candidato.clienteId && c.vendaId===candidato.vendaId
            && c.saldoAnteriorBRL===candidato.saldoAnteriorBRL
            && c.saldoNovoBRL===candidato.saldoNovoBRL);
          if(!confirmado)continue;
          // Revalidar com todas as movimentações do cliente confirmadas pelo servidor.
          // Uma cobrança posterior nunca pode ser ignorada por cache defasado.
          const cliente=remoto.clientes.find(c=>String(c.id)===confirmado.clienteId);
          if(!cliente)continue;
          const atualizados=remoto.clientes.map(c=>String(c.id)===confirmado.clienteId
            ? {...c,saldoDevedorBRL:confirmado.saldoNovoBRL}:c);
          const resultado=await persistV1BusinessOperationSafe({
            db,userId,
            changes:[{field:'clientes',baseValue:remoto.clientes,value:atualizados,
              localStorageKey:`zenos_${userId}_clientes`}],
            guards:[{type:'entity_unchanged',field:'clientes',entityId:cliente.id,entityKey:'id',expected:cliente}],
            operationKey:confirmado.operationKey,
          });
          if(resultado.cloudOk){
            registrarBaseSyncCampo('clientes',resultado.values.clientes,resultado.revisions?.clientes);
            setClientes(resultado.values.clientes);
          }else{
            console.error('[ZenOS][Fiado] Reconciliação bloqueada com segurança:',resultado.error);
          }
        }
      }catch(err){console.error('[ZenOS][Fiado] Falha na conferência segura:',err);}
      finally{reconciliacaoFiadoEmAndamentoRef.current=false;}
    };
    void executar();
    return()=>{cancelado=true;};
  // Não associar o efeito à função de escrita (recriada a cada render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId,nuvemSincronizada,livroFinanceiroConfirmado,livroFinanceiro,clientes,historicoVendas]);

  const salvarPerfilRapido = async () => {
    const pf = normalizarPerfilLoja(perfilRapidoRascunho);
    if (!pf.nomeFantasia.trim()) return;
    setPerfilLoja(pf); salvarPerfilLojaLocal(userId, pf);
    if (userId) { notifyPersistenceStatus({status:'SALVANDO',field: 'configuracoes'}); try { await setDoc(doc(db, 'lojas', userId, 'dados', 'configuracoes'), { perfilLoja: pf, updatedAtClient:new Date().toISOString(), updatedAtServer:serverTimestamp() }, { merge: true }); notifyPersistenceStatus({status:'SINCRONIZADO',field: 'configuracoes'}); } catch(error) { notifyPersistenceStatus({status:'ERRO',field: 'configuracoes',error:error?.message||String(error)}); throw error; } }
    setPerfilRapidoErro('');
    setModalPerfilRapido(false);
  };

  const fazerLogout = async () => {
    // Na seleção de operador o modal global não está montado; sair diretamente.
    // Com operador autenticado, manter a confirmação administrativa existente.
    const confirmou = !operadorAtivo || await confirmarAppZen({
      variante:'warning',
      titulo:tx('Encerrar sessão da loja', 'Cerrar sesión de la tienda', 'End store session'),
      mensagem:tx('Encerrar a sessão principal desta loja?', '¿Cerrar la sesión principal de esta tienda?', 'End the main session for this store?'),
      confirmarTexto:tx('Encerrar sessão', 'Cerrar sesión', 'End session')
    });
    if (!confirmou) return;
    clearOperationalSession(db, userId);
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
    if (!userId) throw new Error(tx('Loja não identificada para o Livro Financeiro.','Tienda no identificada para el Libro Financiero.','Store not identified for the Financial Ledger.'));
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
    const usd = interpretarValorMonetario(taxasInput.USD, 'BRL');
    const eur = interpretarValorMonetario(taxasInput.EUR, 'BRL');
    const pyg = interpretarValorMonetario(taxasInput.PYG, 'PYG');
    if (!usd.ok || !eur.ok || !pyg.ok || usd.valor <= 0 || eur.valor <= 0 || pyg.valor <= 0) {
      return avisarAppZen({ variante:'danger', titulo:'Cotação inválida', mensagem:'Informe cotações positivas e completas. Nenhuma cotação foi alterada.' });
    }
    if (!userId || !nuvemSincronizada) {
      return avisarAppZen({ variante:'danger', titulo:'Cotação não salva', mensagem:'Aguarde a confirmação da nuvem para alterar o câmbio.' });
    }
    const novasTaxas = normalizarTaxasCambio({ BRL:1, USD:1 / usd.valor, EUR:1 / eur.valor, PYG:pyg.valor });
    try {
      notifyPersistenceStatus({status:'SALVANDO',field:'configuracoes'});
      await setDoc(doc(db, 'lojas', userId, 'dados', 'configuracoes'),
        { taxasCambio: novasTaxas, updatedAtClient:new Date().toISOString(), updatedAtServer:serverTimestamp() }, { merge:true });
      // Publicação na interface SOMENTE após a confirmação autoritativa.
      setTaxasCambio(novasTaxas);
      notifyPersistenceStatus({status:'SINCRONIZADO',field:'configuracoes'});
      setModalCambioAberto(false);
    } catch (err) {
      console.error('[ZenOS][Câmbio] A nuvem não confirmou o novo câmbio:', err);
      notifyPersistenceStatus({status:'ERRO',field:'configuracoes',error:err?.message || String(err)});
      avisarAppZen({ variante:'danger', titulo:'Cotação não salva', mensagem:'A nuvem não confirmou a atualização. As taxas anteriores permanecem em uso.' });
    }
  };

  const vendasValidas = historicoVendas.filter(v => v.estado === 'concluida' || v.estado === 'parcial');
  
  // Resumo individual para vendedores; gerência mantém a visão global.
  const vendasHoje = filtrarVendasHojeVisiveis({historicoVendas,operadorAtivo,patenteUsuario});
  const faturamentoHojeBRL = vendasHoje.reduce((acc, v) => acc + obterFinanceiroVenda(v).totalLiquidoBRL, 0);
  const faturamentoTotalBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).totalLiquidoBRL, 0);
  const cmvTotalBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).cmvLiquidoBRL, 0);
  const lucroBrutoBRL = vendasValidas.reduce((acc, v) => acc + obterFinanceiroVenda(v).lucroLiquidoBRL, 0);
  const despesasPagasBRL = despesas.filter(d => (d.status === 'paga' || (d.status === 'excluida' && d.financeiroMantido === true)) && d.afetaResultado !== false && d.naturezaContabil !== 'estoque_ativo' && d.categoria !== 'Mercadoria para Revenda').reduce((acc,d)=>acc+(Number(d.valorBRL)||0),0);
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
  const vendasDestaSessao = sessaoAtiva ? vendasDaSessao({ sessao: sessaoAtiva, historicoVendas }) : [];
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

  const validarValoresMovCaixa = () => {
    const resultado = converterValoresFisicosParaBRL(valoresMovCaixa, taxasCambio);
    if (!resultado.ok) {
      avisarAppZen({
        variante: 'danger',
        titulo: tx('Valor monetário inválido', 'Importe monetario inválido', 'Invalid cash amount'),
        mensagem: resultado.erro,
      });
      return null;
    }
    return resultado;
  };
  const calcularTotalMovBRL = () => converterValoresFisicosParaBRL(valoresMovCaixa, taxasCambio).totalBRL ?? NaN;
  const resetarValoresCaixa = () => setValoresMovCaixa({ BRL: '', USD: '', EUR: '', PYG: '' });

  const abrirTurnoDeCaixa = async () => {
    const contagemValidada = validarValoresMovCaixa();
    if (!contagemValidada) return;
    const saldoIni = contagemValidada.totalBRL;
    const novaSessao = {
      id: `SESSAO-${Date.now()}`,
      operadorId: idVendedorAtual,
      operadorNome: operadorAtivo?.nome || 'Administrador',
      saldoInicial: saldoIni,
      detalheAbertura: { ...valoresMovCaixa },
      detalheAberturaNativos: contagemValidada.valoresNativos,
      taxasCambioAbertura: { ...taxasCambio },
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
      return avisarAppZen({ variante:'danger', titulo:tx('Caixa não aberto','Caja no abierta','Register not opened'), mensagem:tx('A nuvem não confirmou a abertura do turno.','La nube no confirmó la apertura del turno.','The cloud did not confirm opening the shift.'), detalhes:[confirmado?.error?.message || tx('Tente novamente quando a sincronização estiver disponível.','Intente nuevamente cuando la sincronización esté disponible.','Try again when synchronization is available.')] });
    }
    setSessoesCaixa(confirmado.values?.sessoesCaixa || sessoesPropostas);
    setModalCaixaAberto(false);
    resetarValoresCaixa();
  };

  // Impede dupla submissão antes do primeiro render e preserva o resultado incerto.
  const movCaixaEmAndamentoRef = useRef(false);
  const movCaixaResultadoIncertoRef = useRef(false);
  const registrarMovimentoCaixa = async () => {
    const pendenciaKey = sessaoAtiva && userId ? `zenos_${userId}_caixa_mov_pendente_${sessaoAtiva.id}` : null;
    const pendenciaAnterior = pendenciaKey ? zenosStorage.getItem(pendenciaKey) : null;
    if (pendenciaAnterior) {
      if(movCaixaEmAndamentoRef.current)return;
      movCaixaEmAndamentoRef.current=true;
      try {
        let tentativa=null;
        try {tentativa=JSON.parse(pendenciaAnterior);}catch(_){}
        const verificacao=await verificarMovimentoCaixaNoServidor({db,userId,tentativa});
        if(verificacao.status==='confirmed'){
          setCaixaMovimentos(verificacao.movimentos);
          zenosStorage.removeItem(pendenciaKey);
          movCaixaResultadoIncertoRef.current=false;
          return avisarAppZen({variante:'success',titulo:'Movimento original confirmado',mensagem:'A retirada anterior já estava registrada no servidor e no livro financeiro. Nenhum novo lançamento foi criado. Confira o extrato antes de iniciar outra operação.'});
        }
        return avisarAppZen({
          variante:verificacao.status==='conflict'?'danger':'warning',
          titulo:'Retirada exige conciliação',
          mensagem:'O servidor ainda não comprovou a retirada original nos dois registros (caixa e livro financeiro). Nenhuma nova retirada foi enviada. Solicite reconciliação antes de tentar novamente.',
          detalhes:[`Referência preservada: ${tentativa?.id||'indisponível'}`,`Estado: ${verificacao.reason||verificacao.status}`]
        });
      }finally{movCaixaEmAndamentoRef.current=false;}
    }
    if (movCaixaEmAndamentoRef.current || movCaixaResultadoIncertoRef.current) {
      return avisarAppZen({variante:'warning',titulo:'Movimento pendente de conferência',mensagem:'Não repita a retirada: verifique o extrato e a confirmação no servidor antes de uma nova tentativa.'});
    }
    movCaixaEmAndamentoRef.current = true;
    try {
    if (!sessaoAtiva) return avisarAppZen({ variante:'warning', titulo:'Caixa fechado', mensagem:tx('Precisa de abrir o turno de caixa primeiro.', 'Debe abrir turno primero.', 'Must open shift first.') });
    const movimentoValidado = validarValoresMovCaixa();
    if (!movimentoValidado) return;
    const valBRL = movimentoValidado.totalBRL;
    if (valBRL <= 0) return avisarAppZen({ variante:'warning', titulo:'Valor inválido', mensagem:tx('Insira um valor válido.', 'Ingrese un valor válido.', 'Enter a valid amount.') });
    if (tipoMovCaixa === 'sangria' && valBRL > saldoSessaoFisicoBRL + 0.001) {
      return avisarAppZen({ variante:'danger', titulo:'Saldo insuficiente na gaveta', mensagem:tx('A sangria não pode ser maior que o dinheiro físico disponível.', 'La sangría no puede superar el efectivo disponible.', 'Cash drop cannot exceed physical cash available.'), detalhes:[`Solicitado: ${fmt(valBRL,'BRL')}`, tx('Saldo esperado oculto até o fechamento cego.','Saldo esperado oculto hasta el cierre ciego.','Expected balance hidden until blind closeout.')] });
    }
    const agoraISO = new Date().toISOString();
    const novoMov = { 
      id: Date.now(), sessaoId: sessaoAtiva.id, dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'), createdAt: agoraISO,
      tipo: tipoMovCaixa, valorBRL: valBRL, detalhesMoedas: { ...valoresMovCaixa }, detalhesMoedasNativas: movimentoValidado.valoresNativos, taxasCambioMovimento: { ...taxasCambio },
      direcao: tipoMovCaixa === 'suprimento' ? 'entrada' : 'saida', afetaGaveta: true,
      descricao: descMovCaixa || (tipoMovCaixa === 'suprimento' ? tx('Reforço de Fundo', 'Refuerzo de Caja', 'Float Fund') : tx('Retirada de Caixa', 'Retiro de Caja', 'Cash Withdrawal')), 
      operador: operadorAtivo?.nome 
    };
    const movimentosPropostos = [novoMov, ...caixaMovimentos];
    // Bloqueio persistente ANTES do envio: se cair a rede ou recarregar a aba,
    // não se pode criar outro ID e movimentar dinheiro novamente às cegas.
    if (!pendenciaKey || !zenosStorage.setItem(pendenciaKey, JSON.stringify({
      id:novoMov.id, sessaoId:sessaoAtiva.id, tipo:novoMov.tipo, valorBRL:valBRL, createdAt:agoraISO
    }))) {
      return avisarAppZen({variante:'danger',titulo:'Movimento não iniciado',mensagem:'Não foi possível preservar a identificação da retirada neste dispositivo. Nenhum lançamento foi enviado.'});
    }
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
        ...(tipoMovCaixa === 'sangria' ? [{ type:'cash_balance_at_least', sessionId:sessaoAtiva.id, amount:valBRL, message:tx('O saldo físico do caixa mudou em outro terminal. A sangria não foi realizada.','El saldo físico de caja cambió en otro terminal. El retiro no fue realizado.','The physical cash balance changed on another terminal. The cash drop was not performed.') }] : []),
      ],
      operationKey: `mov-caixa:${novoMov.id}`,
    });
    if (!confirmado?.cloudOk) {
      movCaixaResultadoIncertoRef.current = true;
      return avisarAppZen({ variante:'danger', titulo:tx('Confirmação pendente','Confirmación pendiente','Confirmation pending'), mensagem:tx('A nuvem não confirmou a retirada. Ela pode estar registrada. Não repita: confira o extrato e concilie o movimento original.','La nube no confirmó el retiro; podría estar registrado. No repita sin conciliar.','The cloud did not confirm the withdrawal; it may have been recorded. Verify the original record before retrying.'), detalhes:[confirmado?.error?.message || tx('Confirmação desconhecida; referência preservada neste dispositivo.','Confirmación desconocida; referencia preservada en este dispositivo.','Confirmation unknown; attempt reference preserved on this device.')] });
    }
    setCaixaMovimentos(confirmado.values?.caixaMovimentos || movimentosPropostos);
    zenosStorage.removeItem(pendenciaKey);
    setModalCaixaAberto(false);
    resetarValoresCaixa(); setDescMovCaixa('');
    } finally {
      movCaixaEmAndamentoRef.current = false;
    }
  };

  const processarFechamentoCego = async () => {
    if (!sessaoAtiva || !resumoSessaoAtiva) {
      return avisarAppZen({
        variante: 'warning',
        titulo: tx('Nenhum turno aberto','Ningún turno abierto','No open shift'),
        mensagem: tx('Não existe turno aberto para encerrar.', 'No hay un turno abierto para cerrar.', 'There is no open shift to close.'),
        apenasConfirmar: true,
      });
    }

    const houveContagem = Object.values(valoresMovCaixa || {}).some(v => String(v ?? '').trim() !== '');
    if (!houveContagem) {
      return avisarAppZen({
        variante: 'warning',
        titulo: tx('Informe a contagem física','Informe el conteo físico','Enter the physical count'),
        mensagem: tx(
          'Conte a gaveta e informe os valores encontrados. Se uma moeda não existir na gaveta, digite 0.',
          'Cuente la gaveta e informe los valores encontrados. Si no hay una moneda, ingrese 0.',
          'Count the drawer and enter the amounts found. If a currency is not present, enter 0.'
        ),
        apenasConfirmar: true,
      });
    }

    const contagemValidada = validarValoresMovCaixa();
    if (!contagemValidada) return;
    const conciliacaoFisica = calcularConciliacaoFisicaMultimoeda({
      sessao: sessaoAtiva, historicoVendas, caixaMovimentos,
      contagem: contagemValidada.valoresNativos, taxas: taxasCambio,
    });
    const saldoEsperadoBRL = conciliacaoFisica.confiavel
      ? conciliacaoFisica.totalEsperadoBRL : Number(resumoSessaoAtiva.saldoEsperado || 0);
    const valInformadoBRL = contagemValidada.totalBRL;
    const diferenca = conciliacaoFisica.confiavel ? conciliacaoFisica.diferencaBRL : null;
    const assinaturaFechamento = assinaturaFinanceiraSessao({ sessao:sessaoAtiva, historicoVendas, caixaMovimentos });

    const dataFechoISO = new Date().toISOString();
    const dataFechoLocal = new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR');
    // Jamais usar livro vazio/parcial ou dados de cache no fechamento.
    // A consulta por sessão busca TODAS as movimentações deste turno, não o histórico da loja.
    let livroSessaoConfirmado;
    try {
      livroSessaoConfirmado = await consultarLivroFinanceiroSessaoServidor({ db, userId, sessaoId:sessaoAtiva.id });
    } catch (erro) {
      console.error('[ZenOS][Fechamento] Livro Financeiro não confirmado', erro);
      return avisarAppZen({variante:'warning',titulo:'Fechamento aguardando confirmação',
        mensagem:'Não foi possível conferir os lançamentos financeiros deste turno na nuvem. O caixa permanece aberto; não repita operações financeiras até a sincronização ser restabelecida.'});
    }
    const conciliacaoEletronica = calcularConciliacaoEletronicaSessao({ sessao: sessaoAtiva, livroFinanceiro:livroSessaoConfirmado }) || {
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
          detalheFechamentoNativos: contagemValidada.valoresNativos,
          taxasCambioFechamento: { ...taxasCambio },
          diferenca,
          saldoSistema: saldoEsperadoBRL,
          saldoSistemaReferencialBRL: Number(resumoSessaoAtiva.saldoEsperado || 0),
          situacaoConciliacao: !conciliacaoFisica.confiavel ? 'PENDENTE_AUDITORIA'
            : conciliacaoFisica.divergenciaFisica ? 'DIVERGENCIA_FISICA' : 'CONCILIADO',
          pendenciasConciliacao: conciliacaoFisica.pendencias,
          composicaoEsperadaNativa: conciliacaoFisica.esperado,
          composicaoContadaNativa: conciliacaoFisica.contado,
          diferencasNativas: conciliacaoFisica.diferencas,
          assinaturaSnapshotFechamento: assinaturaFechamento,
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

    // Relatório informativo bruto por forma E moeda; não comparar valores nativos
    // de PYG/USD/EUR com o líquido em BRL da gaveta.
    const resumoEntradas = vendasDestaSessao.reduce((res, v) => {
      (v.pagamentos || []).forEach(p => {
        const rotulo = p.rotulo || p.formaId || 'Pagamento';
        const moedaOriginal = p.moedaOrigem || (p.valorOriginal == null ? 'BRL' : 'N/I');
        const chave = JSON.stringify([p.formaId || rotulo, moedaOriginal]);
        if (!res[chave]) res[chave] = { rotulo, moedaOriginal, valorOriginal: 0, valorBRL: 0 };
        res[chave].valorOriginal += Number(p.valorOriginal ?? p.valorConvertidoBRL ?? 0);
        res[chave].valorBRL += Number(p.valorConvertidoBRL || 0);
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

    const moedasContadasHTML = Object.entries(contagemValidada.valoresNativos)
      .map(([m, v]) => `<div style="display:flex;justify-content:space-between;"><span>${m} contado:</span><span>${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: m === 'PYG' ? 0 : 2, maximumFractionDigits: m === 'PYG' ? 0 : 2 })}</span></div>`)
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

    const temQuebra = !conciliacaoFisica.confiavel || conciliacaoFisica.divergenciaFisica;
    const descQuebra = !conciliacaoFisica.confiavel
      ? 'AUDITORIA PENDENTE — NÃO IMPUTAR FALTA'
      : conciliacaoFisica.divergenciaFisica
        ? 'DIVERGÊNCIA FÍSICA POR MOEDA — CONFERIR'
        : tx('CAIXA CONCILIADO','CAJA CONCILIADA','CASH RECONCILED');
    const demonstrativoMoedas = ['BRL','USD','EUR','PYG'].map(m => {
      const casas = m === 'PYG' ? 0 : 2;
      const n = valor => Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits:casas, maximumFractionDigits:casas });
      return `<div style="display:flex;justify-content:space-between;gap:6px;"><span>${m} esperado: ${n(conciliacaoFisica.esperado?.[m])}</span><span>contado: ${n(conciliacaoFisica.contado?.[m])} / dif.: ${n(conciliacaoFisica.diferencas?.[m])}</span></div>`;
    }).join('');

    const reciboFechoHTML = `
      <div style="font-family:monospace;font-size:12px;width:100%;text-align:left;">
        <div style="text-align:center;margin-bottom:10px;">
          <h2 style="margin:0;font-size:14px;">${tx('FECHAMENTO CEGO DE TURNO','CIERRE CIEGO DE TURNO','BLIND SHIFT CLOSE')}</h2>
          <div>ZenOS - ${tx('SISTEMA DE GESTÃO','SISTEMA DE GESTIÓN','MANAGEMENT SYSTEM')}</div>
        </div>
        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div><strong>${tx('Operador:','Operador:','Operator:')}</strong> ${escaparHTML(sessaoAtiva.operadorNome)}</div>
        <div><strong>${tx('Abertura:','Apertura:','Opening:')}</strong> ${sessaoAtiva.abertura}</div>
        <div><strong>${tx('Fechamento:','Cierre:','Closing:')}</strong> ${dataFechoLocal}</div>
        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>

        <div style="margin-bottom:5px;"><strong>>> ${tx('COMPOSIÇÃO DO DINHEIRO FÍSICO','COMPOSICIÓN DEL DINERO FÍSICO','PHYSICAL CASH COMPOSITION')}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Fundo inicial:','Fondo inicial:','Opening float:')}</span><span>${fmt(componentes.fundoInicial, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Vendas em dinheiro:','Ventas en efectivo:','Cash sales:')}</span><span>+ ${fmt(componentes.vendasDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Recebimentos em dinheiro:','Cobros en efectivo:','Cash receipts:')}</span><span>+ ${fmt(componentes.recebimentosDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Suprimentos:','Refuerzos:','Cash in:')}</span><span>+ ${fmt(componentes.suprimentos, 'BRL')}</span></div>
        ${componentes.outrasEntradas ? `<div style="display:flex;justify-content:space-between;"><span>${tx('Outras entradas:','Otras entradas:','Other inflows:')}</span><span>+ ${fmt(componentes.outrasEntradas, 'BRL')}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>${tx('Sangrias:','Retiros:','Cash drops:')}</span><span>- ${fmt(componentes.sangrias, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Devoluções em dinheiro:','Devoluciones en efectivo:','Cash returns:')}</span><span>- ${fmt(componentes.devolucoesDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Despesas em dinheiro:','Gastos en efectivo:','Cash expenses:')}</span><span>- ${fmt(componentes.despesasDinheiro, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Compras em dinheiro:','Compras en efectivo:','Cash purchases:')}</span><span>- ${fmt(componentes.comprasDinheiro, 'BRL')}</span></div>
        ${componentes.outrasSaidas ? `<div style="display:flex;justify-content:space-between;"><span>${tx('Outras saídas:','Otras salidas:','Other outflows:')}</span><span>- ${fmt(componentes.outrasSaidas, 'BRL')}</span></div>` : ''}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> ${tx('VENDAS POR FORMA DE PAGAMENTO','VENTAS POR FORMA DE PAGO','SALES BY PAYMENT METHOD')}</strong></div>
        ${Object.keys(resumoEntradas).length > 0 ? Object.values(resumoEntradas).map(item => `<div style="display:flex;justify-content:space-between;gap:6px;"><span>${escaparHTML(item.rotulo)} (${item.moedaOriginal}):</span><span>${Number(item.valorOriginal).toLocaleString('pt-BR', { minimumFractionDigits: item.moedaOriginal === 'PYG' ? 0 : 2, maximumFractionDigits: item.moedaOriginal === 'PYG' ? 0 : 2 })} • ${fmt(item.valorBRL, 'BRL')}</span></div>`).join('') : `<div style="text-align:center;">${tx('Nenhuma venda','Ninguna venta','No sales')}</div>`}
        <div style="font-size:10px;margin-top:4px;">${tx('Valores por forma são brutos e podem incluir troco. A composição da gaveta apresenta o líquido em BRL. N/I = moeda de origem não registrada.','Los importes por forma son brutos y pueden incluir cambio. El efectivo es neto en BRL. N/I = moneda desconocida.','Payment totals are gross and may include change. Drawer amounts are net BRL. N/I = currency not recorded.')}</div>

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> ${tx('CONCILIAÇÃO ELETRÔNICA (NÃO AFETA GAVETA)','CONCILIACIÓN ELECTRÓNICA (NO AFECTA CAJA)','ELECTRONIC RECONCILIATION (DOES NOT AFFECT DRAWER)')}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('PIX recebido:','PIX recibido:','PIX received:')}</span><span>+ ${fmt(conciliacaoEletronica.pixEntradas, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('PIX saídas/estornos:','PIX salidas/reversiones:','PIX outflows/refunds:')}</span><span>- ${fmt(conciliacaoEletronica.pixSaidas, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>${tx('PIX líquido:','PIX neto:','Net PIX:')}</span><span>${fmt(conciliacaoEletronica.pixLiquido, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Cartão crédito líquido:','Tarjeta crédito neta:','Net credit card:')}</span><span>${fmt(conciliacaoEletronica.cartaoCreditoLiquido, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${tx('Cartão débito líquido:','Tarjeta débito neta:','Net debit card:')}</span><span>${fmt(conciliacaoEletronica.cartaoDebitoLiquido, 'BRL')}</span></div>
        <div style="font-size:10px;margin-top:4px;">${tx('Valores eletrônicos são conciliados separadamente e não compõem o saldo físico esperado da gaveta.','Los valores electrónicos se concilian por separado y no componen el saldo físico esperado de la caja.','Electronic amounts are reconciled separately and do not make up the expected physical cash balance.')}</div>
        ${extratoPixHTML ? `<div style="border-top:1px dotted #000;margin-top:7px;padding-top:5px;"><strong>>> ${tx('EXTRATO PIX DO TURNO','EXTRACTO PIX DEL TURNO','SHIFT PIX STATEMENT')}</strong>${extratoPixHTML}</div>` : `<div style="margin-top:5px;text-align:center;">${tx('Nenhum PIX registrado no turno','Ningún PIX registrado en el turno','No PIX recorded in the shift')}</div>`}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="margin-bottom:5px;"><strong>>> ${tx('CONTAGEM INFORMADA PELO OPERADOR','CONTEO INFORMADO POR EL OPERADOR','COUNT ENTERED BY OPERATOR')}</strong></div>
        ${moedasContadasHTML}
        <div style="margin-top:6px;font-weight:bold;">>>> CONCILIAÇÃO FÍSICA POR MOEDA</div>
        ${demonstrativoMoedas}
        ${!conciliacaoFisica.confiavel ? `<div style="margin-top:5px;font-weight:bold;">RECONCILIAÇÃO INCONCLUSIVA: ${conciliacaoFisica.pendencias.map(escaparHTML).join(' | ')}</div>` : ''}

        <div style="border-bottom:1px dashed #000;margin:10px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>${tx('SALDO ESPERADO:','SALDO ESPERADO:','EXPECTED BALANCE:')}</span><span>${fmt(saldoEsperadoBRL, 'BRL')}${conciliacaoFisica.confiavel ? '' : ' (REFERENCIAL)'}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>${tx('TOTAL CONTADO:','TOTAL CONTADO:','TOTAL COUNTED:')}</span><span>${fmt(valInformadoBRL, 'BRL')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>${tx('DIFERENÇA:','DIFERENCIA:','DIFFERENCE:')}</span><span>${conciliacaoFisica.confiavel ? fmt(diferenca, 'BRL') : 'INDETERMINADA'}</span></div>
        <div style="text-align:center;font-weight:bold;margin-top:8px;">${descQuebra}</div>

        <div style="margin-top:36px;text-align:center;">_________________________________<br/>${tx('Assinatura do Operador','Firma del Operador','Operator Signature')}<br/>${escaparHTML(sessaoAtiva.operadorNome)}</div>
        <div style="margin-top:36px;text-align:center;">_________________________________<br/>${tx('Conferência da Gerência','Revisión de Gerencia','Management Review')}</div>
      </div>
    `;

    const fechamentoConfirmado = await commitOperacaoCritica(
      [{ field:'sessoesCaixa', value:sessoesAtualizadas, storageSuffix:'sessoes_caixa' }],
      {
        operationKey: `fechar-caixa:${sessaoAtiva.id}`,
        guards: [
          { type:'cash_session_open', sessionId:sessaoAtiva.id },
          { type:'cash_close_snapshot_matches', sessionId:sessaoAtiva.id, assinatura:assinaturaFechamento },
          { type:'cash_close_exchange_rates_match', taxas:{ ...taxasCambio } },
        ],
      }
    );
    if (!fechamentoConfirmado?.cloudOk) {
      return avisarAppZen({
        variante:'danger',
        titulo:tx('Confirmação do caixa pendente','Confirmación de caja pendiente','Register confirmation pending'),
        mensagem:tx('Não foi possível confirmar o estado do fechamento no servidor. Confira a situação do turno e o extrato após restaurar a conexão. Não repita o fechamento antes de verificar.',
          'No se pudo confirmar el estado del cierre en el servidor. Revise el turno y el extracto después de restaurar la conexión. No repita el cierre sin verificar.',
          'Could not verify the register closing on the server. Check shift status and ledger after reconnecting. Do not repeat closing without verification.'),
        detalhes:[fechamentoConfirmado?.error?.message || tx('Estado desconhecido; preserve os dados e confira o servidor.','Estado desconocido; conserve los datos y consulte el servidor.','Outcome unknown; preserve records and check the server.')],
      });
    }
    setSessoesCaixa(fechamentoConfirmado.values?.sessoesCaixa || sessoesAtualizadas);

    const janelaImpressao = window.open('', '_blank', 'width=400,height=650');
    if (janelaImpressao) {
      janelaImpressao.document.write(`<!DOCTYPE html><html><head><title>${tx('Fechamento de Turno','Cierre de Turno','Shift Closing')}</title><style>@page{margin:0;size:80mm auto;}body{margin:0;padding:10px;width:80mm;box-sizing:border-box;}</style></head><body>${reciboFechoHTML}<script>window.onload=function(){window.focus();window.print();};</script></body></html>`);
      janelaImpressao.document.close();
    }

    setModalCaixaAberto(false);
    resetarValoresCaixa();
    setDescMovCaixa('');

    avisarAppZen({
      variante: temQuebra ? 'warning' : 'success',
      titulo: !conciliacaoFisica.confiavel ? 'Fechamento registrado — auditoria pendente'
        : temQuebra ? 'Fechamento registrado — diferença por moeda' : 'Caixa fechado e conciliado',
      mensagem: !conciliacaoFisica.confiavel
        ? 'A documentação de algumas operações não permite concluir a falta ou sobra. Não atribua responsabilidade financeira ao operador sem auditoria.'
        : temQuebra ? 'As quantidades físicas por moeda não conferem. Confira o demonstrativo individual no comprovante.'
          : 'A contagem física confere com os valores esperados em cada moeda.',
      detalhes: [
        `Saldo esperado: ${fmt(saldoEsperadoBRL, 'BRL')}`,
        `Total contado: ${fmt(valInformadoBRL, 'BRL')}`,
        `Diferença: ${conciliacaoFisica.confiavel ? fmt(diferenca, 'BRL') : 'INDETERMINADA'}`,
        ...conciliacaoFisica.pendencias.slice(0, 4),
        janelaImpressao ? 'Comprovante aberto para impressão.' : 'A impressão foi bloqueada pelo navegador; o fechamento ficou registrado.',
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

  const resultadoFilaFiscal = useMemo(() => {
    return derivarFilaFiscalSegura({
      lojaId:userId,
      perfilLoja,
      vendas:historicoVisivelParaOperador,
      documentos:[],
      ambiente:'homologacao',
    });
  }, [historicoVisivelParaOperador, perfilLoja, userId]);

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
        ...(temPermissao('vendas') ? [{ id:'fiscal', tela:'fiscal', icone:'🧾', rotulo:tx('Fiscal','Fiscal','Fiscal'), badge:resultadoFilaFiscal.erro ? '!' : (resultadoFilaFiscal.fila.length || null), onClick:()=>navegarPara('fiscal') }] : []),
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
        ...(temPermissao('admin') ? [{ id:'commerce-solicitar', tela:'commerce-solicitar', icone:'🛍️', rotulo:tx('Minha Loja Online','Mi Tienda Online','My Online Store'), onClick:()=>navegarPara('commerce-solicitar') }] : []),
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
          <ZenosLogo aoClicar={() => {}} tx={tx} />
          <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 700, letterSpacing: '2px' }}>{tx('A INICIAR SISTEMA...','INICIANDO SISTEMA...','STARTING SYSTEM...')}</span>
        </div>
      </div>
    );
  }

  if (!usuarioAutenticado) {
    // A URL de login mantém a tela existente de usuário e senha, sem tocar na autenticação.
    const acessoLogin = window.location.pathname === '/login' || new URLSearchParams(window.location.search).get('login') === '1';
    return acessoLogin ? <LandingPage/> : <PublicHomeRedirect/>;
  }

  if (falhaBootstrapNuvem) {
    return <div style={{minHeight:'100vh',background:'#020617',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:560,background:'#0b1120',border:'1px solid #f59e0b',borderRadius:24,padding:28,color:'#fff',boxShadow:'0 30px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:18}}><img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:58,height:58,objectFit:'contain'}}/><div><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:'#f59e0b'}}>{tx('PROTEÇÃO DE DADOS ATIVA','PROTECCIÓN DE DATOS ACTIVA','DATA PROTECTION ACTIVE')}</div><h2 style={{margin:'4px 0 0',fontSize:22}}>{tx('Nuvem não confirmada','Nube no confirmada','Cloud not confirmed')}</h2></div></div>
        <p style={{color:'#cbd5e1',lineHeight:1.6,fontSize:14}}>{tx('O ZenOS não conseguiu confirmar a base da loja. Para proteger produtos, clientes, vendas e financeiro,','ZenOS no pudo confirmar la base de la tienda. Para proteger productos, clientes, ventas y finanzas,','ZenOS could not confirm the store database. To protect products, customers, sales and finances,')} <b>{tx('todas as gravações na nuvem permanecem bloqueadas','todas las escrituras en la nube permanecen bloqueadas','all cloud writes remain blocked')}</b>. {tx('Nenhum array vazio será enviado ao Firestore nesta condição.','Ningún array vacío será enviado a Firestore en esta condición.','No empty array will be sent to Firestore in this condition.')}</p>
        <div style={{background:'#020617',border:'1px solid #1e293b',borderRadius:14,padding:14,color:'#94a3b8',fontSize:12,margin:'16px 0'}}>{tx('Detalhe técnico:','Detalle técnico:','Technical detail:')} {falhaBootstrapNuvem}</div>
        <button onClick={()=>window.location.reload()} style={{width:'100%',padding:14,borderRadius:11,border:'none',background:'#d97706',color:'#fff',fontWeight:900,cursor:'pointer'}}>{tx('Tentar conectar novamente','Intentar conectar nuevamente','Try to connect again')}</button>
      </div>
    </div>;
  }

  if (statusLoja === 'ativo' && !operadorAtivo) {
    return <TerminalLogin vendedores={vendedores} onLoginSuccess={processarLoginOperador} onSairLoja={fazerLogout} tx={tx} />;
  }

  if (statusLoja === 'ativo' && operadorAtivo && operadorRequerTrocaPin(operadorAtivo)) {
    return <div style={{minHeight:'100vh',background:'#020617',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:460,background:'#0b1120',border:'1px solid #f59e0b',borderRadius:24,padding:28,color:'#fff',boxShadow:'0 30px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:18}}><img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:54,height:54,objectFit:'contain'}}/><div><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:'#f59e0b'}}>{tx('SEGURANÇA OBRIGATÓRIA','SEGURIDAD OBLIGATORIA','SECURITY REQUIRED')}</div><h2 style={{margin:'4px 0 0',fontSize:22}}>{tx('Defina um novo PIN','Defina un nuevo PIN','Set a new PIN')}</h2></div></div>
        <p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.55}}>{tx('O PIN temporário ou previsível não pode continuar sendo usado. Essa troca é obrigatória antes de operar a loja.','El PIN temporal o previsible no puede seguir siendo usado. Este cambio es obligatorio antes de operar la tienda.','The temporary or predictable PIN cannot continue to be used. This change is required before operating the store.')}</p>
        <div style={{display:'grid',gap:10,margin:'16px 0'}}>
          <input type="text" autoComplete="one-time-code" name="zenos-new-pin" data-lpignore="true" data-1p-ignore="true" value={novoPinObrigatorio} onChange={e=>setNovoPinObrigatorio(e.target.value)} placeholder={tx('Novo PIN','Nuevo PIN','New PIN')} style={{padding:13,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff',WebkitTextSecurity:'disc'}}/>
          <input type="text" autoComplete="one-time-code" name="zenos-confirm-pin" data-lpignore="true" data-1p-ignore="true" value={confirmarPinObrigatorio} onChange={e=>setConfirmarPinObrigatorio(e.target.value)} placeholder={tx('Confirmar novo PIN','Confirmar nuevo PIN','Confirm new PIN')} style={{padding:13,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff',WebkitTextSecurity:'disc'}}/>
          {erroPinObrigatorio && <div style={{color:'#fb7185',fontSize:12,fontWeight:800}}>{erroPinObrigatorio}</div>}
        </div>
        <button onClick={concluirTrocaPinObrigatoria} style={{width:'100%',padding:14,borderRadius:11,border:'none',background:'#d97706',color:'#fff',fontWeight:900,cursor:'pointer'}}>{tx('Salvar novo PIN e continuar','Guardar nuevo PIN y continuar','Save new PIN and continue')}</button>
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
            {tx('Licença Pendente /','Licencia Pendiente /','License Pending /')}<br/>{tx('Teste Expirado','Prueba Expirada','Trial Expired')}
          </h2>

          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '24px' }}>
            {tx('O seu período de teste gratuito de 7 dias terminou ou a licença da loja aguarda ativação. Escolha um plano para desbloquear o terminal ZenOS de imediato.','Su período de prueba gratuito de 7 días terminó o la licencia de la tienda espera activación. Elija un plan para desbloquear el terminal ZenOS de inmediato.','Your 7-day free trial has ended or the store license is awaiting activation. Choose a plan to unlock the ZenOS terminal immediately.')}
          </p>

          {/* INNER CARD - CLOUD SAAS ENTERPRISE */}
          <div style={{ backgroundColor: '#020617', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid #1e293b' }}>
            <span style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>{tx('Ativação Instantânea:','Activación Instantánea:','Instant Activation:')}</span>
            <span style={{ display: 'block', color: '#2dd4bf', fontSize: '16px', fontWeight: 900, marginBottom: '8px' }}>ZenOS Cloud SaaS Enterprise</span>
            <span style={{ display: 'block', color: '#64748b', fontSize: '11px', lineHeight: 1.5 }}>{tx('Aceda a relatórios avançados, gestão de filiais em tempo real e suporte prioritário.','Acceda a reportes avanzados, gestión de sucursales en tiempo real y soporte prioritario.','Access advanced reports, real-time branch management and priority support.')}</span>
          </div>

          {/* BOTÕES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => setModalPlanosAberto(true)} style={{ padding: '16px', background: 'linear-gradient(135deg, #2dd4bf, #0f766e)', border: 'none', color: '#ffffff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 15px rgba(45, 212, 191, 0.3)', transition: 'all 0.2s' }}>
              {tx('Ver Opções de Planos','Ver Opciones de Planes','View Plan Options')}
            </button>

            <button 
              onClick={solicitarDemoFirebase} 
              disabled={demoSolicitada}
              style={{ padding: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', color: demoSolicitada ? '#34d399' : '#e2e8f0', borderRadius: '12px', fontWeight: 800, cursor: demoSolicitada ? 'not-allowed' : 'pointer', fontSize: '14px', transition: 'all 0.2s' }}
            >
              {demoSolicitada ? tx('Solicitação em Análise ✓','Solicitud en Análisis ✓','Request Under Review ✓') : tx('Solicitar Extensão de Teste','Solicitar Extensión de Prueba','Request Trial Extension')}
            </button>

            <button onClick={() => signOut(auth)} style={{ background: 'transparent', color: '#f43f5e', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '13px', padding: '10px' }}>
              {tx('Sair e Voltar mais tarde','Salir y Volver más tarde','Sign Out and Return Later')}
            </button>
          </div>
        </div>

        {/* MODAL DE PLANOS RESTAURADO COM TABELA COMPLETA E PREÇOS */}
        {modalPlanosAberto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(5px)' }}>
            <div style={{ backgroundColor: '#0b1120', border: '1px solid #334155', padding: '32px', borderRadius: '24px', textAlign: 'center', color: '#fff', maxWidth: '900px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              <span style={{ fontSize: '40px' }}>💎</span>
              <h3 style={{ margin: '12px 0 8px 0', fontSize: '24px', fontWeight: 900, color: '#f8fafc' }}>{tx('Escolha o seu Plano ZenOS','Elija su Plan ZenOS','Choose Your ZenOS Plan')}</h3>
              <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
                {tx('Selecione o plano ideal para a sua operação e o ciclo de faturação.','Seleccione el plan ideal para su operación y el ciclo de facturación.','Select the ideal plan for your operation and billing cycle.')}
              </p>

              {/* SELETORES DE CICLO */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px', backgroundColor: '#020617', padding: '6px', borderRadius: '12px', width: 'fit-content', margin: '0 auto 32px auto', flexWrap: 'wrap' }}>
                <button onClick={() => setCicloPlano('mensal')} style={{ backgroundColor: cicloPlano === 'mensal' ? '#4f46e5' : 'transparent', color: cicloPlano === 'mensal' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>{tx('Mensal','Mensual','Monthly')}</button>
                <button onClick={() => setCicloPlano('semestral')} style={{ backgroundColor: cicloPlano === 'semestral' ? '#4f46e5' : 'transparent', color: cicloPlano === 'semestral' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>{tx('Semestral (-10%)','Semestral (-10%)','Semiannual (-10%)')}</button>
                <button onClick={() => setCicloPlano('anual')} style={{ backgroundColor: cicloPlano === 'anual' ? '#4f46e5' : 'transparent', color: cicloPlano === 'anual' ? '#fff' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>{tx('Anual (Desconto Máx)','Anual (Descuento Máx)','Annual (Max Discount)')}</button>
              </div>

              {/* TABELA DE PREÇOS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px', textAlign: 'left' }}>
                
                {/* Básico */}
                <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 4px 0', color: '#e2e8f0', fontSize: '18px', fontWeight: 800 }}>{tx('Básico','Básico','Basic')}</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>{tx('Para pequenos lojistas.','Para pequeños comercios.','For small retailers.')}</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '35,00' : cicloPlano === 'semestral' ? '31,50' : '28,48'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>/{tx('mês','mes','month')}</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ {tx('1 Operador','1 Operador','1 Operator')}</li>
                    <li>✓ {tx('PDV Frente de Caixa','TPV Frente de Caja','POS Checkout')}</li>
                    <li>✓ {tx('Gestão de Produtos','Gestión de Productos','Product Management')}</li>
                    <li>✓ {tx('Controlo de Fiado','Control de Crédito','Customer Credit Control')}</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Básico%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}>{tx('Assinar Básico','Contratar Básico','Subscribe Basic')}</button>
                </div>

                {/* Essencial (Mais Popular) */}
                <div style={{ backgroundColor: '#0f172a', border: '2px solid #2dd4bf', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', transform: 'scale(1.02)' }}>
                  <span style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#2dd4bf', color: '#020617', fontSize: '10px', fontWeight: 900, padding: '4px 12px', borderRadius: '12px', textTransform: 'uppercase' }}>{tx('Mais Popular','Más Popular','Most Popular')}</span>
                  <h4 style={{ margin: '0 0 4px 0', color: '#2dd4bf', fontSize: '18px', fontWeight: 800 }}>{tx('Essencial','Esencial','Essential')}</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>{tx('A operação completa.','La operación completa.','The complete operation.')}</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#2dd4bf', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '44,90' : cicloPlano === 'semestral' ? '40,41' : '33,57'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>/{tx('mês','mes','month')}</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ {tx('Múltiplos Operadores','Múltiples Operadores','Multiple Operators')}</li>
                    <li>✓ {tx('Controlo de Permissões','Control de Permisos','Permission Control')}</li>
                    <li>✓ {tx('Painel Executivo / Dashboard','Panel Ejecutivo / Dashboard','Executive Dashboard')}</li>
                    <li>✓ {tx('Gestão de Despesas','Gestión de Gastos','Expense Management')}</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Essencial%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #2dd4bf, #0d9488)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 900, boxShadow: '0 4px 15px rgba(45, 212, 191, 0.4)' }}>{tx('Assinar Essencial','Contratar Esencial','Subscribe Essential')}</button>
                </div>

                {/* Pro Avançado */}
                <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 4px 0', color: '#e2e8f0', fontSize: '18px', fontWeight: 800 }}>{tx('Pro Avançado','Pro Avanzado','Advanced Pro')}</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>{tx('Comissão e alta gestão.','Comisiones y alta gestión.','Commissions and advanced management.')}</p>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 700 }}>R$</span>
                    <span style={{ fontSize: '32px', color: '#fff', fontWeight: 900 }}>
                      {cicloPlano === 'mensal' ? '59,90' : cicloPlano === 'semestral' ? '53,91' : '43,75'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>/{tx('mês','mes','month')}</span>
                  </div>
                  <ul style={{ padding: 0, margin: '0 0 24px 0', listStyle: 'none', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <li>✓ {tx('Módulo de Comissões','Módulo de Comisiones','Commission Module')}</li>
                    <li>✓ {tx('Gestão de Mesas/Comandas','Gestión de Mesas/Comandas','Tables/Tabs Management')}</li>
                    <li>✓ {tx('Relatórios Avançados','Reportes Avanzados','Advanced Reports')}</li>
                    <li>✓ {tx('Suporte Prioritário','Soporte Prioritario','Priority Support')}</li>
                  </ul>
                  <button onClick={() => { window.open(`https://wa.me/5519995855839?text=Olá,%20quero%20assinar%20o%20plano%20Pro%20Avançado%20${cicloPlano}.`, '_blank'); }} style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}>{tx('Assinar Pro','Contratar Pro','Subscribe Pro')}</button>
                </div>
              </div>

              {/* Botões Inferiores */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => setModalPlanosAberto(false)} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', backgroundColor: '#1e293b', color: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>
                  {tx('Voltar para Bloqueio','Volver al Bloqueo','Back to License Screen')}
                </button>
                <button onClick={() => { window.open('https://wa.me/5519995855839?text=Olá,%20gostaria%20de%20saber%20sobre%20o%20plano%20Multi-Filiais.', '_blank'); }} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', backgroundColor: '#020617', border: '1px solid #334155', color: '#38bdf8', cursor: 'pointer', fontWeight: 900, fontSize: '14px' }}>
                  🏢 {tx('Consultar Plano Multi-Filiais','Consultar Plan Multi-Sucursales','Ask About Multi-Branch Plan')}
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
          editarPerfilLabel={tx('Editar nome e logo','Editar nombre y logo','Edit name and logo')}
          onHome={() => navegarPara('hub')}
          onSair={fazerLogout}
          tx={tx}
        />
        <div className="zen-content">
          <ZenTopbar
            onAbrirMobile={() => setMenuNavAberto(true)}
            status={statusSincronizacao}
            statusTitle={erroSincronizacao || statusSincronizacao}
            labelErroSincronizacao={tx('Erro ao sincronizar','Error al sincronizar','Sync error')}
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
            tx={tx}
          />

          <main className="zen-main no-print">
        
 {ecraAtual === 'hub' && (
          <div className="zen-dashboard-home">
            <ZenHero operador={operadorAtivo?.nome || tx('Administrador (Gerência)','Administrador (Gerencia)','Administrator (Management)')} patente={patenteUsuario} idioma={idioma} tx={tx} />

            <div className="zen-kpi-grid">
              <ZenKpiCard icon="🛒" titulo={tx('Vendido Hoje','Vendido Hoy','Sold Today')} valor={valoresTopoVisiveis ? fmt(faturamentoHojeBRL) : '*****'} detalhe={`${vendasHoje.length} ${tx('vendas realizadas','ventas realizadas','sales completed')}`} tone="teal" trailing={<button onClick={() => setValoresTopoVisiveis(!valoresTopoVisiveis)} style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',fontSize:18}}>{valoresTopoVisiveis ? '◉' : '○'}</button>} />
              <ZenKpiCard icon="👥" titulo={tx('FIADO NA PRAÇA','FIADO A COBRAR','PENDING CREDIT')} valor={valoresTopoVisiveis ? fmt(totalFiadoAbertoBRL) : '*****'} detalhe={totalFiadoAbertoBRL > 0 ? tx('Valores pendentes de clientes','Valores pendientes','Customer balances due') : tx('Nenhum valor pendente','Sin valores pendientes','No pending balance')} tone="purple" trailing="▥" />
              <ZenKpiCard icon="↻" titulo={tx('SINCRONIZAÇÃO','SINCRONIZACIÓN','SYNC')} valor={statusSincronizacao === 'SINCRONIZADO' ? 'Online' : statusSincronizacao === 'SALVANDO' ? tx('Salvando...','Guardando...','Saving...') : statusSincronizacao === 'ERRO' ? tx('Erro','Error','Error') : statusSincronizacao === 'OFFLINE' ? 'Offline' : tx('Pendente','Pendiente','Pending')} detalhe={tx('Dados atualizados em tempo real','Datos actualizados en tiempo real','Realtime data status')} tone="cyan" trailing="◯" />
            </div>

            <div className="zen-dashboard-middle">
              {temPermissao('pdv') && (
                <section className="zen-dashboard-card" id="zen-meu-turno">
                  <div className="zen-dashboard-card-head"><strong>💵 {tx('Meu Turno de Caixa','Mi Turno de Caja','My Cash Shift')}</strong><span className={`zen-status-badge ${sessaoAtiva ? 'open' : 'closed'}`}>{sessaoAtiva ? tx('ABERTO','ABIERTO','OPEN') : tx('FECHADO','CERRADO','CLOSED')}</span></div>
                  <div className="zen-cash-card-body">
                    <div className="zen-cash-illustration" />
                    {!sessaoAtiva ? <>
                      <p>{tx('Você pode usar o PDV e gerar Pré-Pedidos mesmo sem turno aberto. Abra o turno somente quando for receber ou movimentar a gaveta.','Puede usar el TPV y generar Pre-Pedidos incluso sin turno abierto. Abra el turno solamente cuando vaya a cobrar o mover la caja.','You can use the POS and create Pre-Orders even without an open shift. Open the shift only when receiving payment or moving cash.')}</p>
                      <button className="zen-primary-cash" onClick={() => { setTipoMovCaixa('abertura'); setModalCaixaAberto(true); }}>🔓 {tx('Abrir Turno de Caixa','Abrir Turno de Caja','Open Cash Shift')}</button>
                    </> : <>
                      <div className="zen-cash-actions">
                        <button onClick={() => { setTipoMovCaixa('suprimento'); setModalCaixaAberto(true); }}>+ {tx('Entrada (Reforço)','Entrada (Refuerzo)','Cash In (Float)')}</button>
                        <button onClick={() => { setTipoMovCaixa('sangria'); setModalCaixaAberto(true); }}>− {tx('Saída (Sangria)','Salida (Retiro)','Cash Out (Withdrawal)')}</button>
                        <button onClick={() => { setTipoMovCaixa('fechamento'); setModalCaixaAberto(true); }}>🔒 {tx('Encerrar Turno','Cerrar Turno','Close Shift')}</button>
                      </div>
                      <div className="zen-movements">{movsSessao.length === 0 ? <div className="zen-movement"><span>{tx('Nenhuma movimentação neste turno.','Ningún movimiento en este turno.','No movements in this shift.')}</span></div> : movsSessao.slice(0,6).map(m => <div className="zen-movement" key={m.id}><span>{m.tipo === 'suprimento' ? tx('Entrada','Entrada','Cash In') : tx('Saída','Salida','Cash Out')} • {m.descricao}</span><strong>{m.tipo === 'suprimento' ? '+' : '-'}{fmt(m.valorBRL,'BRL')}</strong></div>)}</div>
                    </>}
                  </div>
                </section>
              )}

              {temPermissao('inteligencia') ? <section className="zen-dashboard-card">
                <button className="zen-exec-toggle" onClick={() => setMostrarPainelExecutivo(!mostrarPainelExecutivo)}><span>👁️ {tx('Painel Executivo e Financeiro','Panel Ejecutivo y Financiero','Executive & Financial Dashboard')}</span><span>{mostrarPainelExecutivo ? '⌃' : '›'}</span></button>
                {mostrarPainelExecutivo && <div className="zen-exec-body">
                  <div className="zen-exec-grid">
                    <div className="zen-exec-stat"><span>{tx('Faturamento Real','Facturación Real','Actual Revenue')}</span><strong>{fmt(faturamentoTotalBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>CMV</span><strong>{fmt(cmvTotalBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>{tx('Lucro Bruto','Ganancia Bruta','Gross Profit')}</span><strong style={{color:'#38bdf8'}}>{fmt(lucroBrutoBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>{tx('Despesas Pagas','Gastos Pagados','Paid Expenses')}</span><strong style={{color:'#fbbf24'}}>{fmt(despesasPagasBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>{tx('Lucro Líquido','Ganancia Neta','Net Profit')}</span><strong style={{color:'#34d399'}}>{fmt(lucroLiquidoRealBRL)}</strong></div>
                    <div className="zen-exec-stat"><span>{tx('Fiado na Praça','Crédito Pendiente','Outstanding Credit')}</span><strong style={{color:'#fb7185'}}>{fmt(totalFiadoAbertoBRL)}</strong></div>
                  </div>
                  <div className="zen-abc-list">{curvaABC.slice(0,5).map((item,index)=><div className="zen-abc-row" key={`${item.sku}-${index}`}><b>{index+1}</b><span>{item.nome}</span><strong>{fmt(item.faturamentoBRL,'BRL')}</strong></div>)}</div>
                </div>}
              </section> : <div className="zen-dashboard-card"><div className="zen-dashboard-card-head"><strong>ZenOS • {tx('Operação do Dia','Operación del Día','Daily Operations')}</strong></div><div className="zen-cash-card-body"><p>{tx('Acessos operacionais organizados conforme as permissões deste operador.','Accesos operativos organizados según los permisos de este operador.','Operational access organized according to this operator’s permissions.')}</p></div></div>}
            </div>

            <section className="zen-quick-section">
              <div className="zen-quick-title"><span>⚡</span><strong>{tx('Acessos Rápidos','Accesos Rápidos','Quick Access')}</strong><small>{tx('Principais operações do dia a dia — todos os demais módulos permanecem nas gavetas laterais.','Principales operaciones del día a día — los demás módulos permanecen en el menú lateral.','Main daily operations — all other modules remain in the side menu.')}</small></div>
              <div className="zen-quick-grid">
                {temPermissao('pdv') && <ZenQuickCard icon="🛒" titulo={tx('PDV Balcão','TPV Mostrador','POS Counter')} detalhe={tx('Vendas e Pré-Pedidos','Ventas y Pre-Pedidos','Sales & Pre-Orders')} tone="teal" onClick={()=>navegarPara('pdv')} />}
                {temPermissao('produtos') && <ZenQuickCard icon="📥" titulo={tx('PDV Compras','TPV Compras','Purchase Entry')} detalhe={tx('Entrada rápida de estoque','Entrada rápida de stock','Quick stock entry')} tone="orange" onClick={()=>navegarPara('compras')} />}
                {temPermissao('produtos') && <ZenQuickCard icon="📦" titulo={tx('Produtos & Estoque','Productos y Stock','Products & Stock')} detalhe={tx('Cadastrar e gerenciar','Registrar y gestionar','Register and manage')} tone="purple" onClick={()=>navegarPara('produtos')} />}
                {temPermissao('clientes') && <ZenQuickCard icon="👥" titulo={tx('Clientes & Fiado','Clientes y Crédito','Customers & Credit')} detalhe={tx('Consultar e gerenciar','Consultar y gestionar','View and manage')} tone="blue" onClick={()=>navegarPara('clientes')} />}
                {temPermissao('vendas') && <ZenQuickCard icon="📑" titulo={tx('Histórico','Historial','History')} detalhe={tx('Vendas e Devoluções','Ventas y Devoluciones','Sales & Returns')} tone="pink" onClick={()=>navegarPara('vendas')} />}
                {temPermissao('vendas') && <ZenQuickCard icon="🧾" titulo={tx('Fiscal','Fiscal','Fiscal')} detalhe={`${resultadoFilaFiscal.fila.length} ${tx('pendência(s)','pendiente(s)','pending')}`} tone="blue" onClick={()=>navegarPara('fiscal')} />}
                {temPermissao('admin') && <ZenQuickCard icon="🤝" titulo={tx('Comissões','Comisiones','Commissions')} detalhe={tx('Metas e bonificações','Metas y bonificaciones','Targets and bonuses')} tone="orange" onClick={()=>navegarPara('comissoes')} />}
                {temPermissao('despesas') && <ZenQuickCard icon="💸" titulo={tx('Despesas','Gastos','Expenses')} detalhe={tx('Contas a pagar','Cuentas a pagar','Accounts payable')} tone="gold" onClick={()=>navegarPara('despesas')} />}
                {temPermissao('admin') && <ZenQuickCard icon="⚙️" titulo={tx('Configurações','Configuraciones','Settings')} detalhe={tx('Sistema, equipe e backup','Sistema, equipo y respaldo','System, team and backup')} tone="purple" onClick={()=>navegarPara('configuracoes')} />}
              </div>
            </section>
          </div>
 )}

        {ecraAtual === 'pdv' && <PDV perfilLoja={perfilLoja} taxasCambio={taxasCambio} registrarFinanceiro={registrarFinanceiro} commitOperacaoCritica={commitOperacaoCritica} commitVendaCritica={commitVendaCritica} recarregarDadosPDV={recarregarDadosPDV} vouchers={vouchers} setVouchers={setVouchers} userId={userId} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} patenteUsuario={patenteUsuario} idioma={idioma} regrasDesconto={regrasDesconto} vendedores={vendedores} operadorAtivo={operadorAtivo} sessaoAtiva={sessaoAtiva} />}
        {ecraAtual === 'compras' && <PDVCompras commitOperacaoNegocio={commitVendaCritica} registrarFinanceiro={registrarFinanceiro} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} userId={userId} produtos={produtos} setProdutos={setProdutos} fornecedores={fornecedores} setFornecedores={setFornecedores} despesas={despesas} setDespesas={setDespesas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} historicoCompras={historicoCompras} setHistoricoCompras={setHistoricoCompras} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'fornecedores' && <Fornecedores commitOperacaoNegocio={commitVendaCritica} fornecedores={fornecedores} setFornecedores={setFornecedores} moeda={moeda} tx={tx} />}
        {ecraAtual === 'mesas' && <Mesas commitOperacaoNegocio={commitVendaCritica} userId={userId} produtos={produtos} fmt={fmt} tx={tx} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} moeda={moeda} idioma={idioma} operadorAtivo={operadorAtivo} />}
        {ecraAtual === 'produtos' && <Produtos commitOperacaoNegocio={commitVendaCritica} historicoVendas={historicoVendas} historicoCompras={historicoCompras} patenteUsuario={patenteUsuario} regrasDesconto={regrasDesconto} vendedores={vendedores} userId={userId} operadorAtivo={operadorAtivo} planoLoja={planoLoja} produtos={produtos} setProdutos={setProdutos} fornecedoresGlobais={fornecedores} moeda={moeda} fmt={fmt} t={t} tx={tx} />}
        {ecraAtual === 'inteligencia' && <EstoqueInteligente produtos={produtos} fmt={fmt} tx={tx} />}
        {ecraAtual === 'comissoes' && <Comissoes commitOperacaoNegocio={commitVendaCritica} historicoVendas={historicoVisivelParaOperador} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} operadorAtivo={operadorAtivo} regrasDesconto={regrasDesconto} regrasComissao={regrasComissao} setRegrasComissao={setRegrasComissao} />}
        {ecraAtual === 'dashboardMobile' && <DashboardMobile historicoVendas={historicoVendas} despesas={despesas} clientes={clientes} produtos={produtos} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} regrasDesconto={regrasDesconto} />}
        {ecraAtual === 'clientes' && (livroFinanceiroConfirmado && livroFinanceiroAtivadoParaLoja === String(userId) ? <Clientes perfilLoja={perfilLoja} commitOperacaoNegocio={commitVendaCritica} livroFinanceiro={livroFinanceiro} historicoVendas={historicoVendas} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} operadorAtivo={operadorAtivo} clientes={clientes} setClientes={setClientes} moeda={moeda} fmt={fmt} t={t} tx={tx} converterDeBRL={converterDeBRL} converterParaBRL={converterParaBRL} /> : <div role="status" style={{padding:24,color:'#cbd5e1'}}>Conferindo histórico financeiro completo no servidor antes de liberar contas e fiado…</div>)}
        {ecraAtual === 'vendas' && <Vendas commitOperacaoNegocio={commitVendaCritica} taxasCambio={taxasCambio} sessoesCaixa={sessoesCaixa} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} perfilLoja={perfilLoja} vouchers={vouchers} setVouchers={setVouchers} userId={userId} operadorAtivo={operadorAtivo} historicoVendas={historicoVisivelParaOperador} historicoVendasCompleto={historicoVendas} setHistoricoVendas={setHistoricoVendas} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} fmt={fmt} t={t} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterDeBRL={converterDeBRL} />}
        {ecraAtual === 'commerce-solicitar' && temPermissao('admin') && <React.Suspense fallback={<div role="status" style={{padding:20,color:'#bdd5df'}}>{tx('Preparando Minha Loja Online…','Preparando Mi Tienda Online…','Preparing My Online Store…')}</div>}><CommerceSolicitacao key={String(userId)+':'+String(operadorAtivo?.id)} lojaId={userId} tx={tx}/></React.Suspense>}
        {ecraAtual === 'fiscal' && <FiscalErrorBoundary resetKey={`${userId || ''}:${perfilLoja?.pais || ''}:${resultadoFilaFiscal.erro || ''}`} onVoltar={() => navegarPara('hub')} tx={tx}><Fiscal lojaId={userId} perfilLoja={perfilLoja} filaFiscal={resultadoFilaFiscal.fila} erroFila={resultadoFilaFiscal.erro} clientes={clientes} ambiente="homologacao" onVerVenda={() => navegarPara('vendas')} tx={tx} idioma={idioma} /></FiscalErrorBoundary>}
        {ecraAtual === 'migracao' && <Migracao commitOperacaoNegocio={commitVendaCritica} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} t={t} tx={tx} />}
        {ecraAtual === 'configuracoes' && <Configuracoes commitOperacaoNegocio={commitVendaCritica} userId={userId} operadorAtivo={operadorAtivo} perfilLojaGlobal={perfilLoja} setPerfilLojaGlobal={setPerfilLoja} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes} historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} despesas={despesas} setDespesas={setDespesas} moeda={moeda} fmt={fmt} tx={tx} regrasDesconto={regrasDesconto} setRegrasDesconto={setRegrasDesconto} vendedores={vendedores} setVendedores={(novosVendedores) => { setVendedores(novosVendedores); persistirCampoSeguro({ field: 'vendedores', value:novosVendedores, setter:setVendedores, localStorageKey:`zenos_${userId}_vendedores` }); }} />}
        {ecraAtual === 'auditoria_caixas' && (livroFinanceiroConfirmado && livroFinanceiroAtivadoParaLoja === String(userId) ? <GestaoCaixas sessoesCaixa={sessoesCaixa} historicoVendas={historicoVendas} caixaMovimentos={caixaMovimentos} livroFinanceiro={livroFinanceiro} fmt={fmt} tx={tx} /> : <div role="status" style={{padding:24,color:'#cbd5e1'}}>Conferindo o Livro Financeiro no servidor para a auditoria de caixas…</div>)}
        {ecraAtual === 'despesas' && <Despesas userId={userId} commitOperacaoNegocio={commitVendaCritica} registrarFinanceiro={registrarFinanceiro} caixaMovimentos={caixaMovimentos} setCaixaMovimentos={setCaixaMovimentos} sessaoAtiva={sessaoAtiva} saldoSessaoFisicoBRL={saldoSessaoFisicoBRL} operadorAtivo={operadorAtivo} despesas={despesas} setDespesas={setDespesas} fmt={fmt} tx={tx} patenteUsuario={patenteUsuario} moeda={moeda} converterParaBRL={converterParaBRL} converterDeBRL={converterDeBRL} />}
      </main>

      {modalCambioAberto && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #6366f1', borderRadius: '24px', width: '90%', maxWidth: '420px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#818cf8', letterSpacing: '1px', textTransform: 'uppercase' }}>ZenOS</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{t('cotacoesDia')}</h3></div>
              <button onClick={() => setModalCambioAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>{tx('1 Dólar (USD) =','1 Dólar (USD) =','1 Dollar (USD) =')}</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#64748b', fontSize: '12px' }}>R$</span><input type="text" value={taxasInput.USD} onChange={(e) => setTaxasInput({ ...taxasInput, USD: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>{tx('1 Euro (EUR) =','1 Euro (EUR) =','1 Euro (EUR) =')}</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#64748b', fontSize: '12px' }}>R$</span><input type="text" value={taxasInput.EUR} onChange={(e) => setTaxasInput({ ...taxasInput, EUR: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b' }}><span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>{tx('1 Real (BRL) =','1 Real (BRL) =','1 Real (BRL) =')}</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="text" value={taxasInput.PYG} onChange={(e) => setTaxasInput({ ...taxasInput, PYG: e.target.value })} onFocus={e=>e.target.select()} style={{ backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '15px', textAlign: 'right', width: '90px', padding: '6px', outline: 'none' }} /><span style={{ color: '#64748b', fontSize: '12px' }}>₲</span></div></div>
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
                    <div style={{fontSize:'10px',fontWeight:900,letterSpacing:'1px',color:'#64748b',marginBottom:'5px'}}>{tx('TOTAL FÍSICO INFORMADO • CONVERTIDO PARA BRL','TOTAL FÍSICO INFORMADO • CONVERTIDO A BRL','PHYSICAL TOTAL ENTERED • CONVERTED TO BRL')}</div>
                    <div style={{fontSize:'20px',fontWeight:950,color:'#f8fafc'}}>{Number.isFinite(calcularTotalMovBRL()) ? fmt(calcularTotalMovBRL(), 'BRL') : tx('Corrija os valores digitados', 'Corrija los importes', 'Correct the entered amounts')}</div>
                    <div style={{fontSize:'10px',color:'#64748b',marginTop:'5px'}}>{tx('O saldo esperado pelo ZenOS permanece oculto até a auditoria ser concluída.','El saldo esperado por ZenOS permanece oculto hasta finalizar la auditoría.','The balance expected by ZenOS remains hidden until the audit is completed.')}</div>
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
    
      <AssistenteZen
        operadorAtivo={operadorAtivo}
        patenteUsuario={patenteUsuario}
        temPermissao={temPermissao}
        produtos={produtos}
        historicoVendas={historicoVendas}
        clientes={clientes}
        despesas={despesas}
        fornecedores={fornecedores}
        navegarPara={navegarPara}
        ecraAtual={ecraAtual}
        fmt={fmt}
        tx={tx}
        moeda={moeda}
      />

      <ZenModal aberto={!!modalAppZen} variante={modalAppZen?.variante} titulo={modalAppZen?.titulo} mensagem={modalAppZen?.mensagem} detalhes={modalAppZen?.detalhes} confirmarTexto={modalAppZen?.confirmarTexto || 'OK'} cancelarTexto={modalAppZen?.cancelarTexto || 'Cancelar'} apenasConfirmar={!!modalAppZen?.apenasConfirmar} onConfirmar={()=>{ const resolver=modalAppZen?.resolver; setModalAppZen(null); if(resolver) resolver(true); }} onCancelar={()=>{ const resolver=modalAppZen?.resolver; setModalAppZen(null); if(resolver) resolver(false); }} />

      {modalPerfilRapido && <div style={{position:'fixed',inset:0,zIndex:21000,background:'rgba(2,6,23,.88)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{width:'100%',maxWidth:460,background:'#0b1120',border:'1px solid #38bdf8',borderRadius:22,padding:22,color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>{perfilRapidoRascunho.logoLoja?<img src={perfilRapidoRascunho.logoLoja} style={{width:56,height:56,borderRadius:12,objectFit:'cover'}}/>:<img src="/logo-zenos.png?v=4" style={{width:56,height:56,objectFit:'contain'}}/>}<div><div style={{fontSize:11,color:'#38bdf8',fontWeight:900}}>{tx('IDENTIDADE RÁPIDA','IDENTIDAD RÁPIDA','QUICK IDENTITY')}</div><div style={{fontSize:18,fontWeight:900}}>{tx('Nome e logo da loja','Nombre y logo de la tienda','Store name and logo')}</div></div></div>
        <label style={{fontSize:11,color:'#94a3b8',fontWeight:900}}>{tx('NOME FANTASIA','NOMBRE COMERCIAL','DISPLAY NAME')}</label><input value={perfilRapidoRascunho.nomeFantasia||''} onChange={e=>setPerfilRapidoRascunho({...perfilRapidoRascunho,nomeFantasia:e.target.value})} style={{width:'100%',boxSizing:'border-box',margin:'6px 0 14px',padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff'}}/>
        <label style={{fontSize:11,color:'#94a3b8',fontWeight:900}}>{tx('LOGO DA LOJA (máx. 300 KB)','LOGO DE LA TIENDA (máx. 300 KB)','STORE LOGO (max. 300 KB)')}</label><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; if(f.size>300*1024){setPerfilRapidoErro('A logo deve ter no máximo 300 KB.');return;} setPerfilRapidoErro(''); const r=new FileReader();r.onload=()=>setPerfilRapidoRascunho(x=>({...x,logoLoja:r.result}));r.readAsDataURL(f);}} style={{width:'100%',margin:'8px 0 18px'}}/>
        {perfilRapidoErro && <div style={{margin:'-8px 0 14px',padding:'9px 10px',borderRadius:8,border:'1px solid #f43f5e',background:'#2e0a16',color:'#fda4af',fontSize:11,fontWeight:800}}>{perfilRapidoErro}</div>}
        <div style={{display:'flex',gap:10}}><button onClick={()=>setModalPerfilRapido(false)} style={{flex:1,padding:11,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1',fontWeight:900}}>{tx('Cancelar','Cancelar','Cancel')}</button><button onClick={salvarPerfilRapido} style={{flex:1,padding:11,borderRadius:10,border:'none',background:'#0284c7',color:'#fff',fontWeight:900}}>{tx('Salvar','Guardar','Save')}</button></div>
      </div></div>}
        </div>
      </div>
    </div>
  );
}
