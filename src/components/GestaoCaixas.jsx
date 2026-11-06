import {interpretarValorMonetario} from '../core/cashMoneyInput.js';
import React,{useState,useRef,useEffect} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {db} from '../firebase';
import {collection,query,where,orderBy,limit,startAfter,getDocsFromServer} from 'firebase/firestore';
import {intervaloCaixa,filtrarTurnosCaixa,diferencaHistoricaCaixa,dataTurnoCaixa,turnoCaixaFechado} from '../core/cashAuditHistory.js';
import {formatarDinheiroNativo} from '../core/cashHistoryDisplay.js';
import {calcularResumoSessao,vendasDaSessao} from '../core/cashSession';
import {parseZenOSDate} from '../core/dates.js';
import './GestaoCaixas.css';

const moedas=['BRL','PYG','USD','EUR'];
const originalDigitado=(valor,moeda)=>{if(valor==null||valor==='')return null;const parsed=interpretarValorMonetario(valor,moeda);return parsed.ok?parsed.valor:null;};
const registrado=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export default function GestaoCaixas({userId,sessoesCaixa=[],historicoVendas=[],caixaMovimentos=[],operadores=[],perfilLoja={},tema='dark',idioma='pt',fmt,tx=pt=>pt}){
 const [periodo,setPeriodo]=useState('mes'),[inicio,setInicio]=useState(''),[fim,setFim]=useState('');
 const [busca,setBusca]=useState(''),[estado,setEstado]=useState('todos'),[limiteHistorico,setLimiteHistorico]=useState(25);
 const [detalhe,setDetalhe]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false);
 const [consultado,setConsultado]=useState(false),[paginaLivro,setPaginaLivro]=useState([]),[cursor,setCursor]=useState(null),[mais,setMais]=useState(false);
 const consultaRef=useRef(0),relatorioRef=useRef(null),focoAnterior=useRef(null);
 useEffect(()=>{consultaRef.current++;setConsultado(false);setPaginaLivro([]);setCursor(null);setMais(false);setCarregando(false);setErro('');return()=>{consultaRef.current++;};},[periodo,inicio,fim,userId]);
 useEffect(()=>{setLimiteHistorico(25);},[periodo,inicio,fim,busca,estado]);
 useEffect(()=>{setDetalhe(null);},[userId]);
 useEffect(()=>{
  if(!detalhe)return;
  focoAnterior.current=document.activeElement;
  const root=document.getElementById('root'),antes=root?.inert;
  if(root)root.inert=true;
  relatorioRef.current?.querySelector('button')?.focus();
  return()=>{if(root)root.inert=antes;focoAnterior.current?.focus?.();};
 },[detalhe]);
 const nativo=(v,m)=>registrado(v)?formatarDinheiroNativo(v,m,idioma):'—';
 const equivalente=v=>registrado(v)?fmt(Number(v),'BRL'):'—';
 const data=v=>{const d=parseZenOSDate(v);return d?d.toLocaleString(idioma==='es'?'es-PY':idioma==='en'?'en-US':'pt-BR'):'—';};
 const aberturaRegistrada=s=>typeof s.abertura==='string'&&s.abertura.trim()?s.abertura:data(dataTurnoCaixa(s));
 const fechamentoRegistrado=s=>typeof s.fechamentoLocal==='string'&&s.fechamentoLocal.trim()?s.fechamentoLocal:data(s.fechamento);
 const operador=s=>s.operadorNome||operadores.find(o=>String(o.id)===String(s.operadorId))?.nome||(s.operadorId==='admin'?tx('Administrador','Administrador','Administrator'):tx('Operador não identificado','Operador no identificado','Unidentified operator'));
 const situacao=s=>!turnoCaixaFechado(s)?{tom:'open',texto:tx('Em andamento','En curso','Open')}:diferencaHistoricaCaixa(s).pendente?{tom:'pending',texto:tx('Auditoria pendente','Auditoría pendiente','Audit pending')}:s.situacaoConciliacao==='CONCILIADO'?{tom:'ok',texto:tx('Conferido','Verificado','Reconciled')}:Number(s.diferenca)!==0?{tom:'warning',texto:tx('Divergência registrada','Diferencia registrada','Recorded variance')}:{tom:'closed',texto:tx('Fechado','Cerrado','Closed')};
 let intervalo=null;try{if(periodo!=='todos')intervalo=intervaloCaixa(periodo,new Date(),inicio,fim);}catch{}
 const termo=busca.trim().toLocaleLowerCase();
 const filtradas=(periodo==='todos'?sessoesCaixa:intervalo?filtrarTurnosCaixa(sessoesCaixa,intervalo):[])
  .filter(s=>(estado==='todos'||(estado==='abertos'?!turnoCaixaFechado(s):estado==='pendentes'?turnoCaixaFechado(s)&&diferencaHistoricaCaixa(s).pendente:turnoCaixaFechado(s)))&&(!termo||[s.id,operador(s),s.operadorId,s.abertura,s.fechamentoLocal].some(v=>String(v||'').toLocaleLowerCase().includes(termo))))
  .sort((a,b)=>(dataTurnoCaixa(b)||0)-(dataTurnoCaixa(a)||0));
 const abertas=sessoesCaixa.filter(s=>!turnoCaixaFechado(s));
 const pendentes=filtradas.filter(s=>turnoCaixaFechado(s)&&diferencaHistoricaCaixa(s).pendente).length;
 const carregarLivro=async(proxima=false)=>{
  if(!intervalo||!userId||carregando)return;
  const id=++consultaRef.current;setCarregando(true);setErro('');
  try{
   const snap=await getDocsFromServer(query(collection(db,'lojas',String(userId),'financeiro_livro'),
    where('createdAt','>=',intervalo.inicio),
    where('createdAt','<',intervalo.fim),
    orderBy('createdAt','desc'),...(proxima&&cursor?[startAfter(cursor)]:[]),limit(100)));
   if(id!==consultaRef.current)return;
   const rows=snap.docs.map(d=>({...d.data(),id:d.id}));setPaginaLivro(prev=>proxima?[...prev,...rows]:rows);
   setCursor(snap.docs.at(-1)||null);setMais(snap.size===100);setConsultado(true);
  }catch(e){if(id===consultaRef.current)setErro(tx('Não foi possível consultar os lançamentos. Confira a conexão e tente novamente.','No se pudieron consultar los movimientos. Revise la conexión e intente nuevamente.','Could not load entries. Check the connection and try again.'));}
  finally{if(id===consultaRef.current)setCarregando(false);}
 };
 const imprimir=()=>{if(typeof window.print==='function')window.print();else setErro(tx('Use a opção Imprimir do navegador para salvar este relatório.','Utilice Imprimir del navegador para guardar este informe.','Use your browser Print option to save this report.'));};
 const abrir=(s,print=false)=>{flushSync(()=>setDetalhe(s));if(print)imprimir();};
 const fechar=()=>setDetalhe(null);
 const capturarTeclado=e=>{
  if(e.key==='Escape'){e.preventDefault();fechar();}
  if(e.key==='Tab'){
   const itens=[...relatorioRef.current.querySelectorAll('button,[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled);
   if(e.shiftKey&&document.activeElement===itens[0]){e.preventDefault();itens.at(-1)?.focus();}
   else if(!e.shiftKey&&document.activeElement===itens.at(-1)){e.preventDefault();itens[0]?.focus();}
  }
 };
 const movimentos=detalhe?caixaMovimentos.filter(m=>String(m.sessaoId)===String(detalhe.id)):[];
 const vendas=detalhe?vendasDaSessao({sessao:detalhe,historicoVendas}):[];
 const canais=[['pixEntradas',tx('PIX recebido','PIX recibido','PIX received')],['pixSaidas',tx('PIX estornado','PIX revertido','PIX reversed')],['pixLiquido',tx('PIX líquido','PIX neto','Net PIX')],['cartaoCreditoLiquido',tx('Cartão de crédito líquido','Tarjeta de crédito neta','Net credit card')],['cartaoDebitoLiquido',tx('Cartão de débito líquido','Tarjeta de débito neta','Net debit card')]];
 const rotuloTipo=tipo=>({suprimento:tx('Suprimento','Refuerzo','Cash in'),sangria:tx('Sangria','Retiro','Cash out'),recebimento_fiado:tx('Recebimento de cliente','Cobro de cliente','Customer receipt'),saida_despesa:tx('Pagamento de despesa','Pago de gasto','Expense payment'),saida_compra:tx('Pagamento de compra','Pago de compra','Purchase payment'),saida_devolucao:tx('Devolução','Devolución','Refund'),pagamento_despesa:tx('Pagamento de despesa','Pago de gasto','Expense payment'),venda:tx('Venda','Venta','Sale')}[tipo]||tx('Movimentação financeira','Movimiento financiero','Financial entry'));
 return <div className="cash-audit">
  <header className="cash-audit__header"><div><span className="cash-audit__eyebrow">{tx('CONTROLE E CONFERÊNCIA','CONTROL Y REVISIÓN','CONTROL AND REVIEW')}</span><h1>{tx('Auditoria de caixas','Auditoría de cajas','Cash audit')}</h1><p>{tx('Consulte turnos, confira os valores registrados e emita uma segunda via do fechamento.','Consulte turnos, revise los importes registrados y emita una copia del cierre.','Find shifts, review recorded amounts and print a closing report copy.')}</p></div><span className="cash-audit__pill">{tx('Histórico preservado','Historial preservado','History preserved')}</span></header>
  <section className="cash-audit__metrics" aria-label={tx('Resumo da consulta','Resumen de consulta','Query summary')}>
   {[[tx('Caixas abertos agora','Cajas abiertas ahora','Open registers now'),abertas.length],[tx('Turnos encontrados','Turnos encontrados','Matching shifts'),filtradas.length],[tx('Fechados no período','Cerrados en el período','Closed in period'),filtradas.filter(turnoCaixaFechado).length],[tx('Auditorias pendentes','Auditorías pendientes','Pending audits'),pendentes]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}
  </section>
  <section className="cash-audit__panel">
   <div className="cash-audit__section-head"><div><h2>{tx('Consultar caixas','Consultar cajas','Find registers')}</h2><p>{tx('O período considera a abertura do turno. “Todos” inclui registros antigos e sem data reconhecida.','El período considera la apertura del turno. “Todos” incluye registros antiguos y sin fecha reconocida.','Period filters use shift opening dates. All includes old records and unrecognized dates.')}</p></div></div>
   <div className="zen-segments" role="group" aria-label={tx('Período do histórico','Período del historial','History period')}>
    {[['hoje',tx('Hoje','Hoy','Today')],['mes',tx('Este mês','Este mes','This month')],['anterior',tx('Mês passado','Mes pasado','Last month')],['personalizado',tx('Personalizado','Personalizado','Custom')],['todos',tx('Todos os caixas','Todas las cajas','All registers')]].map(([id,label])=><button type="button" key={id} aria-pressed={periodo===id} onClick={()=>setPeriodo(id)}>{label}</button>)}
   </div>
   <div className="cash-audit__filters">
    {periodo==='personalizado'&&<><label>{tx('Data inicial','Fecha inicial','Start date')}<input type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></label><label>{tx('Data final','Fecha final','End date')}<input type="date" value={fim} onChange={e=>setFim(e.target.value)}/></label></>}
    <label className="cash-audit__search">{tx('Buscar operador ou caixa','Buscar operador o caja','Find operator or register')}<input type="search" value={busca} placeholder={tx('Nome do operador ou código do turno','Nombre del operador o código del turno','Operator name or shift code')} onChange={e=>setBusca(e.target.value)}/></label>
    <label>{tx('Situação','Situación','Status')}<select value={estado} onChange={e=>setEstado(e.target.value)}><option value="todos">{tx('Todas as situações','Todas las situaciones','All statuses')}</option><option value="fechados">{tx('Caixas fechados','Cajas cerradas','Closed registers')}</option><option value="abertos">{tx('Caixas abertos','Cajas abiertas','Open registers')}</option><option value="pendentes">{tx('Auditoria pendente','Auditoría pendiente','Audit pending')}</option></select></label>
   </div>
   {periodo!=='todos'&&!intervalo&&<p role="alert" className="cash-audit__notice">{tx('Informe as duas datas para consultar o período.','Informe ambas fechas para consultar el período.','Enter both dates to find the period.')}</p>}
   <div className="cash-audit__table-wrap"><table><caption className="cash-audit__caption">{tx('Histórico de turnos','Historial de turnos','Shift history')} · {filtradas.length}</caption><thead><tr>{[tx('Operador / caixa','Operador / caja','Operator / register'),tx('Abertura e fechamento','Apertura y cierre','Opening and closing'),tx('Sistema / contado','Sistema / contado','Expected / counted'),tx('Conferência','Revisión','Review'),tx('Ações','Acciones','Actions')].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
    {filtradas.slice(0,limiteHistorico).map(s=><tr key={s.id}><td><strong>{operador(s)}</strong><small>{s.id}</small></td><td><span>{aberturaRegistrada(s)}</span><small>{turnoCaixaFechado(s)?fechamentoRegistrado(s):tx('Turno em andamento','Turno en curso','Shift in progress')}</small></td><td><span>{equivalente(s.saldoSistema)}</span><strong>{equivalente(s.saldoInformado)}</strong><small>{tx('Equivalentes registrados em BRL','Equivalentes registrados en BRL','Recorded BRL equivalents')}</small></td><td><span className={'cash-audit__status '+situacao(s).tom}>{situacao(s).texto}</span><small>{turnoCaixaFechado(s)?diferencaHistoricaCaixa(s).pendente?tx('Diferença indeterminada','Diferencia indeterminada','Undetermined difference'):equivalente(s.diferenca):'—'}</small></td><td><div className="cash-audit__actions"><button className="zen-action" onClick={()=>abrir(s)}>{tx('Consultar caixa','Consultar caja','View register')}</button>{turnoCaixaFechado(s)&&<button className="zen-action zen-action--primary" onClick={()=>abrir(s,true)}>{tx('Reimprimir','Reimprimir','Reprint')}</button>}</div></td></tr>)}
   </tbody></table></div>
   {!filtradas.length&&<div className="cash-audit__empty"><strong>{tx('Nenhum caixa neste filtro','Ninguna caja con este filtro','No registers match')}</strong><p>{tx('Experimente outro período ou selecione “Todos os caixas” para consultar o histórico completo disponível.','Pruebe otro período o seleccione “Todas las cajas” para consultar el historial disponible.','Try another period or All registers to browse available history.')}</p></div>}
   {limiteHistorico<filtradas.length&&<button className="zen-action" onClick={()=>setLimiteHistorico(n=>n+25)}>{tx('Mostrar mais caixas','Mostrar más cajas','Show more registers')}</button>}
  </section>
  {abertas.length>0&&<section className="cash-audit__panel"><h2>{tx('Caixas em andamento','Cajas en curso','Open registers')}</h2><div className="cash-audit__open-grid">{abertas.map(s=>{const r=calcularResumoSessao({sessao:s,historicoVendas,caixaMovimentos});return <article key={s.id}><span className="cash-audit__status open">{tx('Aberto','Abierto','Open')}</span><h3>{operador(s)}</h3><p>{aberturaRegistrada(s)}</p><span>{tx('Saldo físico previsto','Saldo físico previsto','Expected physical balance')}</span><strong>{r?fmt(r.saldoEsperado):'—'}</strong><button className="zen-action" onClick={()=>abrir(s)}>{tx('Conferir movimentações','Revisar movimientos','Review movements')}</button></article>;})}</div></section>}
  <section className="cash-audit__panel"><div className="cash-audit__section-head"><div><h2>{tx('Livro financeiro do período','Libro financiero del período','Period financial ledger')}</h2><p>{tx('Consulta sob demanda, com até 100 lançamentos por página. O histórico dos caixas e a segunda via não dependem desta consulta.','Consulta bajo demanda, hasta 100 movimientos por página. El historial de cajas y las copias no dependen de esta consulta.','On-demand queries, up to 100 entries per page. Shift history and report copies do not require this query.')}</p></div><button className="zen-action zen-action--primary" disabled={carregando||!intervalo} onClick={()=>carregarLivro(false)}>{carregando?tx('Consultando…','Consultando…','Loading…'):tx('Consultar lançamentos do período','Consultar movimientos del período','Load period entries')}</button></div>
   {periodo==='todos'&&<p className="cash-audit__notice">{tx('Escolha um período para consultar o Livro Financeiro. “Todos os caixas” não baixa lançamentos de todos os anos.','Elija un período para consultar el Libro Financiero. “Todas las cajas” no descarga movimientos de todos los años.','Choose a period to query the ledger. All registers does not download entries from every year.')}</p>}
   {erro&&<p role="alert" className="cash-audit__notice">{erro}</p>}
   {consultado&&<><div className="cash-audit__table-wrap"><table><thead><tr>{[tx('Data','Fecha','Date'),tx('Movimentação','Movimiento','Entry'),tx('Referência','Referencia','Reference'),tx('Operador','Operador','Operator'),tx('Valor registrado','Importe registrado','Recorded amount')].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{paginaLivro.map(l=><tr key={l.id}><td>{data(l.createdAt)}</td><td>{rotuloTipo(l.tipo)}<small>{l.afetaCaixaFisico?tx('Movimenta dinheiro físico','Mueve efectivo','Physical cash movement'):tx('Registro financeiro','Registro financiero','Financial record')}</small></td><td>{l.referenciaId||l.id}</td><td>{l.operadorNome||'—'}</td><td>{l.direcao==='saida'?'− ':''}{equivalente(l.valor)}</td></tr>)}</tbody></table></div><p>{paginaLivro.length?`${paginaLivro.length} ${tx('lançamentos carregados','movimientos cargados','entries loaded')}`:tx('Nenhum lançamento neste período.','Ningún movimiento en este período.','No entries in this period.')}</p>{mais&&<button className="zen-action" disabled={carregando} onClick={()=>carregarLivro(true)}>{tx('Carregar mais','Cargar más','Load more')}</button>}</>}
  </section>
  {detalhe&&createPortal(<div className={'zen-cash-report theme-'+tema} role="dialog" aria-modal="true" aria-labelledby="cash-report-title" ref={relatorioRef} onKeyDown={capturarTeclado}>
   <div className="zen-cash-report__toolbar"><strong>{tx('Conferência do caixa','Revisión de caja','Register review')}</strong><div><button className="zen-action" onClick={fechar}>{tx('Fechar','Cerrar','Close')}</button><button className="zen-action zen-action--primary" onClick={imprimir}>{tx('Reimprimir','Reimprimir','Reprint')}</button></div></div>
   <article className="zen-cash-report__paper"><header><img src="/logo-zenos.png?v=4" alt="ZenOS"/><div><span className="cash-audit__eyebrow">{tx('RELATÓRIO DE CAIXA','INFORME DE CAJA','CASH REPORT')}</span><h2 id="cash-report-title">{turnoCaixaFechado(detalhe)?tx('Fechamento · segunda via','Cierre · copia','Closing · report copy'):tx('Turno em andamento','Turno en curso','Open shift')}</h2><p>{perfilLoja.nomeFantasia||perfilLoja.nomeLoja||'ZenOS'}</p></div><span className={'cash-audit__status '+situacao(detalhe).tom}>{situacao(detalhe).texto}</span></header>
    <div className="zen-cash-report__identity"><div><span>{tx('Operador responsável','Operador responsable','Responsible operator')}</span><strong>{operador(detalhe)}</strong></div><div><span>{tx('Identificação do turno','Identificación del turno','Shift ID')}</span><strong>{detalhe.id}</strong></div><div><span>{tx('Abertura','Apertura','Opening')}</span><strong>{aberturaRegistrada(detalhe)}</strong></div><div><span>{tx('Fechamento','Cierre','Closing')}</span><strong>{fechamentoRegistrado(detalhe)}</strong></div></div>
    <div className="zen-cash-report__totals">{[[tx('Fundo inicial','Fondo inicial','Opening float'),detalhe.saldoInicial],[tx('Esperado registrado','Esperado registrado','Recorded expected'),detalhe.saldoSistema],[tx('Contagem registrada','Conteo registrado','Recorded count'),detalhe.saldoInformado]].map(([label,value])=><div key={label}><span>{label}</span><strong>{equivalente(value)}</strong><small>{tx('Equivalente registrado em BRL','Equivalente registrado en BRL','Recorded BRL equivalent')}</small></div>)}</div>
    <section><h3>{tx('Conferência por moeda','Revisión por moneda','Currency reconciliation')}</h3><table><thead><tr>{[tx('Moeda','Moneda','Currency'),tx('Abertura','Apertura','Opening'),tx('Esperado','Esperado','Expected'),tx('Contado','Contado','Counted'),tx('Diferença','Diferencia','Difference')].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{moedas.map(m=><tr key={m}><th>{m}</th><td>{nativo(detalhe.detalheAberturaNativos?.[m]??originalDigitado(detalhe.detalheAbertura?.[m],m),m)}</td><td>{nativo(detalhe.composicaoEsperadaNativa?.[m],m)}</td><td>{nativo(detalhe.composicaoContadaNativa?.[m]??detalhe.detalheFechamentoNativos?.[m]??originalDigitado(detalhe.detalheFechamento?.[m],m),m)}</td><td>{diferencaHistoricaCaixa(detalhe).pendente?tx('Não conclusiva','No concluyente','Inconclusive'):nativo(detalhe.diferencasNativas?.[m],m)}</td></tr>)}</tbody></table></section>
    <div className="cash-audit__notice"><strong>{diferencaHistoricaCaixa(detalhe).pendente?tx('Auditoria pendente — diferença indeterminada','Auditoría pendiente — diferencia indeterminada','Audit pending — undetermined difference'):tx('Diferença registrada','Diferencia registrada','Recorded difference')+': '+equivalente(detalhe.diferenca)}</strong><p>{tx('Os valores desta via correspondem ao registro original. Campos sem informação aparecem como “—”. A emissão da cópia não altera o fechamento.','Los valores corresponden al registro original. Los campos sin información aparecen como “—”. Emitir una copia no modifica el cierre.','Amounts come from the original record. Missing fields show “—”. Printing a copy does not modify the closing record.')}</p>{(detalhe.pendenciasConciliacao||[]).map((p,i)=><p key={i}>{p}</p>)}</div>
    <section><h3>{tx('Meios eletrônicos registrados','Medios electrónicos registrados','Recorded electronic payments')}</h3><div className="zen-cash-report__channels">{canais.map(([key,label])=><div key={key}><span>{label}</span><strong>{equivalente(detalhe.conciliacaoEletronica?.[key])}</strong></div>)}</div></section>
    <section><h3>{tx('Cotações do fechamento','Cotizaciones del cierre','Closing exchange rates')}</h3>{detalhe.taxasCambioFechamento?<div className="zen-cash-report__channels">{moedas.filter(m=>m!=='BRL').map(m=><div key={m}><span>{m}</span><strong>{Number(detalhe.taxasCambioFechamento[m])>0?`1 BRL = ${Number(detalhe.taxasCambioFechamento[m]).toLocaleString(idioma==='es'?'es-PY':'pt-BR',{maximumFractionDigits:8})} ${m}`:'—'}</strong></div>)}</div>:<p>{tx('Cotação histórica não registrada. Nenhum câmbio atual foi aplicado.','Cotización histórica no registrada. No se aplicó un cambio actual.','Historical rate not recorded. No current exchange rate was applied.')}</p>}</section>
    <section><h3>{tx('Movimentações do turno','Movimientos del turno','Shift movements')} · {movimentos.length}</h3>{movimentos.length?<table><thead><tr><th>{tx('Data','Fecha','Date')}</th><th>{tx('Descrição','Descripción','Description')}</th><th>{tx('Valor registrado','Importe registrado','Recorded amount')}</th></tr></thead><tbody>{movimentos.map(m=><tr key={m.id}><td>{data(m.createdAt||m.dataHora)}</td><td>{m.descricao||rotuloTipo(m.tipo)}<small>{m.id}</small></td><td>{m.detalhesMoedasNativas?moedas.filter(c=>registrado(m.detalhesMoedasNativas[c])&&Number(m.detalhesMoedasNativas[c])!==0).map(c=><span key={c}>{nativo(m.detalhesMoedasNativas[c],c)} </span>):equivalente(m.valorBRL)}</td></tr>)}</tbody></table>:<p>{tx('Não há movimentações operacionais vinculadas a este turno no histórico disponível.','No hay movimientos operativos vinculados a este turno en el historial disponible.','No linked operational movements in the available history.')}</p>}</section>
    <footer><span>{vendas.length} {tx('vendas vinculadas','ventas vinculadas','linked sales')}</span><span>{tx('Responsável pelo fechamento','Responsable del cierre','Closed by')}: {detalhe.auditadoPor||operador(detalhe)}</span><strong>ZenOS</strong></footer>
   </article>
  </div>,document.body)}
 </div>;
}
