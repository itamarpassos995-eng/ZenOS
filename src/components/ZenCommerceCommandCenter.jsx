import React,{useEffect,useMemo,useState} from 'react';
import ZenCommerceOrderCard from './ZenCommerceOrderCard';
import '../commerceCommandCenter.css';

const statusTexto={recebido:'Novo',em_atendimento:'Em atendimento',encerrado:'Concluído',cancelado:'Cancelado'};
const moeda=valor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(valor)||0)/100);
const momento=valor=>{const d=new Date(valor);return Number.isNaN(d.getTime())?'Horário não informado':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d);};
const qtos=pedido=>(Array.isArray(pedido?.itens)?pedido.itens:[]).reduce((a,b)=>a+(Number(b?.quantidade)||0),0);
const txt=x=>String(x||'').toLocaleLowerCase('pt-BR');
const ID=x=>String(x||'').slice(0,10).toUpperCase();
const noAr=status=>status?'Publicada':'Fora do ar';
const PER_PAGE=12;

export function filtrarPedidosCommerce(pedidos,estado='ativos',busca=''){
 const termo=txt(busca).trim();
 return (Array.isArray(pedidos)?pedidos:[]).filter(p=>{
  if(estado==='ativos'&&!['recebido','em_atendimento'].includes(p.status))return false;
  if(estado==='recebido'&&p.status!=='recebido')return false;
  if(estado==='em_atendimento'&&p.status!=='em_atendimento')return false;
  if(estado==='historico'&&!['encerrado','cancelado'].includes(p.status))return false;
  if(estado==='encerrado'&&p.status!=='encerrado')return false;
  if(estado==='cancelado'&&p.status!=='cancelado')return false;
  return !termo||[p.id,p?.cliente?.nome,p?.cliente?.telefone].some(x=>txt(x).includes(termo));
 }).sort((a,b)=>Date.parse(b.criadoEm||0)-Date.parse(a.criadoEm||0));
}
export function resumoPedidosCommerce(pedidos=[]){
 const lista=Array.isArray(pedidos)?pedidos:[];
 return {novos:lista.filter(p=>p.status==='recebido').length,atendimento:lista.filter(p=>p.status==='em_atendimento').length,
 concluidos:lista.filter(p=>p.status==='encerrado').length,cancelados:lista.filter(p=>p.status==='cancelado').length};
}

