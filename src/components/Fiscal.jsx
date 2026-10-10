import React, { useMemo, useState } from 'react';
import { TIPOS_FISCAIS } from '../core/fiscalCore';
import { TIPOS_FISCAIS_LABEL, prepararPreviaFiscal } from '../core/fiscalUi';
import { chaveDiaLocal } from '../core/dates';
import './Fiscal.css';

const STATUS = [
  ['todos', 'Todos'],
  ['pendente', 'Pendentes'],
  ['rascunho', 'Rascunhos'],
  ['autorizado', 'Autorizados'],
  ['rejeitado', 'Rejeitados'],
  ['cancelado', 'Cancelados'],
];

const STATUS_LABEL = Object.fromEntries(STATUS);
const PENDENCIAS_LABEL = {
  'emitente.razaoSocial': 'Razão social do emitente não informada',
  'emitente.documento1': 'Documento do emitente não informado',
  'emitente.endereco': 'Endereço do emitente não informado',
  'emitente.cidade': 'Cidade do emitente não informada',
  'destinatario.revisar': 'Destinatário precisa de revisão',
  'classificacao_fiscal.revisar': 'Classificação fiscal precisa de revisão',
  'endereco_estruturado.revisar': 'Endereço estruturado não informado',
  'integracao.nao_configurada': 'Integração governamental não configurada',
};

