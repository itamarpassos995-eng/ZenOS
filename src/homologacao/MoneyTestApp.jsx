import React, { useEffect, useMemo, useState } from 'react';
import Produtos from '../components/Produtos.jsx';
import PDV from '../components/PDV.jsx';
import { ZenNavigationLayout } from '../components/ZenVisualLayout.jsx';
import { traducoes, normalizarProduto } from '../data.js';
import { money, formatMoney, parseMoneyInput, compare, quantize, currencyScale } from '../core/money.js';
import { bridgeConvert, legacyDecimal, productMoneyForm, saveProductMoney, projectProductMoney, formatProductMoney,
  productMargin, priceFromMargin, decorateMoneySale, moneyInputText } from '../core/moneyProductBridge.js';
import { createMoneyTestStore, MONEY_TEST_TENANT, MONEY_TEST_KEY } from './moneyTestStore.js';
import { chaveRascunhoPDV } from '../core/pdvDraft.js';
import { runtimeStorageKey } from './firebaseDisabled.js';
import { gerarPdfComprovante } from '../core/zenReceiptPdf.js';
import { exchangeFromOperatorInputs, operatorInputsFromRates, displayOperatorInputs } from '../core/exchangeOperatorConfig.js';
import '../index.css';
import '../zenos-dashboard.css';

