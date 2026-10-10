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
  tx = (pt) => pt,
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
      <div><span className="fiscal-eyebrow">ZENOS FISCAL</span><h1>{tx('Operação fiscal','Operación fiscal','Fiscal operation')}</h1><p>{tx('Consulta e preparação visual de documentos, sem alterar a venda comercial.','Consulta y preparación visual de documentos, sin alterar la venta comercial.','View and visually prepare documents without changing the commercial sale.')}</p></div>
      <div className="fiscal-contexto">
        <Campo rotulo="País fiscal" valor={pais === 'BR' ? 'Brasil (BR)' : pais === 'PY' ? 'Paraguai (PY)' : 'Não configurado'} />
        <Campo rotulo="Moeda comercial" valor={perfilLoja?.moedaComercial || perfilLoja?.moeda || filaFiscal.find(item => item.moedaComercial)?.moedaComercial || 'Não informada'} />
        <Campo rotulo="Ambiente visual" valor={ambiente === 'producao' ? 'Produção' : 'Homologação'} />
      </div>
    </header>

    <div className="fiscal-aviso" role="status"><span>ⓘ</span><div><strong>{tx('Integração governamental ainda não configurada.','Integración gubernamental aún no configurada.','Government integration is not configured yet.')}</strong><p>{tx('A fila e as prévias são somente leitura. Nenhum documento será transmitido ou persistido nesta fase.','La cola y las vistas previas son de solo lectura. Ningún documento será transmitido ni persistido en esta fase.','The queue and previews are read-only. No document will be transmitted or persisted in this phase.')}</p></div></div>
    {erroFila && <div className="fiscal-erro" role="alert"><strong>{tx('Não foi possível montar a fila fiscal.','No fue posible montar la cola fiscal.','Could not build the fiscal queue.')}</strong><span>{erroFila}</span></div>}

    <div className="fiscal-kpis">
      {STATUS.slice(1).map(([chave, rotulo]) => <button type="button" key={chave} className={`fiscal-kpi ${status === chave ? 'ativo' : ''}`} onClick={() => setStatus(chave)}>
        <span>{rotulo}</span><strong>{contadores[chave]}</strong><small>{chave === 'pendente' ? 'vendas elegíveis' : 'sem persistência nesta fase'}</small>
      </button>)}
    </div>

    <div className="fiscal-toolbar">
      <div className="fiscal-status-tabs">{STATUS.map(([chave, rotulo]) => <button type="button" key={chave} className={status === chave ? 'ativo' : ''} onClick={() => setStatus(chave)}>{rotulo}</button>)}</div>
      <div className="fiscal-filtros">
        <label><span>{tx('Buscar venda ou cliente','Buscar venta o cliente','Search sale or customer')}</span><input value={busca} onChange={event => setBusca(event.target.value)} placeholder={tx('ID ou nome','ID o nombre','ID or name')} /></label>
        <label><span>{tx('De','Desde','From')}</span><input type="date" value={dataInicial} onChange={event => setDataInicial(event.target.value)} /></label>
        <label><span>{tx('Até','Hasta','To')}</span><input type="date" value={dataFinal} onChange={event => setDataFinal(event.target.value)} /></label>
      </div>
    </div>

    <div className="fiscal-fila">
      <div className="fiscal-fila-head"><div><span>{tx('FILA DE PENDÊNCIAS','COLA DE PENDIENTES','PENDING QUEUE')}</span><strong>{filtrada.length} registro(s)</strong></div><small>Derivada das vendas existentes por listarPendenciasFiscais(...)</small></div>
      {filtrada.length === 0 ? <div className="fiscal-vazio"><strong>{tx('Nenhuma venda encontrada.','Ninguna venta encontrada.','No sale found.')}</strong><span>{tx('Os filtros atuais não possuem registros fiscais disponíveis.','Los filtros actuales no tienen registros fiscales disponibles.','The current filters have no fiscal records available.')}</span></div> :
        <div className="fiscal-lista">
          {filtrada.map(item => <article className="fiscal-linha" key={item.vendaId}>
            <div className="fiscal-venda-id"><span>{tx('Venda','Venta','Sale')}</span><strong>{item.vendaId}</strong><small>{formatarData(item.createdAt)}</small></div>
            <div><span>{tx('Cliente','Cliente','Customer')}</span><strong>{texto(item.clienteNome)}</strong></div>
            <div><span>{tx('País','País','Country')}</span><strong>{pais || 'Revisar'}</strong></div>
            <div><span>{tx('Total comercial original','Total comercial original','Original commercial total')}</span><strong>{item.totalComercialOriginal == null || !item.moedaComercial ? 'Revisão necessária' : formatarValor(item.totalComercialOriginal, item.moedaComercial)}</strong><small>{item.moedaComercial || 'Moeda não informada'}</small></div>
            <div><span>{tx('Referência gerencial BRL','Referencia gerencial BRL','BRL management reference')}</span><strong>{formatarValor(item.totalBRL, 'BRL')}</strong><small>{tx('Não é total fiscal convertido','No es total fiscal convertido','Not a converted fiscal total')}</small></div>
            <div className="fiscal-situacao"><span>{tx('Status fiscal','Estado fiscal','Fiscal status')}</span><b className={`status-${item.statusFiscal}`}>{STATUS_LABEL[item.statusFiscal] || item.statusFiscal}</b>{item.exigeRevisao && <small>{tx('Revisão necessária','Revisión necesaria','Review required')}</small>}</div>
            <div className="fiscal-acoes">
              <button type="button" onClick={() => onVerVenda?.(item.vendaId)}>{tx('Ver venda','Ver venta','View sale')}</button>
              <button type="button" className="primario" onClick={() => abrirPrevia(item)}>{tx('Ver prévia fiscal','Ver vista fiscal','View fiscal preview')}</button>
              <button type="button" onClick={() => abrirPrevia(item)}>{tx('Revisar dados','Revisar datos','Review data')}</button>
            </div>
          </article>)}
        </div>}
    </div>

    {selecionada && <div className="fiscal-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelecionada(null); }}>
      <div className="fiscal-modal" role="dialog" aria-modal="true" aria-labelledby="fiscal-previa-titulo">
        <div className="fiscal-modal-head"><div><span>{tx('PRÉVIA NÃO PERSISTIDA','VISTA PREVIA NO PERSISTIDA','NON-PERSISTED PREVIEW')}</span><h2 id="fiscal-previa-titulo">Documento fiscal da venda {selecionada.vendaId}</h2></div><button type="button" onClick={() => setSelecionada(null)} aria-label="Fechar prévia">×</button></div>
        <div className="fiscal-modal-body">
          <div className="fiscal-tipo-row">
            <label><span>Tipo de documento compatível com {pais || 'a loja'}</span><select value={tipoDocumento} onChange={event => alterarTipo(event.target.value)} disabled={tipos.length === 0}>{tipos.length === 0 ? <option value="">{tx('País fiscal inválido','País fiscal inválido','Invalid fiscal country')}</option> : tipos.map(tipo => <option value={tipo} key={tipo}>{TIPOS_FISCAIS_LABEL[tipo] || tipo}</option>)}</select></label>
            <div><span>Adapter</span><strong>{previa?.adapter || 'Indisponível'}</strong></div>
          </div>
          {erroPrevia && <div className="fiscal-erro" role="alert">{erroPrevia}</div>}
          {snapshot && <>
            <div className="fiscal-preview-grid">
              <section><h3>{tx('Dados da venda','Datos de la venta','Sale data')}</h3><Campo rotulo="ID" valor={snapshot.vendaId} /><Campo rotulo="Data" valor={formatarData(selecionada.createdAt)} /><Campo rotulo="Cliente" valor={selecionada.clienteNome} /><Campo rotulo="Situação comercial" valor={snapshot.metadata.estadoComercialNaCriacao} /></section>
              <section><h3>{tx('Emitente','Emisor','Issuer')}</h3><Campo rotulo="Nome / razão social" valor={snapshot.dadosEmitenteSnapshot.razaoSocial || snapshot.dadosEmitenteSnapshot.nomeFantasia} /><Campo rotulo="Documento" valor={snapshot.dadosEmitenteSnapshot.documento1} /><Campo rotulo="Endereço" valor={snapshot.dadosEmitenteSnapshot.endereco} /><Campo rotulo="Cidade / país" valor={`${texto(snapshot.dadosEmitenteSnapshot.cidade)} / ${texto(snapshot.dadosEmitenteSnapshot.pais)}`} /></section>
              <section><h3>{tx('Destinatário','Destinatario','Recipient')}</h3><Campo rotulo="Cliente" valor={snapshot.dadosDestinatarioSnapshot.nome} /><Campo rotulo="Documento" valor={snapshot.dadosDestinatarioSnapshot.documento} /><Campo rotulo="Endereço" valor={snapshot.dadosDestinatarioSnapshot.endereco} /><Campo rotulo="Cidade / país" valor={`${texto(snapshot.dadosDestinatarioSnapshot.cidade)} / ${texto(snapshot.dadosDestinatarioSnapshot.pais)}`} /></section>
            </div>

            <section className="fiscal-preview-section"><h3>{tx('Itens','Ítems','Items')}</h3><div className="fiscal-preview-list">
              {snapshot.itensSnapshot.map((item, index) => <article key={item.id || index}>
                <div><span>{tx('Descrição','Descripción','Description')}</span><strong>{item.descricao || item.nome || 'Não informado'}</strong></div>
                <div><span>{tx('Quantidade / unidade','Cantidad / unidad','Quantity / unit')}</span><strong>{texto(item.qtd)} / {texto(item.unidadeMedida)}</strong></div>
                <div><span>{tx('Preço comercial original','Precio comercial original','Original commercial price')}</span><strong>{item.valoresOriginaisSnapshot ? formatarValor(item.valoresOriginaisSnapshot.precoUnitario, item.valoresOriginaisSnapshot.moeda) : 'Revisar'}</strong></div>
                <div><span>{tx('Referência BRL','Referencia BRL','BRL reference')}</span><strong>{formatarValor(item.precoPraticadoBRL, 'BRL')}</strong></div>
                <div><span>{tx('Classificação fiscal','Clasificación fiscal','Fiscal classification')}</span><strong>{item.ncm && item.ncm !== 'REVISAR' ? item.ncm : 'Revisar'}</strong></div>
              </article>)}
            </div></section>

            <section className="fiscal-preview-section"><h3>{tx('Pagamentos','Pagos','Payments')}</h3><div className="fiscal-preview-list">
              {snapshot.pagamentosSnapshot.length === 0 ? <div className="fiscal-vazio">{tx('Não informado','No informado','Not provided')}</div> : snapshot.pagamentosSnapshot.map((pagamento, index) => <article key={pagamento.id || index}>
                <div><span>{tx('Forma','Forma','Method')}</span><strong>{pagamento.rotulo || pagamento.formaId || 'Não informada'}</strong></div>
                <div><span>{tx('Moeda de origem','Moneda de origen','Source currency')}</span><strong>{texto(pagamento.moedaOrigem)}</strong></div>
                <div><span>{tx('Valor original','Valor original','Original amount')}</span><strong>{formatarValor(pagamento.valorOriginal, pagamento.moedaOrigem)}</strong></div>
                <div><span>{tx('Valor convertido BRL','Valor convertido BRL','Converted BRL amount')}</span><strong>{formatarValor(pagamento.valorConvertidoBRL, 'BRL')}</strong></div>
              </article>)}
            </div></section>

            <div className="fiscal-totais">
              <div><span>{tx('TOTAL COMERCIAL ORIGINAL','TOTAL COMERCIAL ORIGINAL','ORIGINAL COMMERCIAL TOTAL')}</span><strong>{snapshot.totaisOriginaisSnapshot && snapshot.moedaComercial ? formatarValor(snapshot.totaisOriginaisSnapshot.total, snapshot.moedaComercial) : 'Revisão necessária'}</strong><small>{snapshot.moedaComercial || 'Moeda original não informada'}</small></div>
              <div><span>{tx('REFERÊNCIA GERENCIAL BRL','REFERENCIA GERENCIAL BRL','BRL MANAGEMENT REFERENCE')}</span><strong>{formatarValor(snapshot.valoresGerenciaisSnapshot.totalBRL, 'BRL')}</strong><small>{tx('Separada do total fiscal original','Separada del total fiscal original','Separate from the original fiscal total')}</small></div>
            </div>

            <section className="fiscal-pendencias"><h3>{tx('Pendências para emissão','Pendientes para emisión','Issuance pending items')}</h3>{pendencias.map(item => <div key={item}><span>!</span><strong>{PENDENCIAS_LABEL[item] || item}</strong></div>)}</section>
            <section className="fiscal-impacto"><h3>{tx('Impacto fiscal','Impacto fiscal','Fiscal impact')}</h3><div><Campo rotulo="Custo fiscal" valor="Não calculado" /><Campo rotulo="Carga fiscal percentual" valor="Aguardando configuração" /></div></section>
          </>}
        </div>
        <div className="fiscal-modal-actions">
          <button type="button" onClick={() => onVerVenda?.(selecionada.vendaId)}>{tx('Ver venda','Ver venta','View sale')}</button>
          <button type="button" onClick={() => setErroPrevia('Revise os campos marcados como não informados antes de uma futura emissão.')}>{tx('Revisar dados','Revisar datos','Review data')}</button>
          <button type="button" disabled title="Backend fiscal seguro ainda não configurado.">{tx('Criar rascunho','Crear borrador','Create draft')}</button>
          <button type="button" disabled>{tx('Emitir','Emitir','Issue')}</button><button type="button" disabled>{tx('Consultar','Consultar','Query')}</button><button type="button" disabled>{tx('Corrigir','Corregir','Correct')}</button><button type="button" disabled>{tx('Cancelar','Cancelar','Cancel')}</button>
          <p>{tx('Backend fiscal seguro ainda não configurado.','Backend fiscal seguro aún no configurado.','Secure fiscal backend is not configured yet.')}</p>
        </div>
      </div>
    </div>}
  </section>;
}