const texto = value => String(value ?? '').trim() || 'Não informado';
const formatarData = value => {
  const data = new Date(value);
  return Number.isFinite(data.getTime()) ? data.toLocaleString('pt-BR') : 'Não informada';
};
const formatarValor = (value, moeda) => {
  if (!Number.isFinite(Number(value)) || !moeda) return 'Não informado';
  try {
    return new Intl.NumberFormat('pt-BR', { style:'currency', currency:moeda }).format(Number(value));
  } catch {
    return `${moeda} ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  }
};
function Campo({ rotulo, valor, destaque = false }) {
  return <div className={`fiscal-campo ${destaque ? 'destaque' : ''}`}><span>{rotulo}</span><strong>{texto(valor)}</strong></div>;
}

export default function Fiscal({
  lojaId,
  perfilLoja,
  filaFiscal = [],
  erroFila = null,
  clientes = [],
  ambiente = 'homologacao',
  onVerVenda,
}) {
  const [status, setStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [selecionada, setSelecionada] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erroPrevia, setErroPrevia] = useState('');
  const pais = perfilLoja?.pais;
  const tipos = TIPOS_FISCAIS[pais] || [];

  const contadores = useMemo(() => {
    const base = { pendente:0, rascunho:0, autorizado:0, rejeitado:0, cancelado:0 };
    filaFiscal.forEach(item => {
      if (Object.hasOwn(base, item.statusFiscal)) base[item.statusFiscal] += 1;
    });
    return base;
  }, [filaFiscal]);

  const filtrada = useMemo(() => {
    const termo = busca.toLocaleLowerCase('pt-BR').trim();
    return filaFiscal.filter(item => {
      if (status !== 'todos' && item.statusFiscal !== status) return false;
      if (termo && !`${item.vendaId} ${item.clienteNome || ''}`.toLocaleLowerCase('pt-BR').includes(termo)) return false;
      const dia = chaveDiaLocal(item.createdAt) || '';
      if (dataInicial && (!dia || dia < dataInicial)) return false;
      if (dataFinal && (!dia || dia > dataFinal)) return false;
      return true;
    });
  }, [busca, dataFinal, dataInicial, filaFiscal, status]);

  const abrirPrevia = item => {
    const tipoInicial = tipos[0] || '';
    setSelecionada(item);
    setTipoDocumento(tipoInicial);
    setPrevia(null);
    setErroPrevia('');
    if (!item.venda || !tipoInicial) return;
    try {
      setPrevia(prepararPreviaFiscal({
        lojaId,
        perfilLoja,
        venda:item.venda,
        clientes,
        tipoDocumento:tipoInicial,
        ambiente,
      }));
    } catch (error) {
      setErroPrevia(`${error?.code ? `${error.code}: ` : ''}${error?.message || 'Não foi possível preparar a prévia fiscal.'}`);
    }
  };

  const alterarTipo = novoTipo => {
    setTipoDocumento(novoTipo);
    setErroPrevia('');
    try {
      setPrevia(prepararPreviaFiscal({
        lojaId,
        perfilLoja,
        venda:selecionada.venda,
        clientes,
        tipoDocumento:novoTipo,
        ambiente,
      }));
    } catch (error) {
      setPrevia(null);
      setErroPrevia(`${error?.code ? `${error.code}: ` : ''}${error?.message || 'Não foi possível preparar a prévia fiscal.'}`);
    }
  };

  const snapshot = previa?.snapshot;
  const pendencias = previa?.cadastro?.pendencias || [];

  return <section className="fiscal-page" data-fiscal-mobile-safe="true">
    <header className="fiscal-header">
      <div><span className="fiscal-eyebrow">ZENOS FISCAL</span><h1>Operação fiscal</h1><p>Consulta e preparação visual de documentos, sem alterar a venda comercial.</p></div>
      <div className="fiscal-contexto">
        <Campo rotulo="País fiscal" valor={pais === 'BR' ? 'Brasil (BR)' : pais === 'PY' ? 'Paraguai (PY)' : 'Não configurado'} />
        <Campo rotulo="Moeda comercial" valor={perfilLoja?.moedaComercial || perfilLoja?.moeda || filaFiscal.find(item => item.moedaComercial)?.moedaComercial || 'Não informada'} />
        <Campo rotulo="Ambiente visual" valor={ambiente === 'producao' ? 'Produção' : 'Homologação'} />
      </div>
    </header>

    <div className="fiscal-aviso" role="status"><span>ⓘ</span><div><strong>Integração governamental ainda não configurada.</strong><p>A fila e as prévias são somente leitura. Nenhum documento será transmitido ou persistido nesta fase.</p></div></div>
    {erroFila && <div className="fiscal-erro" role="alert"><strong>Não foi possível montar a fila fiscal.</strong><span>{erroFila}</span></div>}

    <div className="fiscal-kpis">
      {STATUS.slice(1).map(([chave, rotulo]) => <button type="button" key={chave} className={`fiscal-kpi ${status === chave ? 'ativo' : ''}`} onClick={() => setStatus(chave)}>
        <span>{rotulo}</span><strong>{contadores[chave]}</strong><small>{chave === 'pendente' ? 'vendas elegíveis' : 'sem persistência nesta fase'}</small>
      </button>)}
    </div>

    <div className="fiscal-toolbar">
      <div className="fiscal-status-tabs">{STATUS.map(([chave, rotulo]) => <button type="button" key={chave} className={status === chave ? 'ativo' : ''} onClick={() => setStatus(chave)}>{rotulo}</button>)}</div>
      <div className="fiscal-filtros">
        <label><span>Buscar venda ou cliente</span><input value={busca} onChange={event => setBusca(event.target.value)} placeholder="ID ou nome" /></label>
        <label><span>De</span><input type="date" value={dataInicial} onChange={event => setDataInicial(event.target.value)} /></label>
        <label><span>Até</span><input type="date" value={dataFinal} onChange={event => setDataFinal(event.target.value)} /></label>
      </div>
    </div>

    <div className="fiscal-fila">
      <div className="fiscal-fila-head"><div><span>FILA DE PENDÊNCIAS</span><strong>{filtrada.length} registro(s)</strong></div><small>Derivada das vendas existentes por listarPendenciasFiscais(...)</small></div>
      {filtrada.length === 0 ? <div className="fiscal-vazio"><strong>Nenhuma venda encontrada.</strong><span>Os filtros atuais não possuem registros fiscais disponíveis.</span></div> :
        <div className="fiscal-lista">
          {filtrada.map(item => <article className="fiscal-linha" key={item.vendaId}>
            <div className="fiscal-venda-id"><span>Venda</span><strong>{item.vendaId}</strong><small>{formatarData(item.createdAt)}</small></div>
            <div><span>Cliente</span><strong>{texto(item.clienteNome)}</strong></div>
            <div><span>País</span><strong>{pais || 'Revisar'}</strong></div>
            <div><span>Total comercial original</span><strong>{item.totalComercialOriginal == null || !item.moedaComercial ? 'Revisão necessária' : formatarValor(item.totalComercialOriginal, item.moedaComercial)}</strong><small>{item.moedaComercial || 'Moeda não informada'}</small></div>
            <div><span>Referência gerencial BRL</span><strong>{formatarValor(item.totalBRL, 'BRL')}</strong><small>Não é total fiscal convertido</small></div>
            <div className="fiscal-situacao"><span>Status fiscal</span><b className={`status-${item.statusFiscal}`}>{STATUS_LABEL[item.statusFiscal] || item.statusFiscal}</b>{item.exigeRevisao && <small>Revisão necessária</small>}</div>
            <div className="fiscal-acoes">
              <button type="button" onClick={() => onVerVenda?.(item.vendaId)}>Ver venda</button>
              <button type="button" className="primario" onClick={() => abrirPrevia(item)}>Ver prévia fiscal</button>
              <button type="button" onClick={() => abrirPrevia(item)}>Revisar dados</button>
            </div>
          </article>)}
        </div>}
    </div>

    {selecionada && <div className="fiscal-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelecionada(null); }}>
      <div className="fiscal-modal" role="dialog" aria-modal="true" aria-labelledby="fiscal-previa-titulo">
        <div className="fiscal-modal-head"><div><span>PRÉVIA NÃO PERSISTIDA</span><h2 id="fiscal-previa-titulo">Documento fiscal da venda {selecionada.vendaId}</h2></div><button type="button" onClick={() => setSelecionada(null)} aria-label="Fechar prévia">×</button></div>
        <div className="fiscal-modal-body">
          <div className="fiscal-tipo-row">
            <label><span>Tipo de documento compatível com {pais || 'a loja'}</span><select value={tipoDocumento} onChange={event => alterarTipo(event.target.value)} disabled={tipos.length === 0}>{tipos.length === 0 ? <option value="">País fiscal inválido</option> : tipos.map(tipo => <option value={tipo} key={tipo}>{TIPOS_FISCAIS_LABEL[tipo] || tipo}</option>)}</select></label>
            <div><span>Adapter</span><strong>{previa?.adapter || 'Indisponível'}</strong></div>
          </div>
          {erroPrevia && <div className="fiscal-erro" role="alert">{erroPrevia}</div>}
          {snapshot && <>
            <div className="fiscal-preview-grid">
              <section><h3>Dados da venda</h3><Campo rotulo="ID" valor={snapshot.vendaId} /><Campo rotulo="Data" valor={formatarData(selecionada.createdAt)} /><Campo rotulo="Cliente" valor={selecionada.clienteNome} /><Campo rotulo="Situação comercial" valor={snapshot.metadata.estadoComercialNaCriacao} /></section>
              <section><h3>Emitente</h3><Campo rotulo="Nome / razão social" valor={snapshot.dadosEmitenteSnapshot.razaoSocial || snapshot.dadosEmitenteSnapshot.nomeFantasia} /><Campo rotulo="Documento" valor={snapshot.dadosEmitenteSnapshot.documento1} /><Campo rotulo="Endereço" valor={snapshot.dadosEmitenteSnapshot.endereco} /><Campo rotulo="Cidade / país" valor={`${texto(snapshot.dadosEmitenteSnapshot.cidade)} / ${texto(snapshot.dadosEmitenteSnapshot.pais)}`} /></section>
              <section><h3>Destinatário</h3><Campo rotulo="Cliente" valor={snapshot.dadosDestinatarioSnapshot.nome} /><Campo rotulo="Documento" valor={snapshot.dadosDestinatarioSnapshot.documento} /><Campo rotulo="Endereço" valor={snapshot.dadosDestinatarioSnapshot.endereco} /><Campo rotulo="Cidade / país" valor={`${texto(snapshot.dadosDestinatarioSnapshot.cidade)} / ${texto(snapshot.dadosDestinatarioSnapshot.pais)}`} /></section>
            </div>

            <section className="fiscal-preview-section"><h3>Itens</h3><div className="fiscal-preview-list">
              {snapshot.itensSnapshot.map((item, index) => <article key={item.id || index}>
                <div><span>Descrição</span><strong>{item.descricao || item.nome || 'Não informado'}</strong></div>
                <div><span>Quantidade / unidade</span><strong>{texto(item.qtd)} / {texto(item.unidadeMedida)}</strong></div>
                <div><span>Preço comercial original</span><strong>{item.valoresOriginaisSnapshot ? formatarValor(item.valoresOriginaisSnapshot.precoUnitario, item.valoresOriginaisSnapshot.moeda) : 'Revisar'}</strong></div>
                <div><span>Referência BRL</span><strong>{formatarValor(item.precoPraticadoBRL, 'BRL')}</strong></div>
                <div><span>Classificação fiscal</span><strong>{item.ncm && item.ncm !== 'REVISAR' ? item.ncm : 'Revisar'}</strong></div>
              </article>)}
            </div></section>

            <section className="fiscal-preview-section"><h3>Pagamentos</h3><div className="fiscal-preview-list">
              {snapshot.pagamentosSnapshot.length === 0 ? <div className="fiscal-vazio">Não informado</div> : snapshot.pagamentosSnapshot.map((pagamento, index) => <article key={pagamento.id || index}>
                <div><span>Forma</span><strong>{pagamento.rotulo || pagamento.formaId || 'Não informada'}</strong></div>
                <div><span>Moeda de origem</span><strong>{texto(pagamento.moedaOrigem)}</strong></div>
                <div><span>Valor original</span><strong>{formatarValor(pagamento.valorOriginal, pagamento.moedaOrigem)}</strong></div>
                <div><span>Valor convertido BRL</span><strong>{formatarValor(pagamento.valorConvertidoBRL, 'BRL')}</strong></div>
              </article>)}
            </div></section>

            <div className="fiscal-totais">
              <div><span>TOTAL COMERCIAL ORIGINAL</span><strong>{snapshot.totaisOriginaisSnapshot && snapshot.moedaComercial ? formatarValor(snapshot.totaisOriginaisSnapshot.total, snapshot.moedaComercial) : 'Revisão necessária'}</strong><small>{snapshot.moedaComercial || 'Moeda original não informada'}</small></div>
              <div><span>REFERÊNCIA GERENCIAL BRL</span><strong>{formatarValor(snapshot.valoresGerenciaisSnapshot.totalBRL, 'BRL')}</strong><small>Separada do total fiscal original</small></div>
            </div>

            <section className="fiscal-pendencias"><h3>Pendências para emissão</h3>{pendencias.map(item => <div key={item}><span>!</span><strong>{PENDENCIAS_LABEL[item] || item}</strong></div>)}</section>
            <section className="fiscal-impacto"><h3>Impacto fiscal</h3><div><Campo rotulo="Custo fiscal" valor="Não calculado" /><Campo rotulo="Carga fiscal percentual" valor="Aguardando configuração" /></div></section>
          </>}
        </div>
        <div className="fiscal-modal-actions">
          <button type="button" onClick={() => onVerVenda?.(selecionada.vendaId)}>Ver venda</button>
          <button type="button" onClick={() => setErroPrevia('Revise os campos marcados como não informados antes de uma futura emissão.')}>Revisar dados</button>
          <button type="button" disabled title="Backend fiscal seguro ainda não configurado.">Criar rascunho</button>
          <button type="button" disabled>Emitir</button><button type="button" disabled>Consultar</button><button type="button" disabled>Corrigir</button><button type="button" disabled>Cancelar</button>
          <p>Backend fiscal seguro ainda não configurado.</p>
        </div>
      </div>
    </div>}
  </section>;
}