const operator = { id:'admin',nome:'Administrador de teste',patente:'gerencia',permissoes:{admin:true,produtos:true,pdv:true} };
const profile = { nomeFantasia:'ZenOS — Homologação multimoeda',mostrarLogoRecibo:false,rodapeRecibo:'HOMOLOGAÇÃO — DADOS FICTÍCIOS — SEM VALIDADE COMERCIAL' };
const locales = { pt:'pt-BR',es:'es-PY',en:'en-US' };
export default function MoneyTestApp() {
  const store = useMemo(() => createMoneyTestStore(window.localStorage,
    navigator.locks?.request ? (key,task)=>navigator.locks.request(key,task) : null), []);
  const [state,setState] = useState(()=>store.read());
  const [screen,setScreen] = useState('produtos');
  const readDraft=()=>{try{return JSON.parse(localStorage.getItem(runtimeStorageKey(chaveRascunhoPDV(MONEY_TEST_TENANT,'admin')))||'null');}catch{return null;}};
  const [currency,setCurrency] = useState(()=>readDraft()?.moneyOperationCurrency||store.read().moedaPadrao);
  const [language,setLanguage] = useState('pt');
  const [notice,setNotice] = useState('');
  const [ratesOpen,setRatesOpen] = useState(false);
  const [draftRates,setDraftRates] = useState({});
  const [theme,setTheme] = useState('dark');
  const locale = locales[language];
  const tx = (pt,es,en) => language === 'es' ? es || pt : language === 'en' ? en || pt : pt;
  const t = key => traducoes[language]?.[key] || traducoes.pt[key] || key;
  useEffect(()=>store.subscribe(setState),[store]);
  useEffect(()=>{
    const onStorage = e => { if(e.key === MONEY_TEST_KEY) { store.publish(); setNotice('Dados de teste atualizados por outra aba. Confira antes de salvar.'); } };
    window.addEventListener('storage',onStorage); return()=>window.removeEventListener('storage',onStorage);
  },[store]);
  const at = () => new Date().toISOString();
  const pendingDraft=readDraft();
  const activeRates=pendingDraft?.itensVenda?.length&&pendingDraft.moneyOperationRates?pendingDraft.moneyOperationRates:state.rates;
  const changeCurrency = next => {
    // An in-progress POS is a commercial operation; do not reinterpret its text.
    const raw = localStorage.getItem(runtimeStorageKey(chaveRascunhoPDV(MONEY_TEST_TENANT,'admin')));
    if(raw && JSON.parse(raw)?.itensVenda?.length) return setNotice('Conclua ou limpe o atendimento antes de trocar a moeda de operação nesta homologação.');
    setCurrency(next);
  };
  const convert = (value,to) => bridgeConvert(value,to,activeRates,at()).value;
  const fromBRL = (value,to=currency) => Number(convert(money(legacyDecimal(value),'BRL','legacy-ui-display'),to).amount);
  const toBRL = (value,from=currency) => Number(convert(money(legacyDecimal(value),from,'legacy-ui-input'),'BRL').amount);
  const fmt = (value,code=currency) => formatMoney(convert(money(legacyDecimal(value),'BRL','legacy-ui-display'),code),{locale,currencyDisplay:'symbol'});
  const context = {
    isolated:true,
    symbol:code=>({BRL:"R$",PYG:"₲",USD:"US$",EUR:"€"}[code]),
    getOperationalSnapshot:async()=>({exists:()=>true,data:()=>store.read()}),
    priceInput:(value,code)=>moneyInputText(quantize(convert(money(legacyDecimal(value),'BRL','pos-price-text'),code),currencyScale(code)).value,locale),
    form:product=>productMoneyForm(product,{defaultCurrency:currency,viewCurrency:currency,locale,rates:state.rates,at:at()}),
    save:(product,form)=>saveProductMoney(product,form,{tenantId:MONEY_TEST_TENANT,actor:'admin',locale,rates:state.rates,at:at()}),
    display:(product,field,code)=>product.moneyPrices ? formatProductMoney(product,field,code,state.rates,locale,at(),{currencyDisplay:"symbol"}) : tx('Conferir moeda','Revisar moneda','Review currency'),
    margin:product=>productMargin(product,state.rates,at()),
    marginFromPrice:(costText,priceText,form)=>{
      try { return productMargin({moneyPrices:{values:{cost:parseMoneyInput(String(costText||'0'),form.moneyCostCurrency,{locale,source:'form-cost'}),
        sale:parseMoneyInput(String(priceText||'0'),form.moneyPriceCurrency,{locale,source:'form-price'})}}},state.rates,at()); }
      catch{return '';}
    },
    priceFromMargin:(cost,margin,form)=>priceFromMargin(cost,margin,form,{locale,rates:state.rates,at:at()}),
    parsePrice:(text,code)=>{const original=parseMoneyInput(text,code,{locale,source:'pos-price-input'});return{original,brl:Number(convert(original,'BRL').amount)};},
    decorateSale:(sale,options)=>decorateMoneySale(sale,{...options,rates:activeRates,locale,
      resolvePaymentAccount:p=>`synthetic-account:${p.formaId}:${p.moedaOrigem}`,changeAccountId:'synthetic-drawer'}),
    formatTotal:sale=>formatMoney(convert(sale.moneySnapshot.total,currency),{locale,currencyDisplay:"symbol"}),
    formatPayment:p=>formatMoney(convert(money(legacyDecimal(p.valorOriginal),p.moedaOrigem,'saved-payment'),currency),{locale,currencyDisplay:'symbol'}),
    receiptItem:(item,sale,field)=>{const line=sale.moneySnapshot.items.find(i=>i.id===String(item.id));return line?formatMoney(convert(line[field],currency),{locale,currencyDisplay:"symbol"}):'—';},
  };
  const commit = operation => store.commit(operation,state.revision);
  const products = state.produtos.map(normalizarProduto);
  const posProducts = products.filter(p=>p.moneyPrices&&p.ativo!==false).map(p=>projectProductMoney(p,state.rates,at()));
  const refresh = () => setState(store.read());
  const saveDefault = async()=>{
    try { await store.configure({moedaPadrao:currency},state.revision); setNotice('Moeda predeterminada salva somente nos dados de teste. Cadastros existentes preservados.'); }
    catch(e){setNotice(e.message);}
  };
  const saveRates = async()=>{
    if(readDraft()?.itensVenda?.length) return setNotice('Conclua ou limpe o atendimento antes de alterar o câmbio nesta homologação.');
    try {
      const exchange=exchangeFromOperatorInputs(draftRates);
      await store.configure({rates:exchange.rates,exchangeInputs:exchange.inputs},state.revision); setRatesOpen(false);setNotice('Câmbio de teste salvo. Valores originais e documentos anteriores preservados.');
    }catch(e){setNotice(e.message);}
  };
  const downloadReceipt=async sale=>{
    const pdf=await gerarPdfComprovante(sale,profile);
    const href=URL.createObjectURL(pdf.blob),a=document.createElement('a');a.href=href;a.download=pdf.nome;a.click();setTimeout(()=>URL.revokeObjectURL(href),5000);
  };
  const nav=[{id:'test',titulo:'Homologação',icone:'🧪',abertaInicial:true,itens:[
    {id:'produtos',tela:'produtos',icone:'📦',rotulo:tx('Produtos & Estoque','Productos y Stock','Products & Stock'),onClick:()=>setScreen('produtos')},
    {id:'pdv',tela:'pdv',icone:'🛒',rotulo:tx('PDV Balcão','Punto de venta','POS'),onClick:()=>setScreen('pdv')},
    {id:'historico',tela:'historico',icone:'📑',rotulo:tx('Vendas de teste','Ventas de prueba','Test sales'),onClick:()=>setScreen('historico')},
  ]}];
  return <div className={"zenos-app theme-"+theme} data-theme={theme} style={{minHeight:'100vh',background:'#020b19',color:'#e2e8f0'}}>
    <ZenNavigationLayout sidebarProps={{ecraAtual:screen,grupos:nav,perfilLoja:profile,userId:MONEY_TEST_TENANT,
      usuarioAutenticado:'dados-ficticios@teste.local',patenteUsuario:'gerencia',onHome:()=>setScreen('produtos'),onEditarPerfil:()=>setNotice('Empresa fictícia exclusiva de homologação.'),onSair:()=>setNotice('Esta é uma sessão local de teste, sem conta real conectada.'),tx}}
      topbarProps={{status:'OFFLINE',statusTitle:'Homologação: dados locais neste navegador, sem conexão com serviços reais',idioma:language,setIdioma:setLanguage,
        moeda:currency,setMoeda:changeCurrency,moedaPadrao:state.moedaPadrao,onSalvarMoedaPadrao:saveDefault,
        onCambio:()=>{setDraftRates(displayOperatorInputs(state.exchangeInputs||operatorInputsFromRates(state.rates)));setRatesOpen(true);},operador:operator.nome,patente:'gerencia',tema:theme,onAlternarTema:()=>setTheme(theme==='dark'?'light':'dark'),onTrocarOperador:()=>setNotice('Nesta homologação existe somente o administrador fictício.'),tx}}>
      <div style={{margin:'16px 28px',padding:14,border:'1px solid #b7791f',borderRadius:10,background:'#33220b',fontSize:13,lineHeight:1.6}}>
        <strong>HOMOLOGAÇÃO MULTIMOEDA — DADOS FICTÍCIOS</strong><br/>
        Cadastro, edição, preços, PDV à vista/cartão e comprovantes. Dados salvos somente neste navegador. Sem Firebase, serviços externos ou contas de clientes.
        Fiado, compras, fiscal, Commerce, recorrências e demais módulos ainda não estão liberados nesta versão. Use apenas dados de teste.
      </div>
      {notice&&<div role="status" style={{margin:'8px 28px',padding:12,background:'#103047',borderRadius:8}}>{notice}<button onClick={()=>setNotice('')} aria-label="Fechar aviso" style={{float:'right'}}>✕</button></div>}
      <main style={{padding:'0 28px 28px'}}>
        {screen==='produtos'&&<Produtos moneyContext={context} produtos={products} setProdutos={refresh} moeda={currency} fmt={fmt} t={t} tx={tx}
          userId={MONEY_TEST_TENANT} operadorAtivo={operator} patenteUsuario="gerencia" planoLoja="premium" commitOperacaoNegocio={commit}
          historicoVendas={state.historicoVendas} regrasDesconto={{}} vendedores={[operator]}/>}
        {screen==='pdv'&&<PDV moneyContext={context} perfilLoja={profile} taxasCambio={activeRates} commitVendaCritica={commit}
          recarregarDadosPDV={async()=>refresh()} userId={MONEY_TEST_TENANT} produtos={posProducts} setProdutos={refresh}
          clientes={[]} setClientes={refresh} moeda={currency} fmt={fmt} t={t} tx={tx} converterDeBRL={fromBRL} converterParaBRL={toBRL}
          historicoVendas={state.historicoVendas} setHistoricoVendas={refresh} patenteUsuario="gerencia" idioma={language}
          regrasDesconto={{margemMinima:0,margemIdeal:0,exigirSenhaVermelho:false}} vendedores={[operator]} operadorAtivo={operator}
          sessaoAtiva={state.sessoesCaixa[0]} vouchers={[]} setVouchers={refresh}/>}
        {screen==='historico'&&<section><h1>Vendas de teste</h1><p>Exibição na moeda selecionada. Documentos originais preservados.</p>
          {!state.historicoVendas.length?<p>Nenhuma venda de teste salva.</p>:<table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>Documento</th><th>Moeda</th><th>Total</th><th>CMV registrado</th><th>Resultado</th><th>Comprovante</th></tr></thead>
            <tbody>{state.historicoVendas.map(sale=><tr key={sale.id} style={{borderBottom:'1px solid #334155',height:60}}><td>{sale.id}</td><td>{currency}</td><td>{formatMoney(convert(sale.moneySnapshot.total,currency),{locale,currencyDisplay:"symbol"})}</td><td>{formatMoney(convert(sale.moneySnapshot.cmv,currency),{locale,currencyDisplay:"symbol"})}</td><td>{formatMoney(convert(sale.moneySnapshot.profit,currency),{locale,currencyDisplay:"symbol"})}</td><td><button onClick={()=>downloadReceipt(sale)}>Baixar PDF</button></td></tr>)}</tbody></table>}
        </section>}
      </main>
    </ZenNavigationLayout>
    {ratesOpen&&<div role="dialog" aria-label="Câmbio de teste" style={{position:'fixed',inset:0,zIndex:30000,background:'#000b',display:'grid',placeItems:'center'}}><div style={{padding:28,borderRadius:20,background:'#0b1120',border:'1px solid #6366f1',width:'min(440px,90vw)'}}><h2>{tx('Cotações do dia','Cotizaciones del día','Exchange rates')}</h2>
      {['USD','EUR','PYG'].map(c=><label key={c} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,margin:'14px 0',padding:14,border:'1px solid #334155',borderRadius:12,background:'#020617'}}><span>{c==='USD'?'1 Dólar (USD) =':c==='EUR'?'1 Euro (EUR) =':'1 Real (BRL) ='}</span><span style={{display:'flex',alignItems:'center',gap:8}}>{c!=='PYG'&&'R$'}<input aria-label={'Cotação '+c} type="text" inputMode="decimal" value={draftRates[c]} onChange={e=>setDraftRates({...draftRates,[c]:e.target.value})} style={{background:'#0b1120',color:c==='PYG'?'#38bdf8':'#34d399',border:'1px solid #334155',borderRadius:8,padding:10,width:100,textAlign:'right',fontWeight:900}}/>{c==='PYG'&&'₲'}</span></label>)}
      <div style={{display:'flex',gap:12}}><button onClick={saveRates} style={{flex:1,padding:14,border:0,borderRadius:10,background:'#4f46e5',color:'#fff',fontWeight:800}}>{tx('Salvar câmbio de teste','Guardar cambio de prueba','Save test exchange rates')}</button> <button onClick={()=>setRatesOpen(false)} style={{padding:12}}>{tx('Cancelar','Cancelar','Cancel')}</button></div></div></div>}
  </div>;
}