/** Painel de operação, SOMENTE apresentação. Todo write segue callbacks autenticados do ZenOS. */
export default function ZenCommerceCommandCenter({
 pedidos=[],clientesOnline=[],clientesCarregando=false,erroClientes='',painelErro='',painelBusy=false,
 lojaPublicada=false,idPublico='',whatsapp='',onWhatsappChange=()=>{},onAtualizarPedidos=()=>{},
 onConsultarClientes=()=>{},onAtenderPedido=()=>{},onCancelarPedido=()=>{},
 onRetirarLoja=()=>{},focoPedidosOnline=0,produtoFocoId=null,editor
}){
 const [aba,setAba]=useState('visao');
 const [filtro,setFiltro]=useState('ativos');
 const [busca,setBusca]=useState('');
 const [dataInicio,setDataInicio]=useState(''),[dataFim,setDataFim]=useState('');
 const [buscaCliente,setBuscaCliente]=useState('');
 const [pedidoSelecionado,setPedidoSelecionado]=useState('');
 const [clienteSelecionado,setClienteSelecionado]=useState('');
 const [pagina,setPagina]=useState(1);
 useEffect(()=>{if(focoPedidosOnline){setAba('pedidos');setFiltro('ativos');}},[focoPedidosOnline]);
 useEffect(()=>{if(produtoFocoId){setAba('personalizar');}},[produtoFocoId]);
 const resumo=useMemo(()=>resumoPedidosCommerce(pedidos),[pedidos]);
 const ativos=useMemo(()=>filtrarPedidosCommerce(pedidos,'ativos'),[pedidos]);
 const pedidosFiltrados=useMemo(()=>filtrarPedidosCommerce(pedidos,filtro,busca).filter(p=>{
  if(!dataInicio&&!dataFim)return true;
  const t=Date.parse(p.criadoEm);if(!Number.isFinite(t))return false;
  if(dataInicio&&t<new Date(dataInicio+'T00:00:00').getTime())return false;
  if(dataFim&&t>new Date(dataFim+'T23:59:59.999').getTime())return false;
  return true;
 }),[pedidos,filtro,busca,dataInicio,dataFim]);
 const pedidosPagina=useMemo(()=>pedidosFiltrados.slice((pagina-1)*PER_PAGE,pagina*PER_PAGE),[pedidosFiltrados,pagina]);
 const selecionado=pedidos.find(p=>p.id===pedidoSelecionado);
 const clientesFiltrados=useMemo(()=>clientesOnline.filter(c=>[c.nome,c.telefone].some(v=>txt(v).includes(txt(buscaCliente).trim()))),[clientesOnline,buscaCliente]);
 const cliente=clientesOnline.find(c=>c.id===clienteSelecionado);
 const ir=(destino,proximoFiltro)=>{
  setAba(destino);if(proximoFiltro)setFiltro(proximoFiltro);
  setPedidoSelecionado('');setClienteSelecionado('');setPagina(1);setBusca('');setDataInicio('');setDataFim('');
  if(destino==='clientes')onConsultarClientes();
 };
 useEffect(()=>{setPagina(1);setPedidoSelecionado('');},[busca,filtro,dataInicio,dataFim]);
 useEffect(()=>{if(selecionado&&aba!=='pedidos')setPedidoSelecionado('');},[aba]);
 const guia=[
  ['visao','Visão geral'],['pedidos','Pedidos'],['clientes','Clientes'],['personalizar','Personalizar loja'],['configuracoes','Configurações']
 ];
 return <section className="zcc" aria-label="ZenOS Commerce Premium">
  <header className="zcc-header">
   <div>
    <div className="zcc-eyebrow">ZENOS COMMERCE <span>·</span> CENTRAL DE GESTÃO</div>
    <div className="zcc-header-line"><h2>Minha Loja Online</h2><span className={'zcc-store-state '+(lojaPublicada?'zcc-store-state--on':'')}>{noAr(lojaPublicada)}</span></div>
    <p>Pedidos, clientes e sua vitrine em um único lugar. Sem misturar a operação com as configurações.</p>
   </div>
   <div className="zcc-header-actions">{idPublico&&<a href={'/loja/'+encodeURIComponent(idPublico)} target="_blank" rel="noopener noreferrer">↗ Abrir minha loja</a>}
    <button type="button" onClick={()=>ir('pedidos','ativos')}>Pedidos ativos {resumo.novos>0&&<span className="zcc-alert-count">{resumo.novos}</span>}</button>
   </div>
  </header>
  <nav className="zcc-nav" aria-label="Áreas da loja online">{guia.map(([id,nome])=><button key={id} type="button" className={aba===id?'zcc-nav-active':''} aria-current={aba===id?'page':undefined} onClick={()=>ir(id)}>{nome}{id==='pedidos'&&resumo.novos>0&&<span aria-label={resumo.novos+' novos pedidos'} className="zcc-nav-count">{resumo.novos}</span>}</button>)}</nav>
  {painelErro&&<div role="alert" className="zcc-error">{painelErro}</div>}
  <div hidden={aba!=='visao'} className="zcc-screen">
   <div className="zcc-section-head"><div><span className="zcc-eyebrow">OPERAÇÃO DE HOJE</span><h3>O que precisa da sua atenção</h3></div><button type="button" className="zcc-text-action" onClick={()=>ir('pedidos','ativos')}>Abrir fila completa →</button></div>
   <div className="zcc-stats">
    <button type="button" onClick={()=>ir('pedidos','recebido')}><small>Novos pedidos</small><strong>{resumo.novos}</strong><span>Precisam de atendimento</span></button>
    <button type="button" onClick={()=>ir('pedidos','em_atendimento')}><small>Em atendimento</small><strong>{resumo.atendimento}</strong><span>Já estão com um operador</span></button>
    <button type="button" onClick={()=>ir('pedidos','encerrado')}><small>Concluídos</small><strong>{resumo.concluidos}</strong><span>Nos pedidos carregados</span></button>
    <button type="button" onClick={()=>ir('clientes')}><small>Clientes online</small><strong>↗</strong><span>Consultar cadastros</span></button>
   </div>
   <div className="zcc-overview-grid">
    <div className="zcc-pane">
     <div className="zcc-pane-title"><h4>Próximos atendimentos</h4><span>{ativos.length} na fila carregada</span></div>
     {ativos.slice(0,4).map(p=><button key={p.id} type="button" className="zcc-quick-order" onClick={()=>{ir('pedidos','ativos');setPedidoSelecionado(p.id);}}>
       <span className="zcc-quick-person">{p?.cliente?.nome||'Cliente não informado'}<small>#{ID(p.id)} · {momento(p.criadoEm)}</small></span><strong>{moeda(p.totalCentavos)}</strong><span className="zcc-quick-open">Ver ›</span>
      </button>)}
     {!ativos.length&&<div className="zcc-empty">Nenhum pedido aguardando atendimento. Quando chegar um novo, ele aparecerá aqui.</div>}
     <button type="button" className="zcc-pane-footer" onClick={()=>ir('pedidos','ativos')}>Ver todos os pedidos ativos →</button>
    </div>
    <div className="zcc-pane zcc-setup">
     <div className="zcc-pane-title"><h4>Sua loja, seu controle</h4></div>
     <p>Personalize banners, produtos e aparência sem misturar essa tarefa com o atendimento.</p>
     <button type="button" onClick={()=>ir('personalizar')}>Personalizar a vitrine ↗</button>
     <button type="button" onClick={()=>ir('configuracoes')}>Ajustar atendimento e configurações ↗</button>
     <small>As alterações só entram em vigor após confirmação de salvamento e publicação no ZenOS.</small>
    </div>
   </div>
   <p className="zcc-data-note">Resumo da lista carregada (até 50 pedidos recentes). O histórico completo não é apagado nem alterado por este painel.</p>
  </div>
  <div hidden={aba!=='pedidos'} className="zcc-screen">
   <div className="zcc-section-head"><div><span className="zcc-eyebrow">ATENDIMENTO</span><h3>Central de pedidos</h3><p>Somente os pedidos ativos aparecem por padrão. Os demais ficam no histórico.</p></div><button type="button" className="zcc-outline" disabled={painelBusy} onClick={onAtualizarPedidos}>{painelBusy?'Atualizando…':'↻ Atualizar'}</button></div>
   <div className="zcc-filters" aria-label="Filtrar pedidos">
    {[['ativos','Ativos',resumo.novos+resumo.atendimento],['recebido','Novos',resumo.novos],['em_atendimento','Em atendimento',resumo.atendimento],['historico','Histórico',resumo.concluidos+resumo.cancelados]].map(([id,nome,n])=><button type="button" key={id} aria-pressed={filtro===id} onClick={()=>setFiltro(id)}>{nome} <span>{n}</span></button>)}
   </div>
   {['historico','encerrado','cancelado'].includes(filtro)&&<div className="zcc-history-filters"><button type="button" aria-pressed={filtro==='historico'} onClick={()=>setFiltro('historico')}>Todos do histórico</button><button type="button" aria-pressed={filtro==='encerrado'} onClick={()=>setFiltro('encerrado')}>Concluídos</button><button type="button" aria-pressed={filtro==='cancelado'} onClick={()=>setFiltro('cancelado')}>Cancelados</button></div>}
   <div className="zcc-search-row">
    <label className="zcc-search">Buscar pedido, cliente ou telefone<input type="search" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Ex.: nome do cliente, número do pedido…" /></label>
    <label className="zcc-date-field">De<input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} /></label>
    <label className="zcc-date-field">Até<input type="date" value={dataFim} min={dataInicio||undefined} onChange={e=>setDataFim(e.target.value)} /></label>
    {(dataInicio||dataFim)&&<button className="zcc-clear-dates" type="button" onClick={()=>{setDataInicio('');setDataFim('');}}>Limpar período</button>}
   </div>
   <div className={'zcc-workspace '+(selecionado?'zcc-workspace--detail':'')}>
    <div className="zcc-pane zcc-list-pane"><div className="zcc-pane-title"><h4>{filtro==='ativos'?'Fila de atendimento':filtro==='historico'?'Histórico':filtro==='recebido'?'Novos pedidos':filtro==='em_atendimento'?'Em atendimento':filtro==='cancelado'?'Cancelados':'Concluídos'}</h4><span>{pedidosFiltrados.length} nesta consulta</span></div>
     <div className="zcc-list">{pedidosPagina.map(p=><button type="button" key={p.id} className={'zcc-order-row '+(pedidoSelecionado===p.id?'zcc-order-row--selected':'')} onClick={()=>setPedidoSelecionado(p.id)} aria-label={'Ver detalhes do pedido '+ID(p.id)}>
      <span className="zcc-order-main"><strong>{p?.cliente?.nome||'Cliente não informado'}</strong><small>#{ID(p.id)} · {momento(p.criadoEm)}</small></span>
      <span className={'zcc-mini-status zcc-mini-status--'+p.status}>{statusTexto[p.status]||'Conferência'}</span>
      <span className="zcc-order-money">{moeda(p.totalCentavos)}<small>{qtos(p)} unidades</small></span><span className="zcc-chevron">›</span>
     </button>)}
     {!pedidosFiltrados.length&&<div className="zcc-empty">{filtro==='ativos'?'Nenhum pedido ativo neste momento.':'Nenhum pedido corresponde ao filtro.'}</div>}</div>
     {pedidosFiltrados.length>PER_PAGE&&<div className="zcc-pagination"><button type="button" disabled={pagina===1} onClick={()=>setPagina(p=>Math.max(1,p-1))}>← Anterior</button><span>Página {pagina} de {Math.ceil(pedidosFiltrados.length/PER_PAGE)}</span><button type="button" disabled={pagina>=Math.ceil(pedidosFiltrados.length/PER_PAGE)} onClick={()=>setPagina(p=>p+1)}>Próxima →</button></div>}
    </div>
    {selecionado&&<div className="zcc-detail-backdrop" onClick={()=>setPedidoSelecionado('')} aria-hidden="true"/>}
    {selecionado&&<aside aria-label="Detalhes do pedido selecionado" className="zcc-detail">
     <div className="zcc-detail-top"><div><span className="zcc-eyebrow">DETALHES DO PEDIDO</span><h4>#{ID(selecionado.id)}</h4></div><button aria-label="Fechar detalhes do pedido" type="button" onClick={()=>setPedidoSelecionado('')}>×</button></div>
     <ZenCommerceOrderCard pedido={selecionado} ocupado={painelBusy} onAbrirPDV={onAtenderPedido} onCancelar={onCancelarPedido}/>
    </aside>}
   </div>
   <p className="zcc-data-note">Pesquisa, filtros e período aplicados aos 50 pedidos mais recentes carregados pelo serviço atual. Pedidos cancelados continuam registrados e disponíveis no histórico, sem modificar estoque nem caixa.</p>
  </div>
  <div hidden={aba!=='clientes'} className="zcc-screen">
   <div className="zcc-section-head"><div><span className="zcc-eyebrow">RELACIONAMENTO</span><h3>Clientes da Loja Online</h3><p>Cadastros voluntários, independentes do módulo financeiro Clientes & Fiado.</p></div><button type="button" className="zcc-outline" disabled={clientesCarregando} onClick={onConsultarClientes}>{clientesCarregando?'Buscando…':'↻ Atualizar clientes'}</button></div>
   {erroClientes&&<p role="alert" className="zcc-error">{erroClientes}</p>}
   <div className="zcc-workspace zcc-clients-workspace">
    <div className="zcc-pane">
     <label className="zcc-search">Buscar cliente ou WhatsApp<input type="search" value={buscaCliente} onChange={e=>setBuscaCliente(e.target.value)} placeholder="Digite o nome ou o telefone…" /></label>
     <div className="zcc-list">{clientesFiltrados.map(c=><button type="button" key={c.id} className={'zcc-client-row '+(clienteSelecionado===c.id?'zcc-order-row--selected':'')} onClick={()=>setClienteSelecionado(c.id)}>
      <span className="zcc-avatar" aria-hidden="true">{String(c.nome||'C').slice(0,1).toUpperCase()}</span><span className="zcc-order-main"><strong>{c.nome||'Cliente sem nome'}</strong><small>{c.telefone||'Contato não informado'}</small></span><span className="zcc-chevron">›</span>
     </button>)}{!clientesFiltrados.length&&<div className="zcc-empty">{clientesCarregando?'Consultando clientes…':'Nenhum cadastro encontrado nesta consulta.'}</div>}</div>
    </div>
    {cliente&&<aside className="zcc-pane zcc-client-detail" aria-label="Detalhes do cliente"><div className="zcc-detail-top"><h4>Cadastro online</h4><button type="button" onClick={()=>setClienteSelecionado('')} aria-label="Fechar cadastro">×</button></div>
     <div className="zcc-customer-name">{cliente.nome}</div><dl><dt>WhatsApp informado</dt><dd>{cliente.telefone}</dd><dt>Último pedido associado</dt><dd>#{ID(cliente.ultimoPedido)}</dd><dt>Contato promocional</dt><dd>{cliente.marketingStatus==='pendente_verificacao'?'Solicitado — aguardando verificação':cliente.marketingStatus==='nao_autorizado'?'Não autorizado':'Requer conferência'}</dd></dl>
     <p>Contatos ainda não verificados não podem receber campanhas. A loja online não altera os limites e saldos do Clientes & Fiado.</p>
    </aside>}
   </div>
   <p className="zcc-data-note">Até 50 cadastros recentes. O consentimento informado não habilita envio de campanhas sem verificação do titular e opção de descadastro.</p>
  </div>
  <div hidden={aba!=='personalizar'} className="zcc-screen zcc-editor">
   <div className="zcc-section-head"><div><span className="zcc-eyebrow">SUA VITRINE DIGITAL</span><h3>Personalizar minha loja</h3><p>Edite banners, produtos e identidade visual com prévia ao vivo.</p></div></div>
   <div className="zcc-editor-mount">{editor}</div>
  </div>
  <div hidden={aba!=='configuracoes'} className="zcc-screen">
   <div className="zcc-section-head"><div><span className="zcc-eyebrow">CONTROLE DA LOJA</span><h3>Configurações e atendimento</h3><p>Seu lojista configura uma vez; o ZenOS faz o restante.</p></div></div>
   <div className="zcc-pane zcc-configs">
    <label>WhatsApp comercial da loja com código do país<input type="tel" maxLength={25} placeholder="+55 ou +595…" value={whatsapp} onChange={e=>onWhatsappChange(e.target.value)}/></label>
    <p>O número será utilizado na comunicação com o consumidor. Para confirmar alterações, use o fluxo de publicação no editor da vitrine.</p>
    <div className="zcc-config-row"><span><strong>Publicação da vitrine</strong><small>{lojaPublicada?'Sua loja está publicada. Os pedidos continuam disponíveis mesmo que você a retire do ar.':'Sua loja ainda não está publicada.'}</small></span><span className={'zcc-store-state '+(lojaPublicada?'zcc-store-state--on':'')}>{noAr(lojaPublicada)}</span></div>
    {lojaPublicada&&<button type="button" disabled={painelBusy} className="zcc-danger-action" onClick={onRetirarLoja}>Retirar loja do ar</button>}
    <button type="button" className="zcc-outline" onClick={()=>ir('personalizar')}>Abrir personalização e publicação →</button>
   </div>
  </div>
 </section>;
}
