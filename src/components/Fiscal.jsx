import React, { useMemo, useState } from 'react';
import { TIPOS_FISCAIS } from '../core/fiscalCore';
import { TIPOS_FISCAIS_LABEL, prepararPreviaFiscal } from '../core/fiscalUi';
import { chaveDiaLocal } from '../core/dates';
import './Fiscal.css';

const STATUS = ['todos','pendente','rascunho','autorizado','rejeitado','cancelado'];

const texto = (value, tx = (pt) => pt) => String(value ?? '').trim() || tx('Não informado','No informado','Not provided');
const formatarData = (value, locale, tx) => {
  const data = new Date(value);
  return Number.isFinite(data.getTime()) ? data.toLocaleString(locale) : tx('Não informada','No informada','Not provided');
};
const formatarValor = (value, moeda, locale, tx) => {
  if (!Number.isFinite(Number(value)) || !moeda) return tx('Não informado','No informado','Not provided');
  try {
    return new Intl.NumberFormat(locale, { style:'currency', currency:moeda }).format(Number(value));
  } catch {
    return `${moeda} ${Number(value).toLocaleString(locale, { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  }
};
function Campo({ rotulo, valor, destaque = false, tx = (pt) => pt }) {
  return <div className={`fiscal-campo ${destaque ? 'destaque' : ''}`}><span>{rotulo}</span><strong>{texto(valor, tx)}</strong></div>;
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
  idioma = 'pt',
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
  const locale = idioma === 'es' ? 'es-PY' : idioma === 'en' ? 'en-US' : 'pt-BR';
  const statusLabel = {
    todos: tx('Todos','Todos','All'), pendente: tx('Pendentes','Pendientes','Pending'), rascunho: tx('Rascunhos','Borradores','Drafts'), autorizado: tx('Autorizados','Autorizados','Authorized'), rejeitado: tx('Rejeitados','Rechazados','Rejected'), cancelado: tx('Cancelados','Cancelados','Cancelled'),
  };
  const pendenciasLabel = {
    'emitente.razaoSocial': tx('Razão social do emitente não informada','Razón social del emisor no informada','Issuer legal name not provided'),
    'emitente.documento1': tx('Documento do emitente não informado','Documento del emisor no informado','Issuer document not provided'),
    'emitente.endereco': tx('Endereço do emitente não informado','Dirección del emisor no informada','Issuer address not provided'),
    'emitente.cidade': tx('Cidade do emitente não informada','Ciudad del emisor no informada','Issuer city not provided'),
    'destinatario.revisar': tx('Destinatário precisa de revisão','Destinatario requiere revisión','Recipient requires review'),
    'classificacao_fiscal.revisar': tx('Classificação fiscal precisa de revisão','Clasificación fiscal requiere revisión','Fiscal classification requires review'),
    'endereco_estruturado.revisar': tx('Endereço estruturado não informado','Dirección estructurada no informada','Structured address not provided'),
    'integracao.nao_configurada': tx('Integração governamental não configurada','Integración gubernamental no configurada','Government integration not configured'),
  };

  const contadores = useMemo(() => {
    const base = { pendente:0, rascunho:0, autorizado:0, rejeitado:0, cancelado:0 };
    filaFiscal.forEach(item => {
      if (Object.hasOwn(base, item.statusFiscal)) base[item.statusFiscal] += 1;
    });
    return base;
  }, [filaFiscal]);

  const filtrada = useMemo(() => {
    const termo = busca.toLocaleLowerCase(locale).trim();
    return filaFiscal.filter(item => {
      if (status !== 'todos' && item.statusFiscal !== status) return false;
      if (termo && !`${item.vendaId} ${item.clienteNome || ''}`.toLocaleLowerCase(locale).includes(termo)) return false;
      const dia = chaveDiaLocal(item.createdAt) || '';
      if (dataInicial && (!dia || dia < dataInicial)) return false;
      if (dataFinal && (!dia || dia > dataFinal)) return false;
      return true;
    });
  }, [busca, dataFinal, dataInicial, filaFiscal, status, locale]);

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
      setErroPrevia(`${error?.code ? `${error.code}: ` : ''}${error?.message || tx('Não foi possível preparar a prévia fiscal.','No fue posible preparar la vista fiscal.','Could not prepare the fiscal preview.')}`);
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
      setErroPrevia(`${error?.code ? `${error.code}: ` : ''}${error?.message || tx('Não foi possível preparar a prévia fiscal.','No fue posible preparar la vista fiscal.','Could not prepare the fiscal preview.')}`);
    }
  };

  const snapshot = previa?.snapshot;
  const pendencias = previa?.cadastro?.pendencias || [];

  return <section className="fiscal-page" data-fiscal-mobile-safe="true">
    <header className="fiscal-header">
      <div><span className="fiscal-eyebrow">ZENOS FISCAL</span><h1>{tx('Operação fiscal','Operación fiscal','Fiscal operation')}</h1><p>{tx('Consulta e preparação visual de documentos, sem alterar a venda comercial.','Consulta y preparación visual de documentos, sin alterar la venta comercial.','View and visually prepare documents without changing the commercial sale.')}</p></div>
      <div className="fiscal-contexto">
        <Campo tx={tx} rotulo={tx('País fiscal','País fiscal','Fiscal country')} valor={pais === 'BR' ? tx('Brasil (BR)','Brasil (BR)','Brazil (BR)') : pais === 'PY' ? 'Paraguay (PY)' : tx('Não configurado','No configurado','Not configured')} />
        <Campo tx={tx} rotulo={tx('Moeda comercial','Moneda comercial','Commercial currency')} valor={perfilLoja?.moedaComercial || perfilLoja?.moeda || filaFiscal.find(item => item.moedaComercial)?.moedaComercial || tx('Não informada','No informada','Not provided')} />
        <Campo tx={tx} rotulo={tx('Ambiente visual','Entorno visual','Visual environment')} valor={ambiente === 'producao' ? tx('Produção','Producción','Production') : tx('Homologação','Homologación','Test')} />
      </div>
    </header>

    <div className="fiscal-aviso" role="status"><span>ⓘ</span><div><strong>{tx('Integração governamental ainda não configurada.','Integración gubernamental aún no configurada.','Government integration is not configured yet.')}</strong><p>{tx('A fila e as prévias são somente leitura. Nenhum documento será transmitido ou persistido nesta fase.','La cola y las vistas previas son de solo lectura. Ningún documento será transmitido ni persistido en esta fase.','The queue and previews are read-only. No document will be transmitted or persisted in this phase.')}</p></div></div>
    {erroFila && <div className="fiscal-erro" role="alert"><strong>{tx('Não foi possível montar a fila fiscal.','No fue posible montar la cola fiscal.','Could not build the fiscal queue.')}</strong><span>{erroFila}</span></div>}

    <div className="fiscal-kpis">
      {STATUS.slice(1).map(chave => <button type="button" key={chave} className={`fiscal-kpi ${status === chave ? 'ativo' : ''}`} onClick={() => setStatus(chave)}>
        <span>{statusLabel[chave]}</span><strong>{contadores[chave]}</strong><small>{chave === 'pendente' ? tx('vendas elegíveis','ventas elegibles','eligible sales') : tx('sem persistência nesta fase','sin persistencia en esta fase','not persisted in this phase')}</small>
      </button>)}
    </div>

    <div className="fiscal-toolbar">
      <div className="fiscal-status-tabs">{STATUS.map(chave => <button type="button" key={chave} className={status === chave ? 'ativo' : ''} onClick={() => setStatus(chave)}>{statusLabel[chave]}</button>)}</div>
      <div className="fiscal-filtros">
        <label><span>{tx('Buscar venda ou cliente','Buscar venta o cliente','Search sale or customer')}</span><input value={busca} onChange={event => setBusca(event.target.value)} placeholder={tx('ID ou nome','ID o nombre','ID or name')} /></label>
        <label><span>{tx('De','Desde','From')}</span><input type="date" value={dataInicial} onChange={event => setDataInicial(event.target.value)} /></label>
        <label><span>{tx('Até','Hasta','To')}</span><input type="date" value={dataFinal} onChange={event => setDataFinal(event.target.value)} /></label>
      </div>
    </div>

    <div className="fiscal-fila">
      <div className="fiscal-fila-head"><div><span>{tx('FILA DE PENDÊNCIAS','COLA DE PENDIENTES','PENDING QUEUE')}</span><strong>{filtrada.length} {tx('registro(s)','registro(s)','record(s)')}</strong></div><small>{tx('Derivada das vendas existentes por listarPendenciasFiscais(...)','Derivada de las ventas existentes por listarPendenciasFiscais(...)','Derived from existing sales by listarPendenciasFiscais(...)')}</small></div>
      {filtrada.length === 0 ? <div className="fiscal-vazio"><strong>{tx('Nenhuma venda encontrada.','Ninguna venta encontrada.','No sale found.')}</strong><span>{tx('Os filtros atuais não possuem registros fiscais disponíveis.','Los filtros actuales no tienen registros fiscales disponibles.','The current filters have no fiscal records available.')}</span></div> :
        <div className="fiscal-lista">
          {filtrada.map(item => <article className="fiscal-linha" key={item.vendaId}>
            <div className="fiscal-venda-id"><span>{tx('Venda','Venta','Sale')}</span><strong>{item.vendaId}</strong><small>{formatarData(item.createdAt, locale, tx)}</small></div>
            <div><span>{tx('Cliente','Cliente','Customer')}</span><strong>{texto(item.clienteNome, tx)}</strong></div>
            <div><span>{tx('País','País','Country')}</span><strong>{pais || tx('Revisar','Revisar','Review')}</strong></div>
            <div><span>{tx('Total comercial original','Total comercial original','Original commercial total')}</span><strong>{item.totalComercialOriginal == null || !item.moedaComercial ? tx('Revisão necessária','Revisión necesaria','Review required') : formatarValor(item.totalComercialOriginal, item.moedaComercial, locale, tx)}</strong><small>{item.moedaComercial || tx('Moeda não informada','Moneda no informada','Currency not provided')}</small></div>
            <div><span>{tx('Referência gerencial BRL','Referencia gerencial BRL','BRL management reference')}</span><strong>{formatarValor(item.totalBRL, 'BRL', locale, tx)}</strong><small>{tx('Não é total fiscal convertido','No es total fiscal convertido','Not a converted fiscal total')}</small></div>
            <div className="fiscal-situacao"><span>{tx('Status fiscal','Estado fiscal','Fiscal status')}</span><b className={`status-${item.statusFiscal}`}>{statusLabel[item.statusFiscal] || item.statusFiscal}</b>{item.exigeRevisao && <small>{tx('Revisão necessária','Revisión necesaria','Review required')}</small>}</div>
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
        <div className="fiscal-modal-head"><div><span>{tx('PRÉVIA NÃO PERSISTIDA','VISTA PREVIA NO PERSISTIDA','NON-PERSISTED PREVIEW')}</span><h2 id="fiscal-previa-titulo">{tx('Documento fiscal da venda','Documento fiscal de la venta','Fiscal document for sale')} {selecionada.vendaId}</h2></div><button type="button" onClick={() => setSelecionada(null)} aria-label={tx('Fechar prévia','Cerrar vista previa','Close preview')}>×</button></div>
        <div className="fiscal-modal-body">
          <div className="fiscal-tipo-row">
            <label><span>{tx('Tipo de documento compatível com','Tipo de documento compatible con','Document type compatible with')} {pais || tx('a loja','la tienda','the store')}</span><select value={tipoDocumento} onChange={event => alterarTipo(event.target.value)} disabled={tipos.length === 0}>{tipos.length === 0 ? <option value="">{tx('País fiscal inválido','País fiscal inválido','Invalid fiscal country')}</option> : tipos.map(tipo => <option value={tipo} key={tipo}>{TIPOS_FISCAIS_LABEL[tipo] || tipo}</option>)}</select></label>
            <div><span>{tx('Adapter','Adaptador','Adapter')}</span><strong>{previa?.adapter || tx('Indisponível','No disponible','Unavailable')}</strong></div>
          </div>
          {erroPrevia && <div className="fiscal-erro" role="alert">{erroPrevia}</div>}
          {snapshot && <>
            <div className="fiscal-preview-grid">
              <section><h3>{tx('Dados da venda','Datos de la venta','Sale data')}</h3><Campo tx={tx} rotulo="ID" valor={snapshot.vendaId} /><Campo tx={tx} rotulo={tx('Data','Fecha','Date')} valor={formatarData(selecionada.createdAt, locale, tx)} /><Campo tx={tx} rotulo={tx('Cliente','Cliente','Customer')} valor={selecionada.clienteNome} /><Campo tx={tx} rotulo={tx('Situação comercial','Situación comercial','Commercial status')} valor={snapshot.metadata.estadoComercialNaCriacao} /></section>
              <section><h3>{tx('Emitente','Emisor','Issuer')}</h3><Campo tx={tx} rotulo={tx('Nome / razão social','Nombre / razón social','Name / legal name')} valor={snapshot.dadosEmitenteSnapshot.razaoSocial || snapshot.dadosEmitenteSnapshot.nomeFantasia} /><Campo tx={tx} rotulo={tx('Documento','Documento','Document')} valor={snapshot.dadosEmitenteSnapshot.documento1} /><Campo tx={tx} rotulo={tx('Endereço','Dirección','Address')} valor={snapshot.dadosEmitenteSnapshot.endereco} /><Campo tx={tx} rotulo={tx('Cidade / país','Ciudad / país','City / country')} valor={`${texto(snapshot.dadosEmitenteSnapshot.cidade, tx)} / ${texto(snapshot.dadosEmitenteSnapshot.pais, tx)}`} /></section>
              <section><h3>{tx('Destinatário','Destinatario','Recipient')}</h3><Campo tx={tx} rotulo={tx('Cliente','Cliente','Customer')} valor={snapshot.dadosDestinatarioSnapshot.nome} /><Campo tx={tx} rotulo={tx('Documento','Documento','Document')} valor={snapshot.dadosDestinatarioSnapshot.documento} /><Campo tx={tx} rotulo={tx('Endereço','Dirección','Address')} valor={snapshot.dadosDestinatarioSnapshot.endereco} /><Campo tx={tx} rotulo={tx('Cidade / país','Ciudad / país','City / country')} valor={`${texto(snapshot.dadosDestinatarioSnapshot.cidade, tx)} / ${texto(snapshot.dadosDestinatarioSnapshot.pais, tx)}`} /></section>
            </div>

            <section className="fiscal-preview-section"><h3>{tx('Itens','Ítems','Items')}</h3><div className="fiscal-preview-list">
              {snapshot.itensSnapshot.map((item, index) => <article key={item.id || index}>
                <div><span>{tx('Descrição','Descripción','Description')}</span><strong>{item.descricao || item.nome || tx('Não informado','No informado','Not provided')}</strong></div>
                <div><span>{tx('Quantidade / unidade','Cantidad / unidad','Quantity / unit')}</span><strong>{texto(item.qtd, tx)} / {texto(item.unidadeMedida, tx)}</strong></div>
                <div><span>{tx('Preço comercial original','Precio comercial original','Original commercial price')}</span><strong>{item.valoresOriginaisSnapshot ? formatarValor(item.valoresOriginaisSnapshot.precoUnitario, item.valoresOriginaisSnapshot.moeda, locale, tx) : tx('Revisar','Revisar','Review')}</strong></div>
                <div><span>{tx('Referência BRL','Referencia BRL','BRL reference')}</span><strong>{formatarValor(item.precoPraticadoBRL, 'BRL', locale, tx)}</strong></div>
                <div><span>{tx('Classificação fiscal','Clasificación fiscal','Fiscal classification')}</span><strong>{item.ncm && item.ncm !== 'REVISAR' ? item.ncm : tx('Revisar','Revisar','Review')}</strong></div>
              </article>)}
            </div></section>

            <section className="fiscal-preview-section"><h3>{tx('Pagamentos','Pagos','Payments')}</h3><div className="fiscal-preview-list">
              {snapshot.pagamentosSnapshot.length === 0 ? <div className="fiscal-vazio">{tx('Não informado','No informado','Not provided')}</div> : snapshot.pagamentosSnapshot.map((pagamento, index) => <article key={pagamento.id || index}>
                <div><span>{tx('Forma','Forma','Method')}</span><strong>{pagamento.rotulo || pagamento.formaId || tx('Não informada','No informada','Not provided')}</strong></div>
                <div><span>{tx('Moeda de origem','Moneda de origen','Source currency')}</span><strong>{texto(pagamento.moedaOrigem, tx)}</strong></div>
                <div><span>{tx('Valor original','Valor original','Original amount')}</span><strong>{formatarValor(pagamento.valorOriginal, pagamento.moedaOrigem, locale, tx)}</strong></div>
                <div><span>{tx('Valor convertido BRL','Valor convertido BRL','Converted BRL amount')}</span><strong>{formatarValor(pagamento.valorConvertidoBRL, 'BRL', locale, tx)}</strong></div>
              </article>)}
            </div></section>

            <div className="fiscal-totais">
              <div><span>{tx('TOTAL COMERCIAL ORIGINAL','TOTAL COMERCIAL ORIGINAL','ORIGINAL COMMERCIAL TOTAL')}</span><strong>{snapshot.totaisOriginaisSnapshot && snapshot.moedaComercial ? formatarValor(snapshot.totaisOriginaisSnapshot.total, snapshot.moedaComercial, locale, tx) : tx('Revisão necessária','Revisión necesaria','Review required')}</strong><small>{snapshot.moedaComercial || tx('Moeda original não informada','Moneda original no informada','Original currency not provided')}</small></div>
              <div><span>{tx('REFERÊNCIA GERENCIAL BRL','REFERENCIA GERENCIAL BRL','BRL MANAGEMENT REFERENCE')}</span><strong>{formatarValor(snapshot.valoresGerenciaisSnapshot.totalBRL, 'BRL', locale, tx)}</strong><small>{tx('Separada do total fiscal original','Separada del total fiscal original','Separate from the original fiscal total')}</small></div>
            </div>

            <section className="fiscal-pendencias"><h3>{tx('Pendências para emissão','Pendientes para emisión','Issuance pending items')}</h3>{pendencias.map(item => <div key={item}><span>!</span><strong>{pendenciasLabel[item] || item}</strong></div>)}</section>
            <section className="fiscal-impacto"><h3>{tx('Impacto fiscal','Impacto fiscal','Fiscal impact')}</h3><div><Campo tx={tx} rotulo={tx('Custo fiscal','Costo fiscal','Fiscal cost')} valor={tx('Não calculado','No calculado','Not calculated')} /><Campo tx={tx} rotulo={tx('Carga fiscal percentual','Carga fiscal porcentual','Fiscal burden percentage')} valor={tx('Aguardando configuração','Esperando configuración','Awaiting configuration')} /></div></section>
          </>}
        </div>
        <div className="fiscal-modal-actions">
          <button type="button" onClick={() => onVerVenda?.(selecionada.vendaId)}>{tx('Ver venda','Ver venta','View sale')}</button>
          <button type="button" onClick={() => setErroPrevia(tx('Revise os campos marcados como não informados antes de uma futura emissão.','Revise los campos marcados como no informados antes de una futura emisión.','Review fields marked as not provided before a future issuance.'))}>{tx('Revisar dados','Revisar datos','Review data')}</button>
          <button type="button" disabled title={tx('Backend fiscal seguro ainda não configurado.','Backend fiscal seguro aún no configurado.','Secure fiscal backend is not configured yet.')}>{tx('Criar rascunho','Crear borrador','Create draft')}</button>
          <button type="button" disabled>{tx('Emitir','Emitir','Issue')}</button><button type="button" disabled>{tx('Consultar','Consultar','Query')}</button><button type="button" disabled>{tx('Corrigir','Corregir','Correct')}</button><button type="button" disabled>{tx('Cancelar','Cancelar','Cancel')}</button>
          <p>{tx('Backend fiscal seguro ainda não configurado.','Backend fiscal seguro aún no configurado.','Secure fiscal backend is not configured yet.')}</p>
        </div>
      </div>
    </div>}
  </section>;
}
